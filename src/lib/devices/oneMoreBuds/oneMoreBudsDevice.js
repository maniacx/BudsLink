'use strict';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {
    validateProperties, launchConfigureWindow, SppUUidType, SppUUid
} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {OneMoreBudsSocket} from './oneMoreBudsSocket.js';
import {
    OneMoreBudsModelList, ListenMode, EqPreset, ClickAction, SonoFlowPreset
} from './oneMoreBudsConfig.js';

export const DeviceTypeOneMoreBuds = 'oneMoreBuds';

/* The standard SPP serial UUID is shared by many vendors; detection must key
   off a 1MORE-specific suffix in the device alias so we do not claim Bose,
   Sony or generic serial devices. */
const OneMoreAliasPatterns = [
    /1MORE\s+Sono[Ff]low/i,
    /1MORE\s+S-31/i,
    /1MORE\s+S70/i,
    /1MORE\s+S51|ES603|EH603/i,
    /1MORE\s+Comfo[Ff]uds/i,
    /1MORE\s+Piston[Bb]uds/i,
    /1MORE\s+S20|S21|S22|S23|S25|S52/i,
    /1MORE\s+NANO/i,
    /1MORE\s+HQ20|HQ36|HQ51|HQ52/i,
    /1MORE\s+Z30/i,
    /1MORE\s+Aero/i,
    /1MORE\s+EVO|EH902/i,
    /1MORE\s+Neo|EO007/i,
];

export function isOneMoreBuds(bluezDeviceProxy, uuids) {
    const bluezProps = ['Alias'];
    let supported = 'no';

    if (!uuids.some(u => u.toLowerCase() === SppUUid))
        return {supported, bluezProps};

    let alias = bluezDeviceProxy.Alias;
    if (!alias) {
        supported = 'pending';
        return {supported, bluezProps};
    }

    if (OneMoreAliasPatterns.some(p => p.test(alias)))
        supported = 'yes';

    return {supported, bluezProps};
}

export const OneMoreBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_OneMoreBudsDevice',
}, class OneMoreBudsDevice extends GObject.Object {
    _init(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super._init();

        const identifier = getDeviceIdentifier(devicePath);
        const tag = `OneMoreBudsDevice-${identifier}`;
        this._log = createLogger(tag);
        this._log.info('------------------- OneMoreBudsDevice init -------------------');
        this._settings = settings;
        this._devicePath = devicePath;
        this._alias = alias;
        this._extPath = extPath;
        this.updateDeviceMapCb = updateDeviceMapCb;
        this._ignoreGsettingsChange = false;

        this._config = createConfig();
        this._props = createProperties();
        this._modelData = null;
        this._fwVersion = '';

        this._callbacks = {
            updateHandshake: this.updateHandshake.bind(this),
            updateBinauralInfo: this.updateBinauralInfo.bind(this),
            updateNoiseControl: this.updateNoiseControl.bind(this),
            updateEq: this.updateEq.bind(this),
            updateDoubleClick: this.updateDoubleClick.bind(this),
            updateTripleClick: this.updateTripleClick.bind(this),
        };

        this._modelData = OneMoreBudsModelList[0];

        this._log.info(`Configuration: ${JSON.stringify(this._modelData, null, 2)}`);

        this._commonIcon = this._modelData.budsIcon;
        this._config.battery1ShowOnDisconnect = true;
        this._config.showSettingsButton = true;

        if (this._modelData.batteryCase)
            this._caseIcon = `${this._modelData.case}`;
        else
            this._caseIcon = null;

        this._createDefaultSettings();

        const devicesList = this._settings.get_strv('one-more-buds-list').map(JSON.parse);

        if (devicesList.length === 0 ||
                !devicesList.some(device => device.path === this._devicePath)) {
            this._addPropsToSettings(devicesList);
        } else {
            validateProperties(this._settings, 'one-more-buds-list', devicesList,
                this._defaultsDeviceSettings, this._devicePath);
        }

        this._updateInitialValues();
        this._monitorOneMoreBudsListGsettings();
        this._updateIcons();
        this._setupNoiseControlConfig();

        const profile = {type: SppUUidType, uuid: SppUUid};

        this._oneMoreBudsSocket = new OneMoreBudsSocket(
            this._devicePath,
            profileManager,
            profile,
            this._modelData,
            this._callbacks
        );
    }

    _createDefaultSettings() {
        this._defaultsDeviceSettings = {
            path: this._devicePath,
            modelId: this._modelData.id[0],
            alias: this._alias,
            'nome-model-name': this._modelData.name,
            icon: this._commonIcon,
            'fw-version': this._fwVersion,

            ...this._modelData.batteryCase && {
                'case': this._caseIcon,
            },

            ...this._modelData.noiseControl && {
                'listen-mode': 0,
            },

            ...this._modelData.equalizer && {
                'eq-preset': EqPreset.MUSIC,
            },

            ...this._modelData.gestures && {
                'double-click': ClickAction.OFF,
                'triple-click': ClickAction.OFF,
            },

            ...this._modelData.findMyBuds && {
                'ring-state': 'stopped',
                'ring-state-left': 'stopped',
            },
        };
    }

    _addPropsToSettings(devicesList) {
        devicesList.push(this._defaultsDeviceSettings);
        this._settings.set_strv('one-more-buds-list', devicesList.map(JSON.stringify));
    }

    _updateInitialValues() {
        const devicesList = this._settings.get_strv('one-more-buds-list').map(JSON.parse);
        const existingPathIndex = devicesList.findIndex(
            item => item.path === this._devicePath);
        if (existingPathIndex === -1)
            return;

        this._settingsItems = devicesList[existingPathIndex];
        this._commonIcon = this._settingsItems['icon'];

        if (this._modelData.batteryCase)
            this._caseIcon = this._settingsItems['case'];

        if (this._modelData.noiseControl)
            this._listenMode = this._settingsItems['listen-mode'];

        if (this._modelData.equalizer)
            this._eqPreset = this._settingsItems['eq-preset'];

        if (this._modelData.gestures) {
            this._doubleClick = this._settingsItems['double-click'];
            this._tripleClick = this._settingsItems['triple-click'];
        }

        if (this._modelData.findMyBuds) {
            this._ringState = 'stopped';
            this._ringStateLeft = 'stopped';
        }
    }

    _updateGsettingsProps() {
        const devicesList = this._settings.get_strv('one-more-buds-list').map(JSON.parse);
        const existingPathIndex = devicesList.findIndex(
            item => item.path === this._devicePath);
        if (existingPathIndex === -1)
            return;

        this._settingsItems = devicesList[existingPathIndex];

        const icon = this._settingsItems['icon'];
        if (this._commonIcon !== icon) {
            this._commonIcon = icon;
            this._updateIcons();
        }

        if (this._modelData.batteryCase) {
            const caseIcon = this._settingsItems['case'];
            if (this._caseIcon !== caseIcon) {
                this._caseIcon = caseIcon;
                this._updateIcons();
            }
        }

        if (this._modelData.noiseControl) {
            const listenMode = this._settingsItems['listen-mode'];
            if (this._listenMode !== listenMode) {
                this._listenMode = listenMode;
                this._oneMoreBudsSocket?.setNoiseControl(listenMode);
            }
        }

        if (this._modelData.equalizer) {
            const eqPreset = this._settingsItems['eq-preset'];
            if (this._eqPreset !== eqPreset) {
                this._eqPreset = eqPreset;
                this._oneMoreBudsSocket?.setEqPreset(eqPreset);
            }
        }

        if (this._modelData.gestures) {
            const doubleClick = this._settingsItems['double-click'];
            if (this._doubleClick !== doubleClick) {
                this._doubleClick = doubleClick;
                this._oneMoreBudsSocket?.setDoubleClick(doubleClick);
            }

            const tripleClick = this._settingsItems['triple-click'];
            if (this._tripleClick !== tripleClick) {
                this._tripleClick = tripleClick;
                this._oneMoreBudsSocket?.setTripleClick(tripleClick);
            }
        }

        if (this._modelData.findMyBuds) {
            const state = this._settingsItems['ring-state'];
            if (this._ringState !== state) {
                this._ringState = state;
                this._setRingMyBuds(state);
            }

            const stateLeft = this._settingsItems['ring-state-left'];
            if (this._ringStateLeft !== stateLeft) {
                this._ringStateLeft = stateLeft;
                this._setRingMyBuds(stateLeft, true);
            }
        }
    }

    _monitorOneMoreBudsListGsettings() {
        this._settingsHandlerId = this._settings?.connect(
            'changed::one-more-buds-list', () => {
                if (this._ignoreGsettingsChange)
                    return;

                this._updateGsettingsProps();
            });
    }

    _updateGsettings() {
        this._ignoreGsettingsChange = true;

        const currentList = this._settings.get_strv('one-more-buds-list').map(JSON.parse);
        const index = currentList.findIndex(d => d.path === this._devicePath);

        if (index !== -1) {
            currentList[index] = this._settingsItems;
            this._settings.set_strv('one-more-buds-list', currentList.map(JSON.stringify));
        }

        this._ignoreGsettingsChange = false;
    }

    _updateIcons() {
        this._config.commonIcon = this._commonIcon;
        this._config.albumArtIcon = this._commonIcon;

        this._config.battery1ShowOnDisconnect = true;
        this._config.battery1Icon = this._commonIcon;

        this.dataHandler?.setConfig(this._config);
    }

    _setupNoiseControlConfig() {
        const modes = this._modelData.noiseControl?.modes;
        if (!modes || modes.length < 2)
            return;

        this._config.toggle1Title = _('Noise Control');
        this._props.toggle1Visible = true;
        this._toggle1Modes = modes;

        const labels = {
            off: _('Off'),
            nc: _('Noise Cancellation'),
            ambient: _('Ambient Sound'),
        };

        const icons = {
            off: 'bbm-anc-off-symbolic.svg',
            nc: 'bbm-anc-on-symbolic.svg',
            ambient: 'bbm-transperancy-symbolic.svg',
        };

        for (let i = 1; i <= 4; i++) {
            this._config[`toggle1Button${i}Name`] = '';
            this._config[`toggle1Button${i}Icon`] = null;
        }

        modes.forEach((mode, index) => {
            const button = index + 1;
            this._config[`toggle1Button${button}Name`] = labels[mode] ?? mode;
            this._config[`toggle1Button${button}Icon`] = icons[mode] ?? null;
        });
    }

    _modeToListenValue(mode) {
        switch (mode) {
            case 'nc':
                return ListenMode.STRONG;
            case 'ambient':
                return ListenMode.TRANSPARENT;
            default:
                return ListenMode.OFF;
        }
    }

    _listenValueToMode(value) {
        switch (value) {
            case ListenMode.STRONG:
                return 'nc';
            case ListenMode.TRANSPARENT:
                return 'ambient';
            case ListenMode.OFF:
                return 'off';
            default:
                return null;
        }
    }

    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level ?? 0;
        const bat2level = battInfo.battery2Level ?? 0;
        const bat3level = battInfo.battery3Level ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

        this.dataHandler = new DataHandler(this._config, this._props);

        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect(
            'ui-action', (o, command, value) => {
                if (command === 'toggle1State')
                    this._toggle1ButtonClicked(value);

                if (command === 'settingsButtonClicked')
                    this._settingsButtonClicked();
            }
        );
    }

    /* The battery levels are reported by the 0x4E binaural-info reply rounded
       to the nearest ten by the firmware. The left and right fields mirror the
       same physical pack on over-ear models; prefer the highest sane value.
       Firmware version is embedded as "x.y.z" in payload[1..3]. */
    updateBinauralInfo(payload) {
        if (payload.length < 10)
            return;

        const left = payload[4];
        const right = payload[8];
        const level = Math.max(left, right);

        const status = val => val >= 1 && val <= 100
            ? 'discharging' : 'disconnected';

        this._battInfo = {
            battery1Level: level,
            battery1Status: status(level),
        };

        this.updateBatteryProps(this._battInfo);

        const fwBytes = [payload[1], payload[2], payload[3]];
        if (fwBytes.some(b => b > 0))
            this.updateFirmware(fwBytes.join('.'));
    }

    /* The 0x4D reply carries a 16-byte license string. */
    updateHandshake(payload) {
        if (payload.length < 17)
            return;

        const bytes = payload.slice(1, 17);
        const license = String.fromCharCode(...bytes).replace(/[^\x20-\x7E]/g, '');
        this._log.info(`License: ${license}`);
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};

        if (!this._modelData)
            return;

        if (props.battery1Level >= 1 && props.battery1Level <= 100)
            this._props.computedBatteryLevel = props.battery1Level;

        this._log.info(`Battery INFO: ${JSON.stringify(props)}`);

        if (!this._battInfoRecieved)
            this._startConfiguration(props);

        this.dataHandler?.setProps(this._props);
    }

    updateFirmware(fwVersion) {
        this._fwVersion = fwVersion;
        if (this._settingsItems) {
            this._settingsItems['fw-version'] = fwVersion;
            this._updateGsettings();
        }
    }

    updateNoiseControl(value) {
        this._log.info(`updateNoiseControl value: ${hexBytes(value)}`);

        const mode = this._listenValueToMode(value);
        if (!mode || !this._toggle1Modes)
            return;

        const index = this._toggle1Modes.indexOf(mode);
        if (index === -1)
            return;

        this._listenMode = value;
        this._props.toggle1State = index + 1;
        this.dataHandler?.setProps(this._props);
    }

    updateEq(preset) {
        this._log.info(`updateEq preset: ${hexBytes(preset)}`);
        if (this._eqPreset !== preset) {
            this._eqPreset = preset;
            if (this._settingsItems) {
                this._settingsItems['eq-preset'] = preset;
                this._updateGsettings();
            }
        }
    }

    updateDoubleClick(action) {
        this._log.info(`updateDoubleClick: ${hexBytes(action)}`);
        if (this._doubleClick !== action) {
            this._doubleClick = action;
            if (this._settingsItems) {
                this._settingsItems['double-click'] = action;
                this._updateGsettings();
            }
        }
    }

    updateTripleClick(action) {
        this._log.info(`updateTripleClick: ${hexBytes(action)}`);
        if (this._tripleClick !== action) {
            this._tripleClick = action;
            if (this._settingsItems) {
                this._settingsItems['triple-click'] = action;
                this._updateGsettings();
            }
        }
    }

    /* FindDevice only supports ringing one earcup at a time; stop both when
       either side stops. */
    _setRingMyBuds(state, isLeft = false) {
        const socket = this._oneMoreBudsSocket;
        if (!socket || state === 'stopped') {
            socket?.findStop();
            return;
        }

        if (isLeft)
            socket.findLeft();
        else
            socket.findRight();
    }

    _toggle1ButtonClicked(index) {
        const mode = this._toggle1Modes?.[index - 1];
        if (!mode)
            return;

        const value = this._modeToListenValue(mode);
        this._props.toggle1State = index;
        this._listenMode = value;
        this.dataHandler?.setProps(this._props);
        this._oneMoreBudsSocket?.setNoiseControl(value);
    }

    _settingsButtonClicked() {
        this._configureWindowLauncherCancellable = new Gio.Cancellable();
        launchConfigureWindow(this._devicePath, 'oneMoreBuds', this._extPath,
            this._configureWindowLauncherCancellable);
        this._configureWindowLauncherCancellable = null;
    }

    destroy() {
        this._configureWindowLauncherCancellable?.cancel();
        this._configureWindowLauncherCancellable = null;

        this._oneMoreBudsSocket?.destroy();
        this._oneMoreBudsSocket = null;

        if (this._dataHandlerId)
            this.dataHandler?.disconnect(this._dataHandlerId);
        this._dataHandlerId = null;
        this.dataHandler = null;

        if (this._settingsHandlerId)
            this._settings?.disconnect(this._settingsHandlerId);
        this._settingsHandlerId = null;

        this._settings = null;
        this._battInfoRecieved = false;
    }
});