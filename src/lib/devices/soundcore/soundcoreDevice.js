'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier} from '../logger.js';
import {
    buds2to1BatteryLevel, validateProperties, launchConfigureWindow, SppUUid
} from '../deviceUtils.js';
import {BtDeviceState, DeviceManagementAction} from '../commonEmuns.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {getBluezDeviceProxy} from '../../bluezDeviceProxy.js';
import {SoundcoreSocket} from './soundcoreSocket.js';
import {
    SoundcoreConfiguration, vendorUuidForModel, AmbientMode, NcMode, AmbientCycleBit,
    TouchActionId
} from './soundcoreConfig.js';

export const DeviceTypeSoundcore = 'soundcore';

const SettingsKey = 'soundcore-list';

// Optional icons (not in the panel extension's album art set), shown with a similar picture
const AlbumArtFallback = {'earbuds-flatstem': 'earbuds-stem'};

const EqualizerModes = ['hearid', 'default', 'custom'];

// Ambient mode values in toggle button order: Noise Cancellation, Off, Transparency
const ToggleAmbientModes = [AmbientMode.NOISE_CANCELING, AmbientMode.NORMAL,
    AmbientMode.TRANSPARENCY];

// gsettings key -> field of the decoded sound modes
const SoundModeKeys = [
    {key: 'ambient-mode', field: 'ambient'},
    {key: 'nc-mode', field: 'ncMode'},
    {key: 'nc-level', field: 'manualNcLevel'},
    {key: 'wind-noise', field: 'windNoise'},
    {key: 'environment-detection', field: 'environmentDetection'},
    {key: 'transport-mode', field: 'transportMode'},
    {key: 'transparency-mode', field: 'transparencyMode'},
];

function findModelByUuids(uuids) {
    const lower = uuids.map(u => u.toLowerCase());
    return SoundcoreConfiguration.find(m => lower.includes(vendorUuidForModel(m.modelCode))) ?? null;
}

export function isSoundcore(bluezDeviceProxy, uuids) {
    const bluezProps = [];
    const lower = uuids.map(u => u.toLowerCase());
    // Some Soundcore models share the vendor uuid prefix but have no serial port (no ANC)
    const supported = lower.includes(SppUUid) && findModelByUuids(lower) ? 'yes' : 'no';
    return {supported, bluezProps};
}

export const SoundcoreDevice = GObject.registerClass({
    GTypeName: 'BudsLink_SoundcoreDevice',
}, class SoundcoreDevice extends GObject.Object {
    _init(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super._init();
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`SoundcoreDevice-${identifier}`);
        this._log.info('------------------- SoundcoreDevice init -------------------');
        this._settings = settings;
        this._devicePath = devicePath;
        this._alias = alias;
        this._extPath = extPath;
        this.updateDeviceMapCb = updateDeviceMapCb;
        this._ignoreGsettingsChange = false;

        this._config = createConfig();
        this._props = createProperties();
        this._modes = null;
        this._deviceInfo = [];
        this._pendingDualOps = new Map();
        this._deviceState = {};

        this._modelData = findModelByUuids(getBluezDeviceProxy(devicePath).UUIDs ?? []) ??
            SoundcoreConfiguration[0];
        this._log.info(`Model: ${this._modelData.name}`);

        this._initSettings();
        this._updateIcons();
        this._setupToggleConfig();

        this._callbacks = {
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateSoundModes: this.updateSoundModes.bind(this),
            updateDualDevices: this.updateDualDevices.bind(this),
            updateDualEnabled: this.updateDualEnabled.bind(this),
            updateLdac: this.updateLdac.bind(this),
            updateToggle: this.updateToggle.bind(this),
            updateAutoPowerOff: this.updateAutoPowerOff.bind(this),
            updateVolumeLimit: this.updateVolumeLimit.bind(this),
            updateGesture: this.updateGesture.bind(this),
            updateEqualizer: this.updateEqualizer.bind(this),
            updateAmbientCycle: this.updateAmbientCycle.bind(this),
        };

        const profile = {
            type: `${DeviceTypeSoundcore}${this._modelData.modelCode}`,
            uuid: vendorUuidForModel(this._modelData.modelCode),
        };
        this._socket = new SoundcoreSocket(this._devicePath, profileManager, profile,
            this._callbacks, this._modelData);
    }

    _initSettings() {
        const m = this._modelData;
        const defaults = {
            path: this._devicePath,
            modelId: m.name,
            alias: this._alias,
            icon: m.budsIcon,
            case: m.case,
            'ambient-mode': AmbientMode.NORMAL,
            'wind-noise': false,
            'nc-mode': NcMode.MANUAL,
            'nc-level': 3,
            'environment-detection': false,
            'transport-mode': 0,
            'transparency-mode': 0,
            ...m.ldac && {ldac: false},
            ...Object.fromEntries((m.flags ?? []).map(f => [f.key, false])),
            ...Object.fromEntries((m.buttons?.order ?? []).map(n => [`gesture-${n}`, 'none'])),
            ...m.ambientCycleOffset && {
                'cycle-nc': true, 'cycle-transparency': true, 'cycle-normal': true,
            },
            ...m.equalizer && {
                'eq-mode': 'hearid',
                'eq-custom': new Array(m.equalizer.freqs.length).fill(0),
                'eq-preset': 0,
                'eq-profiles': [],
                'hearid-type': 'initial',
                'hearid-genre': 0,
                'hearid-custom': new Array(m.equalizer.freqs.length).fill(0),
            },
            ...m.autoPowerOff && {'auto-power-off': 30},
            ...m.limitHighVolume && {'limit-volume': false, 'limit-volume-db': 90, 'limit-volume-refresh': 0},
            ...m.dualConnection && {
                'dual-conn': true,
                'dev-mgmt': [],
                'dev-mgmt-action': {seq: 0, action: 0, id: ''},
            },
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
        this._devMgmtAction = this._settingsItems['dev-mgmt-action'];

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

        this._handleDualAction(items['dev-mgmt-action']);
        this._handleSettingsChanged(items);

        for (const [key, setter] of [
            ['dual-conn', enabled => this._socket?.setDualEnabled(enabled)],
            ['ldac', enabled => this._socket?.setLdac(enabled)],
            ...(this._modelData.flags ?? []).map(({key}) =>
                [key, enabled => this._socket?.setFlag(key, enabled)]),
        ]) {
            if (key in items && this._deviceState[key] !== undefined &&
                    items[key] !== this._deviceState[key]) {
                this._deviceState[key] = items[key];
                setter(items[key]);
            }
        }

        let changed = false;
        if (this._modes) {
            for (const {key, field} of SoundModeKeys) {
                if (key in items && this._modes[field] !== items[key]) {
                    this._modes[field] = items[key];
                    changed = true;
                }
            }
        }

        // The panel shows what the modes are now, so it is synced after they are applied
        this._syncPanelOptions();

        if (changed)
            this._socket?.setSoundModes(this._modes);
    }

    _updateIcons() {
        this._config.commonIcon = this._commonIcon;
        this._config.albumArtIcon = AlbumArtFallback[this._commonIcon] ?? this._commonIcon;
        this._config.battery1ShowOnDisconnect = true;
        this._config.showSettingsButton = true;

        this._config.battery1Icon = `${this._commonIcon}-left`;
        this._config.battery2Icon = `${this._commonIcon}-right`;
        this._config.battery3Icon = this._caseIcon;
        this._config.battery2ShowOnDisconnect = true;

        this.dataHandler?.setConfig(this._config);
    }

    _setupToggleConfig() {
        const labels = [_('Noise Cancellation'), _('Off'), _('Transparency')];
        const icons = ['bbm-anc-on-symbolic', 'bbm-anc-off-symbolic', 'bbm-transperancy-symbolic'];

        this._config.toggle1Title = _('Noise Control');
        labels.forEach((label, index) => {
            this._config[`toggle1Button${index + 1}Name`] = label;
            this._config[`toggle1Button${index + 1}Icon`] = icons[index];
        });
        this._props.toggle1Visible = true;

        if (this._modelData.equalizer) {
            this._config.toggle2Title = _('Audio Effects');
            this._config.toggle2Button1Name = _('HearID');
            this._config.toggle2Button1Icon = 'bbm-mode-aware-symbolic';
            this._config.toggle2Button2Name = _('Default');
            this._config.toggle2Button2Icon = 'bbm-mode-music-symbolic';
            this._config.toggle2Button3Name = _('Custom Equalizer');
            this._config.toggle2Button3Icon = 'bbm-eq-symbolic';
            this._props.toggle2Visible = true;
        }
    }

    _toggle2ButtonClicked(index) {
        const mode = EqualizerModes[index - 1];
        if (!mode || !this._settingsItems)
            return;

        this._writeSettings({'eq-mode': mode});
        this._deviceState['eq-mode'] = mode;
        this._syncPanelOptions();
        this._onGsettingsChanged();
    }

    _syncPanelOptions() {
        const items = this._settingsItems;
        const props = this._props;
        props.toggle2State = EqualizerModes.indexOf(items['eq-mode']) + 1;

        this.dataHandler?.setProps(props);
    }

    _startConfiguration() {
        this.dataHandler = new DataHandler(this._config, this._props);
        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect('ui-action', (_o, command, value) => {
            if (command === 'toggle1State')
                this._toggle1ButtonClicked(value);

            if (command === 'toggle2State')
                this._toggle2ButtonClicked(value);

            if (command === 'settingsButtonClicked')
                launchConfigureWindow(this._devicePath, DeviceTypeSoundcore);
        });
    }

    _toggle1ButtonClicked(index) {
        const ambient = ToggleAmbientModes[index - 1];
        if (ambient === undefined || !this._modes)
            return;

        this._modes.ambient = ambient;
        this._writeSettings({'ambient-mode': ambient});
        this._props.toggle1State = index;
        this._syncPanelOptions();
        this._socket?.setSoundModes(this._modes);
    }

    _handleDualAction(action) {
        if (!action || !this._devMgmtAction || action.seq === this._devMgmtAction.seq)
            return;

        this._devMgmtAction = action;

        switch (action.action) {
            case DeviceManagementAction.Connect:
                this._startDualOp(action.id);
                this._socket?.connectDualDevice(action.id);
                break;

            case DeviceManagementAction.Disconnect:
                this._startDualOp(action.id);
                this._socket?.disconnectDualDevice(action.id);
                break;

            case DeviceManagementAction.Remove:
                this._startDualOp(action.id);
                this._socket?.forgetDualDevice(action.id);
                break;

            case DeviceManagementAction.Refresh:
                this._socket?.requestDualDevices();
                break;
        }
    }

    _startDualOp(id) {
        const device = this._deviceInfo.find(info => info.id === id);
        if (device) {
            device.state = BtDeviceState.Processing;
            this._writeSettings({'dev-mgmt': this._deviceInfo});
        }

        const previous = this._pendingDualOps.get(id);
        if (previous)
            GLib.source_remove(previous);

        // Stop showing the spinner if the earbuds never confirm
        this._pendingDualOps.set(id, GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
            this._pendingDualOps.delete(id);
            const info = this._deviceInfo.find(i => i.id === id);
            if (info && info.state === BtDeviceState.Processing) {
                info.state = BtDeviceState.Ready;
                this._writeSettings({'dev-mgmt': this._deviceInfo});
            }
            return GLib.SOURCE_REMOVE;
        }));
    }

    _handleSettingsChanged(items) {
        const state = this._deviceState;

        if ('auto-power-off' in items && state['auto-power-off'] !== undefined &&
                items['auto-power-off'] !== state['auto-power-off']) {
            state['auto-power-off'] = items['auto-power-off'];
            this._socket?.setAutoPowerOff(items['auto-power-off']);
        }

        for (const name of this._modelData.buttons?.order ?? []) {
            const key = `gesture-${name}`;
            if (key in items && state[key] !== undefined && items[key] !== state[key] &&
                    (items[key] === 'none' || items[key] in TouchActionId)) {
                state[key] = items[key];
                this._socket?.setGesture(key, items[key]);
            }
        }

        if (state['ambient-cycle'] !== undefined && 'cycle-nc' in items) {
            const mask = Object.entries(AmbientCycleBit)
                .reduce((sum, [key, bit]) => sum | (items[key] ? bit : 0), 0);
            if (mask !== state['ambient-cycle']) {
                state['ambient-cycle'] = mask;
                this._socket?.setAmbientCycle(mask);
            }
        }

        if ('eq-mode' in items && state['eq-mode'] !== undefined) {
            const wanted = this._equalizerSettings(items);
            if (JSON.stringify(wanted) !== JSON.stringify(this._deviceEqualizer(items))) {
                state['eq-mode'] = items['eq-mode'];
                this._deviceEqualizerState = {...this._deviceEqualizerState, ...wanted};
                this._scheduleEqualizer(wanted);
            }
        }

        if ('limit-volume-refresh' in items && state['limit-volume-refresh'] !== undefined &&
                items['limit-volume-refresh'] !== state['limit-volume-refresh']) {
            state['limit-volume-refresh'] = items['limit-volume-refresh'];
            this._socket?.setVolumeRefreshRate(items['limit-volume-refresh']);
        }

        if ('limit-volume' in items && state['limit-volume'] !== undefined &&
                (items['limit-volume'] !== state['limit-volume'] ||
                items['limit-volume-db'] !== state['limit-volume-db'])) {
            state['limit-volume'] = items['limit-volume'];
            state['limit-volume-db'] = items['limit-volume-db'];
            this._socket?.setVolumeLimit(items['limit-volume'], items['limit-volume-db']);
        }
    }

    updateToggle(key, enabled) {
        this._deviceState[key] = enabled;
        this._writeSettings({[key]: enabled});
        this._syncPanelOptions();
    }

    // What the settings ask for, only the parts that matter for the selected mode
    _equalizerSettings(items) {
        const settings = {
            mode: items['eq-mode'],
            hearCustomBands: items['hearid-custom'],
        };
        if (settings.mode === 'default')
            settings.presetId = items['eq-preset'];
        else if (settings.mode === 'custom')
            settings.customBands = items['eq-custom'];
        else
            Object.assign(settings, {hearType: items['hearid-type'], genre: items['hearid-genre']});

        return settings;
    }

    // The same, as last reported by or sent to the earbuds
    _deviceEqualizer(items) {
        const reported = this._deviceEqualizerState ?? {};
        const settings = {mode: reported.mode, hearCustomBands: reported.hearCustomBands};
        if (settings.mode === 'default')
            settings.presetId = reported.presetId;
        else if (settings.mode === 'custom')
            settings.customBands = reported.customBands;
        else
            Object.assign(settings, {hearType: reported.hearType, genre: reported.genre});

        return settings;
    }

    // Dragging the equalizer sliders produces many changes; send only the last one
    _scheduleEqualizer(settings) {
        if (this._eqTimeoutId)
            GLib.source_remove(this._eqTimeoutId);

        this._eqTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            this._eqTimeoutId = null;
            this._socket?.setEqualizer(settings);
            return GLib.SOURCE_REMOVE;
        });
    }

    updateEqualizer(info) {
        const previous = this._deviceEqualizerState ?? {};
        const customBands = info.customBands ?? previous.customBands ??
            this._settingsItems['eq-custom'];
        const presetId = info.presetId ?? previous.presetId ?? this._settingsItems['eq-preset'];
        this._deviceEqualizerState = {
            mode: info.mode, presetId, customBands, hearType: info.hearType,
            genre: info.genre, hearCustomBands: info.hearCustomBands,
        };
        this._deviceState['eq-mode'] = info.mode;

        this._writeSettings({
            'eq-mode': info.mode,
            'eq-preset': presetId,
            'eq-custom': customBands,
            'hearid-type': info.hearType,
            'hearid-genre': info.genre,
            ...info.hearCustomBands && {'hearid-custom': info.hearCustomBands},
        });
        this._syncPanelOptions();
    }

    updateGesture(key, action) {
        this._deviceState[key] = action;
        this._writeSettings({[key]: action});
    }

    updateAmbientCycle(mask) {
        this._deviceState['ambient-cycle'] = mask;
        this._writeSettings(Object.fromEntries(Object.entries(AmbientCycleBit)
            .map(([key, bit]) => [key, (mask & bit) !== 0])));
    }

    updateAutoPowerOff(minutes) {
        this._deviceState['auto-power-off'] = minutes;
        this._writeSettings({'auto-power-off': minutes});
    }

    updateVolumeLimit(enabled, db, refreshRate) {
        this._deviceState['limit-volume'] = enabled;
        this._deviceState['limit-volume-db'] = db;
        this._deviceState['limit-volume-refresh'] = refreshRate;
        this._writeSettings({
            'limit-volume': enabled, 'limit-volume-db': db, 'limit-volume-refresh': refreshRate,
        });
    }

    updateDualEnabled(enabled) {
        this._deviceState['dual-conn'] = enabled;
        this._writeSettings({'dual-conn': enabled});
    }

    updateLdac(enabled) {
        this._deviceState['ldac'] = enabled;
        this._writeSettings({ldac: enabled});
    }

    updateDualDevices(devices) {
        for (const id of this._pendingDualOps.keys())
            GLib.source_remove(this._pendingDualOps.get(id));
        this._pendingDualOps.clear();

        this._deviceInfo = devices.map(device => ({
            id: device.id,
            name: device.name,
            connected: device.connected,
            state: BtDeviceState.Ready,
        }));
        this._writeSettings({'dev-mgmt': this._deviceInfo});
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

    updateSoundModes(modes) {
        this._modes = modes;

        const index = ToggleAmbientModes.indexOf(modes.ambient);
        if (index !== -1) {
            this._props.toggle1State = index + 1;
            this.dataHandler?.setProps(this._props);
        }

        const values = {};
        for (const {key, field} of SoundModeKeys) {
            if (key in this._defaultsDeviceSettings)
                values[key] = modes[field];
        }
        if (values['nc-level'] < 1)
            values['nc-level'] = 1;
        this._writeSettings(values);
        this._syncPanelOptions();
    }

    destroy() {
        if (this._eqTimeoutId)
            GLib.source_remove(this._eqTimeoutId);
        this._eqTimeoutId = null;

        for (const timeoutId of this._pendingDualOps.values())
            GLib.source_remove(timeoutId);
        this._pendingDualOps.clear();

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
