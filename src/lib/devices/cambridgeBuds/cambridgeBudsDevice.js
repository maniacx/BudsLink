'use strict';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {
    buds2to1BatteryLevel, validateProperties, launchConfigureWindow, SppUUidType, SppUUid
} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {getBluezDeviceProxy} from '../../bluezDeviceProxy.js';
import {CambridgeBudsSocket} from './cambridgeBudsSocket.js';
import {
    CambridgeBudsModelList, NoiseControl, EqPresets, eqGainsToPreset, VoicePrompt,
    Gesture, Touchpad, TouchActions, gestureEntriesToAction, applyTouchAction
} from './cambridgeBudsConfig.js';

export const DeviceTypeCambridgeBuds = 'cambridgeBuds';

const SettingsKey = 'cambridge-buds-list';

const QualcommVendorUuids = [
    '0000eb04-d102-11e1-9b23-00025b00a5a5',
    '0000eb05-d102-11e1-9b23-00025b00a5a5',
    '0000eb06-d102-11e1-9b23-00025b00a5a5',
    '0000eb07-d102-11e1-9b23-00025b00a5a5',
];

const ToggleKeys = [
    {key: 'dynamic-eq', flag: 'dynamicEq'},
    {key: 'gaming-mode', flag: 'gamingMode'},
    {key: 'wear-detection', flag: 'wearDetection'},
    {key: 'mono', flag: 'mono'},
    {key: 'sleep-mode', flag: 'sleepMode'},
];

const GestureKeys = [
    {key: 'gesture-single-left', gesture: Gesture.SINGLE_TAP, touchpad: Touchpad.LEFT},
    {key: 'gesture-double-left', gesture: Gesture.DOUBLE_TAP, touchpad: Touchpad.LEFT},
    {key: 'gesture-triple-left', gesture: Gesture.TRIPLE_TAP, touchpad: Touchpad.LEFT},
    {key: 'gesture-long-left', gesture: Gesture.LONG_PRESS, touchpad: Touchpad.LEFT},
    {key: 'gesture-single-right', gesture: Gesture.SINGLE_TAP, touchpad: Touchpad.RIGHT},
    {key: 'gesture-double-right', gesture: Gesture.DOUBLE_TAP, touchpad: Touchpad.RIGHT},
    {key: 'gesture-triple-right', gesture: Gesture.TRIPLE_TAP, touchpad: Touchpad.RIGHT},
    {key: 'gesture-long-right', gesture: Gesture.LONG_PRESS, touchpad: Touchpad.RIGHT},
];

function findModel(name) {
    if (!name)
        return null;

    return CambridgeBudsModelList.find(m => m.namePattern.test(name)) ?? null;
}

export function isCambridgeBuds(bluezDeviceProxy, uuids) {
    const bluezProps = ['Name'];
    let supported = 'no';

    const deviceUuids = uuids.map(u => u.toLowerCase());
    if (!deviceUuids.includes(SppUUid) ||
            !QualcommVendorUuids.every(u => deviceUuids.includes(u)))
        return {supported, bluezProps};

    const name = bluezDeviceProxy.Name;
    if (!name) {
        supported = 'pending';
        return {supported, bluezProps};
    }

    if (findModel(name))
        supported = 'yes';

    return {supported, bluezProps};
}

export const CambridgeBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_CambridgeBudsDevice',
}, class CambridgeBudsDevice extends GObject.Object {
    _init(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super._init();
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`CambridgeBudsDevice-${identifier}`);
        this._log.info('------------------- CambridgeBudsDevice init -------------------');
        this._settings = settings;
        this._devicePath = devicePath;
        this._alias = alias;
        this._extPath = extPath;
        this.updateDeviceMapCb = updateDeviceMapCb;
        this._ignoreGsettingsChange = false;

        this._config = createConfig();
        this._props = createProperties();
        this._fwVersion = '';
        this._state = {};
        this._gestureEntries = {};

        const name = getBluezDeviceProxy(devicePath).Name;
        this._modelData = findModel(name) ?? findModel(alias) ?? CambridgeBudsModelList[0];
        this._log.info(`Model: ${this._modelData.name}`);

        this._initSettings();
        this._updateIcons();
        this._setupNoiseControlConfig();

        this._callbacks = {
            updateFirmware: this.updateFirmware.bind(this),
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateNoiseControl: this.updateNoiseControl.bind(this),
            updateToggle: this.updateToggle.bind(this),
            updateVoicePrompt: this.updateVoicePrompt.bind(this),
            updateAutoPowerOff: this.updateAutoPowerOff.bind(this),
            updateLdac: this.updateLdac.bind(this),
            updateEqGains: this.updateEqGains.bind(this),
            updateGesture: this.updateGesture.bind(this),
        };

        const profile = {type: SppUUidType, uuid: SppUUid};
        this._socket = new CambridgeBudsSocket(this._devicePath, profileManager, profile,
            this._callbacks);
    }

    _initSettings() {
        const m = this._modelData;
        this._commonIcon = m.budsIcon;
        this._caseIcon = m.case;

        const defaults = {
            path: this._devicePath,
            modelId: m.name,
            alias: this._alias,
            icon: this._commonIcon,
            'fw-version': this._fwVersion,
            ...m.batteryCase && {'case': this._caseIcon},
            ...m.eqPresets && {'eq-preset': 'flat'},
            ...m.ldac && {ldac: false},
            ...m.autoPowerOff && {'auto-power-off': 60},
            ...m.voicePrompts && {'voice-prompt': VoicePrompt.ENGLISH},
        };
        for (const {key, flag} of ToggleKeys) {
            if (m[flag])
                defaults[key] = false;
        }
        if (m.touchControls) {
            for (const {key} of GestureKeys)
                defaults[key] = 'none';
        }
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
        this._caseIcon = this._settingsItems['case'] ?? this._caseIcon;

        this._settingsHandlerId = this._settings.connect(`changed::${SettingsKey}`, () => {
            if (!this._ignoreGsettingsChange)
                this._onGsettingsChanged();
        });
    }

    _readSettingsItems() {
        const devicesList = this._settings.get_strv(SettingsKey).map(JSON.parse);
        return devicesList.find(d => d.path === this._devicePath) ?? null;
    }

    _writeSetting(key, value) {
        if (!this._settingsItems || this._settingsItems[key] === value)
            return;

        this._settingsItems[key] = value;
        this._ignoreGsettingsChange = true;
        const devicesList = this._settings.get_strv(SettingsKey).map(JSON.parse);
        const index = devicesList.findIndex(d => d.path === this._devicePath);
        if (index !== -1) {
            devicesList[index] = this._settingsItems;
            this._settings.set_strv(SettingsKey, devicesList.map(JSON.stringify));
        }
        this._ignoreGsettingsChange = false;
    }

    _onGsettingsChanged() {
        const items = this._readSettingsItems();
        if (!items)
            return;
        this._settingsItems = items;

        if (items['icon'] !== this._commonIcon ||
                'case' in items && items['case'] !== this._caseIcon) {
            this._commonIcon = items['icon'];
            this._caseIcon = items['case'] ?? this._caseIcon;
            this._updateIcons();
        }

        for (const {key} of ToggleKeys) {
            if (key in items && this._state[key] !== undefined && items[key] !== this._state[key]) {
                this._state[key] = items[key];
                this._socket?.setToggle(key, items[key]);
            }
        }

        for (const {key, gesture, touchpad} of GestureKeys) {
            const action = items[key];
            if (!(key in items) || this._state[key] === undefined || action === this._state[key] ||
                    !(action in TouchActions) || !this._gestureEntries[gesture])
                continue;

            this._state[key] = action;
            this._gestureEntries[gesture] =
                applyTouchAction(this._gestureEntries[gesture], touchpad, action);
            this._socket?.setGesture(gesture, this._gestureEntries[gesture]);
        }

        if ('eq-preset' in items && this._state['eq-preset'] !== undefined &&
                items['eq-preset'] !== this._state['eq-preset']) {
            const preset = EqPresets.find(p => p.id === items['eq-preset']);
            if (preset) {
                this._state['eq-preset'] = preset.id;
                this._socket?.setEqGains(preset.gains);
            }
        }

        if ('ldac' in items && this._state['ldac'] !== undefined &&
                items['ldac'] !== this._state['ldac']) {
            this._state['ldac'] = items['ldac'];
            this._socket?.setLdac(items['ldac']);
        }

        if ('auto-power-off' in items && this._state['auto-power-off'] !== undefined &&
                items['auto-power-off'] !== this._state['auto-power-off']) {
            this._state['auto-power-off'] = items['auto-power-off'];
            this._socket?.setAutoPowerOff(items['auto-power-off']);
        }

        if ('voice-prompt' in items && this._state['voice-prompt'] !== undefined &&
                items['voice-prompt'] !== this._state['voice-prompt']) {
            this._state['voice-prompt'] = items['voice-prompt'];
            this._socket?.setVoicePrompt(items['voice-prompt']);
        }
    }

    _reportState(key, value) {
        if (!(key in this._defaultsDeviceSettings))
            return;

        this._state[key] = value;
        this._writeSetting(key, value);
    }

    _updateIcons() {
        this._config.commonIcon = this._commonIcon;
        this._config.albumArtIcon = this._commonIcon;
        this._config.battery1ShowOnDisconnect = true;
        this._config.showSettingsButton = true;

        if (this._modelData.batteryMultiple) {
            this._config.battery1Icon = `${this._commonIcon}-left`;
            this._config.battery2Icon = `${this._commonIcon}-right`;
            this._config.battery2ShowOnDisconnect = true;
            if (this._modelData.batteryCase)
                this._config.battery3Icon = this._caseIcon;
        } else {
            this._config.battery1Icon = this._commonIcon;
        }

        this.dataHandler?.setConfig(this._config);
    }

    _setupNoiseControlConfig() {
        const modes = this._modelData.noiseControl?.modes;
        if (!modes || modes.length < 2)
            return;

        const labels = {
            off: _('Off'),
            anc: _('Noise Cancellation'),
            transparency: _('Transparency'),
        };
        const icons = {
            off: 'bbm-anc-off-symbolic',
            anc: 'bbm-anc-on-symbolic',
            transparency: 'bbm-transperancy-symbolic',
        };

        this._config.toggle1Title = _('Noise Control');
        this._toggle1Modes = modes;
        modes.forEach((mode, index) => {
            this._config[`toggle1Button${index + 1}Name`] = labels[mode];
            this._config[`toggle1Button${index + 1}Icon`] = icons[mode];
        });
        this._props.toggle1Visible = true;
    }

    _startConfiguration() {
        this.dataHandler = new DataHandler(this._config, this._props);
        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect('ui-action', (_o, command, value) => {
            if (command === 'toggle1State')
                this._toggle1ButtonClicked(value);

            if (command === 'settingsButtonClicked')
                launchConfigureWindow(this._devicePath, DeviceTypeCambridgeBuds);
        });
    }

    _modeToValue(mode) {
        switch (mode) {
            case 'anc':
                return NoiseControl.ANC;
            case 'transparency':
                return NoiseControl.TRANSPARENCY;
            default:
                return NoiseControl.OFF;
        }
    }

    _toggle1ButtonClicked(index) {
        const mode = this._toggle1Modes?.[index - 1];
        if (!mode)
            return;

        this._props.toggle1State = index;
        this.dataHandler?.setProps(this._props);
        this._socket?.setNoiseControl(this._modeToValue(mode));
    }

    updateFirmware(version) {
        this._fwVersion = version;
        this._writeSetting('fw-version', version);
    }

    updateBatteryProps(props) {
        if (Object.entries(props).every(([k, v]) => this._props[k] === v))
            return;

        this._props = {...this._props, ...props};
        this._props.computedBatteryLevel = buds2to1BatteryLevel(this._props);

        if (!this.dataHandler)
            this._startConfiguration();
        else
            this.dataHandler.setProps(this._props);
    }

    updateNoiseControl(value) {
        const mode = Object.entries({
            off: NoiseControl.OFF,
            anc: NoiseControl.ANC,
            transparency: NoiseControl.TRANSPARENCY,
        }).find(([, v]) => v === value)?.[0];

        const index = mode ? this._toggle1Modes?.indexOf(mode) ?? -1 : -1;
        if (index === -1) {
            this._log.info(`Unknown noise control value ${hexBytes(value)}`);
            return;
        }

        this._props.toggle1State = index + 1;
        this.dataHandler?.setProps(this._props);
    }

    updateToggle(key, enabled) {
        this._reportState(key, enabled);
    }

    updateVoicePrompt(value) {
        this._reportState('voice-prompt', value);
    }

    updateAutoPowerOff(minutes) {
        this._reportState('auto-power-off', minutes);
    }

    updateLdac(enabled) {
        this._reportState('ldac', enabled);
    }

    updateEqGains(gains) {
        this._reportState('eq-preset', eqGainsToPreset(gains));
    }

    updateGesture(gesture, entries) {
        this._gestureEntries[gesture] = entries;
        for (const {key, touchpad} of GestureKeys.filter(g => g.gesture === gesture))
            this._reportState(key, gestureEntriesToAction(entries, touchpad));
    }

    destroy() {
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
