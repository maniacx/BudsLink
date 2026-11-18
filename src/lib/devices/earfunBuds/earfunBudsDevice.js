'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier} from '../logger.js';
import {
    buds2to1BatteryLevel, validateProperties, launchConfigureWindow, SppUUid
} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {getBluezDeviceProxy} from '../../bluezDeviceProxy.js';
import {EarfunBudsSocket} from './earfunBudsSocket.js';
import {
    DeviceTypeEarfunBuds, EarfunVendorUuid, EarfunModels, AmbientMode, TransparencyMode,
    Codec, MicMode, TouchMode, AdvancedAudio, FindDevice, DeviceNameMaxBytes, InEarMask, GestureType, GestureActions, CallActions, EqPresets,
    ancValueToSettings, ancSettingsToValue
} from './earfunBudsConfig.js';

export {DeviceTypeEarfunBuds};

const SettingsKey = 'earfun-buds-list';

// Toggle buttons in panel order: Noise Cancellation, Off, Transparency
const ToggleAmbientModes = [AmbientMode.ANC, AmbientMode.OFF, AmbientMode.TRANSPARENCY];

// Radio buttons of the options boxes in panel order
const AncTypes = ['ear', 'env', 'manual', 'wind'];
const TransparencyModes = [TransparencyMode.STANDARD, TransparencyMode.NATURAL];

const GestureNames = ['single', 'double', 'triple', 'long'];
const Sides = ['left', 'right'];

// Defaults match the factory settings of the earbuds
const DefaultGestures = {
    'single-left': GestureActions.VOLUME_DOWN,
    'single-right': GestureActions.VOLUME_UP,
    'double-left': GestureActions.PLAY_PAUSE,
    'double-right': GestureActions.PLAY_PAUSE,
    'triple-left': GestureActions.PREVIOUS,
    'triple-right': GestureActions.NEXT,
    'long-left': GestureActions.NOISE_CONTROL,
    'long-right': GestureActions.VOICE_ASSISTANT,
    'calllong-left': CallActions.REJECT,
    'calllong-right': CallActions.REJECT,
};

function findModel(name) {
    return EarfunModels.find(m => m.pattern.test(name)) ?? null;
}

export function isEarfunBuds(bluezDeviceProxy, uuids) {
    const bluezProps = ['Name'];
    const lower = uuids.map(u => u.toLowerCase());
    if (!lower.includes(SppUUid) || !lower.includes(EarfunVendorUuid))
        return {supported: 'no', bluezProps};

    const name = bluezDeviceProxy.Name;
    if (!name)
        return {supported: 'pending', bluezProps};

    return {supported: findModel(name) ? 'yes' : 'no', bluezProps};
}

// Bits that are not understood (0x0C unless the whole function is turned off) are kept as
// the earbuds reported them
function inEarMaskFromSettings(items, deviceMask) {
    let mask = deviceMask ?? 0;
    mask = items['auto-play-pause'] ? mask & ~InEarMask.DISABLE_AUTO_PLAY :
        mask | InEarMask.DISABLE_AUTO_PLAY;
    mask = items['auto-answer'] ? mask & ~InEarMask.DISABLE_AUTO_ANSWER :
        mask | InEarMask.DISABLE_AUTO_ANSWER;
    mask = items['high-sensitivity'] ? mask | InEarMask.HIGH_SENSITIVITY :
        mask & ~InEarMask.HIGH_SENSITIVITY;

    if (!items['in-ear'])
        mask |= InEarMask.DISABLE_ALL;
    else if ((deviceMask & InEarMask.DISABLE_ALL) === InEarMask.DISABLE_ALL)
        mask &= ~(InEarMask.DISABLE_ALL & ~InEarMask.DISABLE_AUTO_PLAY &
            ~InEarMask.DISABLE_AUTO_ANSWER);

    return mask;
}

function inEarSettingsFromMask(mask) {
    const detection = (mask & InEarMask.DISABLE_ALL) !== InEarMask.DISABLE_ALL;
    return {
        'in-ear': detection,
        'auto-play-pause': !(mask & InEarMask.DISABLE_AUTO_PLAY),
        'auto-answer': !(mask & InEarMask.DISABLE_AUTO_ANSWER),
        'high-sensitivity': !!(mask & InEarMask.HIGH_SENSITIVITY),
    };
}

export const EarfunBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_EarfunBudsDevice',
}, class EarfunBudsDevice extends GObject.Object {
    _init(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super._init();
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`EarfunBudsDevice-${identifier}`);
        this._log.info('------------------- EarfunBudsDevice init -------------------');
        this._settings = settings;
        this._devicePath = devicePath;
        this._alias = alias;
        this._extPath = extPath;
        this.updateDeviceMapCb = updateDeviceMapCb;
        this._ignoreGsettingsChange = false;
        this._fwVersion = '';

        this._config = createConfig();
        this._props = createProperties();
        this._deviceState = {};

        const name = getBluezDeviceProxy(devicePath).Name ?? '';
        this._modelData = findModel(name) ?? EarfunModels[0];
        this._log.info(`Model: ${this._modelData.name}`);

        this._initSettings();
        this._updateIcons();
        this._setupPanelConfig();

        this._callbacks = {
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateFirmware: this.updateFirmware.bind(this),
            updateSerial: this.updateSerial.bind(this),
            updateAmbientMode: this.updateAmbientMode.bind(this),
            updateAncMode: this.updateAncMode.bind(this),
            updateTransparencyMode: this.updateTransparencyMode.bind(this),
            updateGameMode: this.updateGameMode.bind(this),
            updateInEarMask: this.updateInEarMask.bind(this),
            updateTouchMode: this.updateTouchMode.bind(this),
            updateGestures: this.updateGestures.bind(this),
            updateMultipoint: this.updateMultipoint.bind(this),
            updateCodec: this.updateCodec.bind(this),
            updateMicMode: this.updateMicMode.bind(this),
            updateVoicePromptVolume: this.updateVoicePromptVolume.bind(this),
            updateVolumeLimit: this.updateVolumeLimit.bind(this),
            updateBalance: this.updateBalance.bind(this),
            updateFindDevice: this.updateFindDevice.bind(this),
            updateAdvancedAudio: this.updateAdvancedAudio.bind(this),
        };

        const profile = {type: DeviceTypeEarfunBuds, uuid: SppUUid};
        this._socket = new EarfunBudsSocket(this._devicePath, profileManager, profile,
            this._callbacks);
    }

    _initSettings() {
        const m = this._modelData;
        const defaults = {
            path: this._devicePath,
            modelId: m.name,
            alias: this._alias,
            icon: m.budsIcon,
            case: m.case,
            fw: this._fwVersion,
            'serial-left': '',
            'serial-right': '',
            'ambient-mode': AmbientMode.OFF,
            'anc-type': 'ear',
            'anc-level': 3,
            'transparency-mode': TransparencyMode.STANDARD,
            'game-mode': false,
            'in-ear': true,
            'auto-play-pause': true,
            'auto-answer': true,
            'high-sensitivity': false,
            'touch-mode': TouchMode.BOTH,
            'mic-mode': MicMode.AUTO,
            'voice-prompt': 2,
            'volume-limit': 0,
            balance: 50,
            multipoint: true,
            codec: Codec.APTX,
            'advanced-audio': AdvancedAudio.FAST_PAIR,
            'find-device': FindDevice.OFF,
            'battery-left': 0,
            'battery-right': 0,
            'battery-case': 0,
            'name-request': {seq: 0, name: ''},
            'eq-mode': 'preset',
            'eq-preset': 0,
            'eq-custom': new Array(10).fill(0),
            ...Object.fromEntries(Object.entries(DefaultGestures).map(
                ([key, action]) => [`gesture-${key}`, action])),
        };
        this._defaultsDeviceSettings = defaults;

        const devicesList = this._settings.get_strv(SettingsKey).map(JSON.parse);
        if (!devicesList.some(d => d.path === this._devicePath)) {
            devicesList.push(defaults);
            this._settings.set_strv(SettingsKey, devicesList.map(JSON.stringify));
        } else {
            validateProperties(this._settings, SettingsKey, devicesList, defaults,
                this._devicePath);
        }

        this._settingsItems = this._readSettingsItems();
        this._commonIcon = this._settingsItems['icon'];
        this._caseIcon = this._settingsItems['case'];
        this._lastEqGains = this._eqGains(this._settingsItems);
        this._nameRequestSeq = this._settingsItems['name-request']?.seq ?? 0;

        this._settingsHandlerId = this._settings.connect(`changed::${SettingsKey}`, () => {
            if (!this._ignoreGsettingsChange)
                this._onGsettingsChanged();
        });
    }

    _readSettingsItems() {
        const devicesList = this._settings.get_strv(SettingsKey).map(JSON.parse);
        return devicesList.find(d => d.path === this._devicePath) ?? null;
    }

    _writeSettings(values) {
        if (!this._settingsItems)
            return;

        const changed = Object.entries(values).filter(([k, v]) =>
            JSON.stringify(this._settingsItems[k]) !== JSON.stringify(v));
        if (changed.length === 0)
            return;

        for (const [k, v] of changed)
            this._settingsItems[k] = v;

        this._ignoreGsettingsChange = true;
        const devicesList = this._settings.get_strv(SettingsKey).map(JSON.parse);
        const index = devicesList.findIndex(d => d.path === this._devicePath);
        if (index !== -1) {
            devicesList[index] = this._settingsItems;
            this._settings.set_strv(SettingsKey, devicesList.map(JSON.stringify));
        }
        this._ignoreGsettingsChange = false;
    }

    // A value reported by the earbuds: remember it as the state of the device and show it
    _reported(values) {
        Object.assign(this._deviceState, values);
        this._writeSettings(values);
        this._syncPanelOptions();
    }

    // Sends the settings that differ from what the earbuds reported
    _onGsettingsChanged() {
        const items = this._readSettingsItems();
        if (!items)
            return;
        this._settingsItems = items;

        if (items['icon'] !== this._commonIcon || items['case'] !== this._caseIcon) {
            this._commonIcon = items['icon'];
            this._caseIcon = items['case'];
            this._updateIcons();
        }

        const state = this._deviceState;
        const socket = this._socket;
        const differs = key => state[key] !== undefined && items[key] !== state[key];

        if (differs('ambient-mode')) {
            state['ambient-mode'] = items['ambient-mode'];
            socket?.setAmbientMode(items['ambient-mode']);
        }

        if (differs('anc-type') || differs('anc-level')) {
            state['anc-type'] = items['anc-type'];
            state['anc-level'] = items['anc-level'];
            socket?.setAncMode(ancSettingsToValue(items['anc-type'], items['anc-level']));
        }

        const simple = [
            ['transparency-mode', value => socket?.setTransparencyMode(value)],
            ['game-mode', value => socket?.setGameMode(value)],
            ['touch-mode', value => socket?.setTouchMode(value)],
            ['mic-mode', value => socket?.setMicMode(value)],
            ['voice-prompt', value => socket?.setVoicePromptVolume(value)],
            ['volume-limit', value => socket?.setVolumeLimit(value)],
            ['balance', value => socket?.setBalance(value)],
            ['multipoint', value => socket?.setMultipoint(value)],
            ['codec', value => socket?.setCodec(value)],
            ['advanced-audio', value => socket?.setAdvancedAudio(value)],
            ['find-device', value => socket?.setFindDevice(value)],
        ];
        for (const [key, setter] of simple) {
            if (differs(key)) {
                state[key] = items[key];
                setter(items[key]);
            }
        }

        this._handleNameRequest(items['name-request']);

        const mask = inEarMaskFromSettings(items, state['in-ear-mask']);
        if (state['in-ear-mask'] !== undefined && mask !== state['in-ear-mask']) {
            state['in-ear-mask'] = mask;
            socket?.setInEarMask(mask);
        }

        for (const side of Sides) {
            for (const name of [...GestureNames, 'calllong']) {
                const key = `gesture-${name}-${side}`;
                if (differs(key)) {
                    state[key] = items[key];
                    const type = name === 'calllong' ? GestureType.callLong : GestureType[name];
                    socket?.setTouchAction(type, side, items[key]);
                }
            }
        }

        this._syncEqualizer(items);
        this._syncPanelOptions();
    }

    // The configure window asks for a new name with a counter, so that the same name can be
    // requested again
    _handleNameRequest(request) {
        if (!request || request.seq === this._nameRequestSeq)
            return;

        this._nameRequestSeq = request.seq;
        const name = (request.name ?? '').trim();
        if (name === '' || new TextEncoder().encode(name).length > DeviceNameMaxBytes)
            return;

        this._log.info('Sending new device name');
        this._socket?.setDeviceName(name);
    }

    _eqGains(items) {
        if (items['eq-mode'] === 'custom')
            return items['eq-custom'];

        return (EqPresets[items['eq-preset']] ?? EqPresets[0])[1];
    }

    // Sliders produce many changes while dragging; only the last one is sent
    _syncEqualizer(items) {
        const gains = this._eqGains(items);
        if (JSON.stringify(gains) === JSON.stringify(this._lastEqGains))
            return;

        this._lastEqGains = gains;
        if (this._eqTimeoutId)
            GLib.source_remove(this._eqTimeoutId);

        this._eqTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            this._eqTimeoutId = null;
            this._socket?.setEqualizer(gains);
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateIcons() {
        this._config.commonIcon = this._commonIcon;
        this._config.albumArtIcon = this._commonIcon;
        this._config.battery1ShowOnDisconnect = true;
        this._config.showSettingsButton = true;

        this._config.battery1Icon = `${this._commonIcon}-left`;
        this._config.battery2Icon = `${this._commonIcon}-right`;
        this._config.battery3Icon = this._caseIcon;
        this._config.battery2ShowOnDisconnect = true;

        this.dataHandler?.setConfig(this._config);
    }

    _setupPanelConfig() {
        const labels = [_('Noise Cancellation'), _('Off'), _('Transparency')];
        const icons = ['bbm-anc-on-symbolic', 'bbm-anc-off-symbolic', 'bbm-transperancy-symbolic'];

        this._config.toggle1Title = _('Noise Control');
        labels.forEach((label, index) => {
            this._config[`toggle1Button${index + 1}Name`] = label;
            this._config[`toggle1Button${index + 1}Icon`] = icons[index];
        });
        this._props.toggle1Visible = true;

        this._config.optionsBox1 = ['radio-button'];
        this._config.box1RadioTitle = _('Noise Cancellation Type');
        this._config.box1RadioButton = [
            _('Adaptive (Ear Canal)'), _('Adaptive (Environment)'), _('Manual'),
            _('Wind Noise Reduction'),
        ];

        this._config.optionsBox2 = ['radio-button'];
        this._config.box2RadioTitle = _('Transparency Type');
        this._config.box2RadioButton = [_('Standard'), _('Natural')];
    }

    _syncPanelOptions() {
        const items = this._settingsItems;
        const props = this._props;
        const ambient = items['ambient-mode'];

        props.toggle1State = ToggleAmbientModes.indexOf(ambient) + 1;
        props.box1RadioButtonState = AncTypes.indexOf(items['anc-type']) + 1;
        props.box2RadioButtonState = TransparencyModes.indexOf(items['transparency-mode']) + 1;

        if (ambient === AmbientMode.ANC)
            props.optionsBoxVisible = 1;
        else if (ambient === AmbientMode.TRANSPARENCY)
            props.optionsBoxVisible = 2;
        else
            props.optionsBoxVisible = 0;

        this.dataHandler?.setProps(props);
    }

    _startConfiguration() {
        this.dataHandler = new DataHandler(this._config, this._props);
        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect('ui-action', (_o, command, value) => {
            if (command === 'toggle1State')
                this._toggle1ButtonClicked(value);

            if (command === 'box1RadioButtonState')
                this._ancTypeClicked(value);

            if (command === 'box2RadioButtonState')
                this._transparencyTypeClicked(value);

            if (command === 'settingsButtonClicked')
                launchConfigureWindow(this._devicePath, DeviceTypeEarfunBuds);
        });
    }

    _toggle1ButtonClicked(index) {
        const ambient = ToggleAmbientModes[index - 1];
        if (ambient === undefined)
            return;

        this._writeSettings({'ambient-mode': ambient});
        this._onGsettingsChanged();
    }

    _ancTypeClicked(index) {
        const type = AncTypes[index - 1];
        if (!type)
            return;

        this._writeSettings({'anc-type': type});
        this._onGsettingsChanged();
    }

    _transparencyTypeClicked(index) {
        const mode = TransparencyModes[index - 1];
        if (mode === undefined)
            return;

        this._writeSettings({'transparency-mode': mode});
        this._onGsettingsChanged();
    }

    updateBatteryProps(props) {
        if (Object.entries(props).every(([k, v]) => this._props[k] === v))
            return;

        this._props = {...this._props, ...props};
        this._props.computedBatteryLevel = buds2to1BatteryLevel(this._props);

        // The configure window shows the levels
        this._writeSettings({
            'battery-left': this._props.battery1Level,
            'battery-right': this._props.battery2Level,
            'battery-case': this._props.battery3Level,
        });

        if (!this.dataHandler)
            this._startConfiguration();
        else
            this.dataHandler.setProps(this._props);
    }

    updateFirmware(fwVersion) {
        if (this._fwVersion !== fwVersion) {
            this._fwVersion = fwVersion;
            this._writeSettings({fw: fwVersion});
        }
    }

    updateSerial(side, serial) {
        const text = serial.replace(/\0/g, '').trim();
        if (text !== '')
            this._writeSettings({[`serial-${side}`]: text});
    }

    updateAmbientMode(mode) {
        if (!ToggleAmbientModes.includes(mode))
            return;

        this._reported({'ambient-mode': mode});
    }

    updateAncMode(value) {
        const parsed = ancValueToSettings(value);
        if (!parsed)
            return;

        const values = {'anc-type': parsed.type};
        if (parsed.level)
            values['anc-level'] = parsed.level;
        else
            values['anc-level'] = this._settingsItems['anc-level'];

        this._reported(values);
    }

    updateTransparencyMode(mode) {
        if (TransparencyModes.includes(mode))
            this._reported({'transparency-mode': mode});
    }

    updateGameMode(enabled) {
        this._reported({'game-mode': enabled});
    }

    updateInEarMask(mask) {
        this._deviceState['in-ear-mask'] = mask;
        this._reported(inEarSettingsFromMask(mask));
    }

    updateTouchMode(mode) {
        if (Object.values(TouchMode).includes(mode))
            this._reported({'touch-mode': mode});
    }

    updateGestures(actions) {
        const values = {};
        for (const [name, action] of Object.entries(actions)) {
            const key = `gesture-${name}`;
            if (key in this._defaultsDeviceSettings)
                values[key] = action;
        }
        this._reported(values);
    }

    updateMultipoint(enabled) {
        this._reported({multipoint: enabled});
    }

    updateCodec(value) {
        if (Object.values(Codec).includes(value))
            this._reported({codec: value});
    }

    updateMicMode(mode) {
        if (Object.values(MicMode).includes(mode))
            this._reported({'mic-mode': mode});
    }

    updateVoicePromptVolume(value) {
        this._reported({'voice-prompt': Math.min(value, 4)});
    }

    updateVolumeLimit(step) {
        this._reported({'volume-limit': Math.min(step, 5)});
    }

    updateFindDevice(mode) {
        if (Object.values(FindDevice).includes(mode))
            this._reported({'find-device': mode});
    }

    updateAdvancedAudio(mode) {
        if (Object.values(AdvancedAudio).includes(mode))
            this._reported({'advanced-audio': mode});
    }

    updateBalance(value) {
        this._reported({balance: Math.min(value, 100)});
    }

    destroy() {
        if (this._eqTimeoutId)
            GLib.source_remove(this._eqTimeoutId);
        this._eqTimeoutId = null;

        this._socket?.destroy();
        this._socket = null;

        if (this._dataHandlerId)
            this.dataHandler?.disconnect(this._dataHandlerId);
        this._dataHandlerId = null;
        this.dataHandler = null;

        if (this._settingsHandlerId)
            this._settings?.disconnect(this._settingsHandlerId);
        this._settingsHandlerId = null;
        this._settings = null;
    }
});
