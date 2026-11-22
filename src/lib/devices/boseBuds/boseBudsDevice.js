'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {
    buds2to1BatteryLevel, isArrayEqual, SppUUidType, SppUUid, getAdapterMac
} from '../deviceUtils.js';
import {DeviceInfo} from '../../deviceInfo.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {getBluezDeviceProxy} from '../../bluezDeviceProxy.js';
import {MediaController} from '../mediaController.js';
import {BoseBudsSocket} from './boseBudsSocket.js';
import {BoseBudsModelList, AudioModes} from './boseBudsConfig.js';
import {BtDeviceState, DeviceManagementAction} from '../commonEmuns.js';

import {ConfigureWindow} from '../../../preferences/devices/boseBuds/configureWindow.js';

export const DeviceTypeBoseBuds = 'boseBuds';
const BoseBudsUUID = '00000000-deca-fade-deca-deafdecacaff';
export function isBoseBuds(bluezDeviceProxy, uuids) {
    const bluezProps = ['Modalias'];
    let supported = 'no';

    if (!uuids.includes(BoseBudsUUID) || !uuids.includes(SppUUid))
        return {supported, bluezProps};

    const modalias = bluezDeviceProxy.Modalias;
    if (!modalias) {
        supported = 'pending';
        return {supported, bluezProps};
    }

    const regex = /v009Ep([0-9A-Fa-f]{4})d/;
    const match = modalias.match(regex);
    if (!match)
        return {supported, bluezProps};

    const modelId = match[1].toUpperCase();
    if (BoseBudsModelList.some(m => m.id === modelId))
        supported = 'yes';

    return {supported, bluezProps};
}

export const BoseBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_BoseBudsDevice',
}, class BoseBudsDevice extends GObject.Object {
    constructor(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super();

        const identifier = getDeviceIdentifier(devicePath);
        const tag = `BoseBudsDevice-${identifier}`;
        this._log = createLogger(tag);
        this._log.info('------------------- BoseBudsDevice init -------------------');
        this._settings = settings;
        this._devicePath = devicePath;
        this._alias = alias;
        this._extPath = extPath;
        this.updateDeviceMapCb = updateDeviceMapCb;

        this._config = createConfig();
        this._props = createProperties();
        this._modelData = null;
        this._deviceMgmtInfo = [];
        this._pendingBTOperations = new Map();
        this._modeCount = 10;
        this._bothBudsInEar = null;
        this._budInEar = null;

        this._callbacks = {
            updateFirmware: this.updateFirmware.bind(this),
            updateSerial: this.updateSerial.bind(this),
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateInEarState: this.updateInEarState.bind(this),
            updateEq: this.updateEq.bind(this),
            updateAnr: this.updateAnr.bind(this),
            updateAudioModeCurrent: this.updateAudioModeCurrent.bind(this),
            updateAudioModeRestore: this.updateAudioModeRestore.bind(this),
            updateAudioModeFavorites: this.updateAudioModeFavorites.bind(this),
            updateCnc: this.updateCnc.bind(this),
            updateSpatialAudio: this.updateSpatialAudio.bind(this),
            updateDualConnection: this.updateDualConnection.bind(this),
            updateSideTone: this.updateSideTone.bind(this),
            updateInEarSettings: this.updateInEarSettings.bind(this),
            updateAutoAnswer: this.updateAutoAnswer.bind(this),
            updateAutoPause: this.updateAutoPause.bind(this),
            updateAutoTransparency: this.updateAutoTransparency.bind(this),
            updateAutoPowerOffTimer: this.updateAutoPowerOffTimer.bind(this),
            updateVoicePrompt: this.updateVoicePrompt.bind(this),
            updateActionButton: this.updateActionButton.bind(this),
            updateBTDeviceList: this.updateBTDeviceList.bind(this),
            updateBTDeviceInfo: this.updateBTDeviceInfo.bind(this),
            updatePairingMode: this.updatePairingMode.bind(this),
            updateConnectError: this.updateConnectError.bind(this),
            updateConnectStatus: this.updateConnectStatus.bind(this),
            updateDisconnectError: this.updateDisconnectError.bind(this),
            updateDisconnectStatus: this.updateDisconnectStatus.bind(this),
            updateRemoveBTDeviceError: this.updateRemoveBTDeviceError.bind(this),
            updateRemoveBTDeviceStatus: this.updateRemoveBTDeviceStatus.bind(this),
            updateRoutingStatus: this.updateRoutingStatus.bind(this),
        };

        const bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
        const modalias = bluezDeviceProxy.Modalias;

        const regex = /v009Ep([0-9A-Fa-f]{4})d/;
        const match = modalias.match(regex);
        if (!match) {
            this._log.info(`No device configuration found for modalias: ${modalias}`);
            return;
        }

        const modelId = match[1].toUpperCase();
        this._modelData = BoseBudsModelList.find(m => m.id === modelId);
        if (!this._modelData) {
            this._log.info(`No device configuration found for modalias: ${modalias}`);
            return;
        }

        this._log.info(`Configuration: ${JSON.stringify(this._modelData, null, 2)}`);

        this._config.battery1ShowOnDisconnect = true;
        this._config.showSettingsButton = true;

        this._initializeDeviceInfo();
        this._updateDeviceInfo();
        this._updateIcons();

        if (this._modelData.audioModes)
            this._setupAudioModeToggle();
        else if (this._modelData.anr)
            this._setupAnrToggle();

        if (this._modelData.audioModes?.showNCInterface)
            this._addCNC();

        if (this._modelData.audioModes?.spatialMode)
            this._addSpatialMode();

        const profile = {type: SppUUidType, uuid: SppUUid};

        this._boseBudsSocket = new BoseBudsSocket(
            this._devicePath,
            profileManager,
            profile,
            this._modelData,
            this._callbacks
        );

        if (this._modelData.dualConnection)
            this._updateOwnId();
    }

    _createModesArray() {
        const audioModes = this._modelData.audioModes;
        const modes = [];

        for (const preset of Object.values(audioModes.presets)) {
            modes[preset.index] = {
                ...audioModes.defaultConfig,
                ...preset,
            };
        }

        for (let index = 0; index < audioModes.totalModes; index++) {
            if (!modes[index]) {
                modes[index] = {
                    ...audioModes.defaultConfig,
                    index,
                };
            }
        }

        return modes;
    }

    _createDefaultGestureSettings() {
        const gestures = [];

        for (const button of Object.values(this._modelData.gestureOptions.buttons)) {
            for (const gesture of Object.values(button.gestures)) {
                const [, actionByte] = Object.entries(gesture.actions)[0];

                gestures.push({
                    id: button.id,
                    gesture: gesture.byte,
                    action: actionByte,
                });
            }
        }

        return gestures;
    }

    _initializeDeviceInfo() {
        const features = [
            {key: 'id', default: this._modelData.id, persist: true},
            {key: 'alias', default: this._alias, persist: true},
            {key: 'icon', default: this._modelData.budsIcon, persist: true},
            {key: 'fw-version', default: '', persist: true},
            {key: 'serial', default: '', persist: true},
        ];

        if (!this._modelData.batterySingle)
            features.push({key: 'case', default: `${this._modelData.case}`, persist: true});

        if (this._modelData.audioModes) {
            features.push({key: 'modes', default: this._createModesArray(), persist: true});
            features.push({key: 'current-mode', default: 0, persist: true});
            features.push({key: 'restore-mode', default: false, persist: true});
        }

        if (this._modelData.eq)
            features.push({key: 'eq-preset', default: 'flat', persist: true});


        if (this._modelData.eq?.bands !== undefined) {
            const def = new Array(this._modelData.eq.bands.length).fill(0);
            features.push({key: 'eq-custom', default: def, persist: true});
        }

        if (this._modelData.dualConnection) {
            features.push({key: 'multipoint', default: false, persist: true});
            features.push({key: 'dev-mgmt', default: [], persist: true});
            features.push({key: 'pairing-mode', default: false, persist: true});
            features.push({key: 'dev-mgmt-action', default: {action: 0, id: ''}, relay: true});
            features.push({key: 'active-dev', default: '', persist: true});
            features.push({key: 'own-dev', default: '', persist: true});
        }

        if (this._modelData.sideTone)
            features.push({key: 'side-tone', default: 0, persist: true});

        if (this._modelData.inEarSettings) {
            features.push({key: 'in-ear', default: false, persist: true});
            features.push({key: 'wear-detection-mode', default: 1, persist: true});
        }

        if (this._modelData.autoAnswer)
            features.push({key: 'auto-answer', default: false, persist: true});

        if (this._modelData.autoPause)
            features.push({key: 'auto-pause', default: false, persist: true});

        if (this._modelData.autoTransparency)
            features.push({key: 'auto-transp', default: false, persist: true});

        if (this._modelData.automaticPowerOffTimer) {
            const def = this._modelData.automaticPowerOffTimer[0];
            features.push({key: 'auto-power', default: def, persist: true});
        }

        if (this._modelData.voicePrompt) {
            features.push({key: 'voice-enabled', default: false, persist: true});
            features.push({key: 'voice-prompt', default: 0x01, persist: true});
            features.push({key: 'supported-voice', default: 0x00000002, persist: true});
            features.push({key: 'vobat-sup', default: false, persist: true});
            features.push({key: 'vobat-en', default: false, persist: true});
        }

        if (this._modelData.gestureOptions) {
            const def = this._createDefaultGestureSettings();
            features.push({key: 'gestures', default: def, persist: true});
        }

        this._devInfo = new DeviceInfo({
            settings: this._settings,
            settingsKey: 'bose-buds-list',
            devicePath: this._devicePath,
            features,
        });

        if (this._modelData.audioModes)
            this._audioModes = this._devInfo.getValue('modes');

        if (this._modelData.eq?.bands !== undefined)
            this._customEq = this._devInfo.getValue('eq-custom');

        if (this._modelData.dualConnection)
            this._deviceMgmtInfo = this._devInfo.getValue('dev-mgmt');

        if (this._modelData.gestureOptions)
            this._gestures = this._devInfo.getValue('gestures');


        const featureCallbacks = {
            'icon': () => this._updateIcons(),
            'case': () => this._updateIcons(),
            'modes': () => this._setAudioModes(),
            'current-mode': () => this._setCurAudioMode(),
            'restore-mode': () => this._setRestoreAudioMode(),
            'eq-custom': () => this._setEqCustom(),
            'multipoint': () => this._setMultipoint(),
            'dev-mgmt-action': () => this._setDeviceManagementAction(),
            'pairing-mode': () => this._setPairingMode(),
            'side-tone': () => this._setSideTone(),
            'in-ear': () => this._setInEarSettings(),
            'wear-detection-mode': () => this._configureMediaController(),
            'auto-answer': () => this._setAutoAnswer(),
            'auto-pause': () => this._setAutoPause(),
            'auto-transp': () => this._setAutoTransparency(),
            'auto-power': () => this._setAutoPowerOffTimer(),
            'voice-enabled': () => this._setVoicePrompt(),
            'voice-prompt': () => this._setVoicePrompt(),
            'vobat-en': () => this._setVoicePrompt(),
            'gestures': () => this._setGestures(),
        };

        this._devInfoSignalId = this._devInfo.connect('update-device', (info, feature) => {
            featureCallbacks[feature]?.();
        });
    }

    _configureMediaController() {
        const wearDetectionMode = this._devInfo.getValue('wear-detection-mode');
        const inEarSettings = this._devInfo.getValue('in-ear');
        const enableMediaController = wearDetectionMode !== 0 && inEarSettings;

        if (enableMediaController && !this._mediaController) {
            this._mediaController = new MediaController(this._settings, this._devicePath);

            this._mediaHandlerId = this._mediaController.connect(
                'notify::output-is-a2dp', () => {
                    this._outputIsA2dp = this._mediaController.output_is_a2dp;
                }
            );
            this._outputIsA2dp = this._mediaController.output_is_a2dp;
        } else if (!enableMediaController) {
            if (this._mediaHandlerId) {
                this._mediaController?.disconnect(this._mediaHandlerId);
                this._mediaHandlerId = null;
            }
            this._mediaController?.destroy();
            this._mediaController = null;
            this._bothBudsInEar = null;
            this._budInEar = null;
        }
    }

    _updateIcons() {
        this._config.commonIcon = this._devInfo.getValue('icon');
        this._config.albumArtIcon = this._devInfo.getValue('icon');
        this._config.battery1ShowOnDisconnect = true;

        if (this._modelData.batterySingle) {
            this._config.battery1Icon = this._devInfo.getValue('icon');
        } else {
            this._config.battery1Icon = `${this._devInfo.getValue('icon')}-left`;
            this._config.battery2Icon = `${this._devInfo.getValue('icon')}-right`;
            this._config.battery2ShowOnDisconnect = true;
            this._config.battery3Icon = this._devInfo.getValue('case');
        }

        this.dataHandler?.setConfig(this._config);
    }

    _updateDeviceInfo() {
        this._devInfo?.updateUI('id', this._modelData.id);
        this._devInfo?.updateUI('alias', this._alias);
    }

    updateFirmware(fwVersion) {
        this._devInfo?.updateUI('fw-version', fwVersion);
    }

    updateSerial(serial) {
        this._devInfo?.updateUI('serial', serial);
    }

    _setupAnrToggle() {
        const anr = this._modelData.anr;
        if (!anr)
            return;

        this._config.toggle1Title = _('Noise Control');
        this._props.toggle1Visible = true;

        const labels = {
            off: _('Off'),
            low: _('Low'),
            high: _('High'),
            wind: _('Wind'),
        };

        const icons = {
            off: 'bbm-anc-off-symbolic',
            low: 'bbm-transperancy-symbolic',
            high: 'bbm-anc-on-symbolic',
            wind: 'bbm-anc-wind-symbolic',
        };

        this._toggle1Modes = Object.keys(anr);

        for (let i = 1; i <= 4; i++) {
            this._config[`toggle1Button${i}Name`] = '';
            this._config[`toggle1Button${i}Icon`] = null;
        }

        this._toggle1Modes.forEach((mode, index) => {
            const button = index + 1;

            this._config[`toggle1Button${button}Name`] = labels[mode] ?? mode;
            this._config[`toggle1Button${button}Icon`] = icons[mode] ?? null;
        });
    }

    _setupAudioModeToggle() {
        this._log.info('Setup Audio mode toggle');

        this._config.toggle1Title = _('Modes');
        this._props.toggle1Visible = true;

        this._toggle1AudioModes = [];

        for (let i = 1; i <= 4; i++) {
            this._config[`toggle1Button${i}Name`] = '';
            this._config[`toggle1Button${i}Icon`] = null;
        }

        for (const mode of this._audioModes) {
            if (!mode.ui)
                continue;

            this._toggle1AudioModes.push(mode);
        }

        this._toggle1AudioModes.forEach((mode, index) => {
            const button = index + 1;
            const iconMode = AudioModes[mode.id];

            this._config[`toggle1Button${button}Name`] = mode.name;
            this._config[`toggle1Button${button}Icon`] = `bbm-mode-${iconMode}-symbolic`;
        });

        const entries = this._toggle1AudioModes.map((mode, index) => [mode.index, index + 1]);
        this._toggle1AudioModeMap = new Map(entries);
        this._config.labelIndicatorEnabled = 1;


        this.dataHandler?.setConfig(this._config);

        this.updateAudioModeCurrent(this._currentAudioMode, true);
    }

    _addCNC() {
        this._log.info('Add CNC UI');
        this._cncLevel = this._modelData.audioModes.nc.level / 2;
        this._cncEnabled = false;
        this._config.optionsBox1 = ['check-button'];
        this._config.box1CheckButton = [_('Noise Control')];
        this._config.optionsBox2 = ['check-button', 'slider'];
        this._config.box2CheckButton = [_('Noise Control')];
        this._config.box2SliderTitle = _('Noise Cancellation');
        this._props.optionsBoxVisible = 1;
        this.dataHandler?.setConfig(this._config);
    }

    _addSpatialMode() {
        this._log.info('Add Spatial Audio');
        this._config.toggle2Title = _('Spatial Audio');
        this._props.toggle2Visible = true;
        this._config.toggle2Button1Name = _('Off');
        this._config.toggle2Button1Icon = 'bbm-spatial-off-symbolic';
        this._config.toggle2Button2Name = _('Still');
        this._config.toggle2Button2Icon = 'bbm-spatial-still-symbolic';
        this._config.toggle2Button3Name = _('Motion');
        this._config.toggle2Button3Icon = 'bbm-spatial-motion-symbolic';
        this.dataHandler?.setConfig(this._config);
    }

    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level  ?? 0;
        const bat2level = battInfo.battery2Level  ?? 0;
        const bat3level = battInfo.battery3Level  ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

        this.dataHandler = new DataHandler(this._config, this._props);

        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect(
            'ui-action', (o, command, value) => {
                if (command === 'toggle1State')
                    this._toggle1ButtonClicked(value);

                if (command === 'toggle2State')
                    this._toggle2ButtonClicked(value);

                if (command === 'box1CheckButton1State')
                    this._box1CheckButton1StateChanged(value);

                if (command === 'box2SliderValue')
                    this._box2SliderValueChanged(value);

                if (command === 'box2SliderIsDragging')
                    this._box2SliderIsDragging(value);

                if (command === 'box2CheckButton1State')
                    this._box2CheckButton1StateChanged(value);

                if (command === 'settingsButtonClicked')
                    this._settingsButtonClicked();
            }
        );
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};

        if (!this._modelData)
            return;

        if (!this._modelData?.batteryMultiple)
            this._props.computedBatteryLevel = props.battery1Level;
        else
            this._props.computedBatteryLevel = buds2to1BatteryLevel(props);

        const isBatteryValid =
                props.battery1Level > 0 && props.battery1Status !== 'disconnected' ||
                props.battery2Level > 0 && props.battery2Status !== 'disconnected';

        if (!this._battInfoRecieved && isBatteryValid)
            this._startConfiguration(props);

        this.dataHandler?.setProps(this._props);
    }

    updateInEarState(bud1Status, bud2Status) {
        const bothBudsInEar = bud1Status && bud2Status;
        const budInEar = bud1Status || bud2Status;

        const bothBudsInEarChanged = this._bothBudsInEar !== bothBudsInEar;
        const budInEarChanged = this._budInEar !== budInEar;

        this._bothBudsInEar = bothBudsInEar;
        this._budInEar = budInEar;

        const wearDetectionMode = this._devInfo.getValue('wear-detection-mode');

        if (wearDetectionMode !== 0) {
            let playbackMode = null;

            if (wearDetectionMode === 1 && bothBudsInEarChanged)
                playbackMode = this._bothBudsInEar ? 'play' : 'pause';
            else if (wearDetectionMode === 2 && budInEarChanged)
                playbackMode = this._budInEar ? 'play' : 'pause';

            if (playbackMode)
                this._mediaController?.changeActivePlayerState(playbackMode);
        }
    }

    updateAnr(mode) {
        this._log.info(`updateAnr mode: ${hexBytes(mode)}`);
        const anr = this._modelData.anr;
        for (const [index, modeKey] of this._toggle1Modes.entries()) {
            if (anr[modeKey] === mode) {
                if (this._props.toggle1State !== index + 1) {
                    this._props.toggle1State = index + 1;
                    this.dataHandler?.setProps(this._props);
                }
                return;
            }
        }
    }

    _toggle1ButtonClicked(index) {
        if (this._modelData.audioModes)
            this._toggle1ButtonClickedAudioMode(index);
        else if (this._modelData.anr)
            this._toggle1ButtonClickedAnr(index);
    }

    _toggle1ButtonClickedAnr(index) {
        const mode = this._toggle1Modes[index - 1];
        if (!mode)
            return;

        const value = this._modelData.anr[mode];
        this._props.toggle1State = index;
        this.dataHandler?.setProps(this._props);
        this._boseBudsSocket?.setAnr(value);
    }

    _toggle1ButtonClickedAudioMode(index) {
        const mode = this._toggle1AudioModes[index - 1];

        if (!mode)
            return;

        this._props.toggle1State = index;
        this.dataHandler?.setProps(this._props);

        this._currentAudioMode = mode.index;
        this._devInfo?.updateUI('current-mode', mode.index);
        this._setCurrentAudioMode(mode.index);
    }

    updateAudioMode(mode) {
        this._log.info(`updateAudioMode id: ${mode.id}`);

        const index = this._audioModes.findIndex(m => m.id === mode.id);

        if (index === -1) {
            this._audioModes.push({...mode});
            this._devInfo?.updateUI('modes', this._audioModes);
            return;
        }

        const current = this._audioModes[index];
        const areModesEqual = (a, b) => {
            const areEqual = a.id === b.id &&
                a.editable === b.editable &&
                a.added === b.added &&
                a.fav === b.fav &&
                a.name === b.name &&
                a.flag === b.flag &&
                a.cnc === b.cnc &&
                a.autoCnc === b.autoCnc &&
                a.spatial === b.spatial &&
                a.wind === b.wind &&
                a.anc === b.anc;
            return areEqual;
        };

        if (!areModesEqual(current, mode)) {
            this._audioModes[index] = {...mode};
            this._devInfo?.updateUI('modes', this._audioModes);
        }
    }

    _setAudioModes() {
        const modes = this._devInfo.getValue('modes');
        const hasFavourites = this._modelData?.audioModes?.hasFavourites;
        let favoritesChanged = false;
        let uiModesChanged = false;
        const favorites = [];

        for (const mode of modes) {
            const isModeEqual = (a, b) => Object.keys(a).every(key => {
                if (key === 'ui' || key === 'fav')
                    return true;

                return a[key] === b[key];
            });

            const isFavoriteEqual = (a, b) => a.added === b.added && a.fav === b.fav;
            const isUiEqual = (a, b) => a.added === b.added && a.ui === b.ui;


            const current = this._audioModes.find(m => m.index === mode.index);

            if (!current || !isModeEqual(current, mode))
                this._boseBudsSocket?.setAudioMode(mode);

            if (current && !isFavoriteEqual(current, mode))
                favoritesChanged = true;

            if (current && !isUiEqual(current, mode))
                uiModesChanged = true;

            if (hasFavourites && mode.added && mode.fav)
                favorites.push(mode.index);
        }

        if (hasFavourites && favoritesChanged)
            this._setAudioModeFavorites(favorites);

        this._audioModes = modes.map(mode => ({...mode}));

        if (uiModesChanged)
            this._setupAudioModeToggle();
    }

    updateAudioModeCurrent(index, uiUpdate = false) {
        this._log.info(`updateAudioModeCurrent index: ${index}`);

        const mode = this._audioModes.find(m => m.index === index);
        const text = mode?.name ?? '';

        if (!uiUpdate && this._currentAudioMode !== index) {
            this._currentAudioMode = index;
            this._devInfo?.updateUI('current-mode', index);
        }

        const toggleIndex = this._toggle1AudioModeMap?.get(index) ?? 0;

        let propsChanged = false;

        if (this._props.toggle1State !== toggleIndex) {
            this._props.toggle1State = toggleIndex;
            propsChanged = true;
        }

        if (this._props.labelIndicator1 !== text) {
            this._props.labelIndicator1 = text;
            propsChanged = true;
        }

        if (propsChanged)
            this.dataHandler?.setProps(this._props);
    }

    _setCurAudioMode() {
        this._currentAudioMode = this._devInfo.getValue('current-mode');
        this._setCurrentAudioMode(this._currentAudioMode);
        this.updateAudioModeCurrent(this._currentAudioMode, true);
    }

    _setCurrentAudioMode(index) {
        const mode = this._audioModes.find(m => m.index === index);
        const toggleIndex = this._toggle1AudioModeMap?.get(index) ?? 0;

        let propsChanged = false;

        if (this._props.toggle1State !== toggleIndex) {
            this._props.toggle1State = toggleIndex;
            propsChanged = true;
        }

        const text = mode?.name ?? '';
        if (this._props.labelIndicator1 !== text) {
            this._props.labelIndicator1 = text;
            propsChanged = true;
        }

        if (propsChanged)
            this.dataHandler?.setProps(this._props);

        this._boseBudsSocket?.setCurrentAudioMode(index);
    }

    updateAudioModeFavorites(modeCount, favorites) {
        this._log.info(`updateAudioModeFavorites favorites: ${JSON.stringify(favorites)}`);
        this._modeCount = modeCount;
    }

    _setAudioModeFavorites(favorites) {
        this._boseBudsSocket?.setAudioModeFavorites(this._modeCount, favorites);
    }

    updateAudioModeRestore(enabled) {
        this._log.info(`updateAudioModeRestore enabled: ${enabled}`);
        this._devInfo?.updateUI('restore-mode', enabled);
    }

    _setRestoreAudioMode() {
        const enable = this._devInfo.getValue('restore-mode');
        this._boseBudsSocket?.setRestoreAudioMode(enable);
    }

    updateCnc(level, enabled) {
        this._log.info(`updateCnc level: ${level} enabled: ${enabled}`);
        const nc = this._modelData.audioModes?.nc;
        if (!nc)
            return;

        const maxLevel = nc.level;
        const step = nc.steps;
        level = Math.max(0, Math.min(maxLevel, level));
        level = Math.round(level / step) * step;
        if (this._cncLevel === level && this._cncEnabled === enabled)
            return;

        this._cncLevel = level;
        this._cncEnabled = enabled;
        this._props.box1CheckButton1State = enabled;
        this._props.box2CheckButton1State = enabled;
        this._props.optionsBoxVisible = enabled ? 2 : 1;
        this._props.box2SliderValue = level * 100 / maxLevel;
        this.dataHandler?.setProps(this._props);
    }

    _box1CheckButton1StateChanged(value) {
        const enabled = value === 1;
        if (this._cncEnabled === enabled)
            return;

        this._cncEnabled = enabled;
        this._boseBudsSocket?.setCnc(this._cncLevel, this._cncEnabled);
        this._props.box1CheckButton1State = value;
        this._props.box2CheckButton1State = value;
        this._props.optionsBoxVisible = enabled ? 2 : 1;
        this.dataHandler?.setProps(this._props);
    }

    _box2CheckButton1StateChanged(value) {
        const enabled = value === 1;
        if (this._cncEnabled === enabled)
            return;

        this._cncEnabled = enabled;
        this._boseBudsSocket?.setCnc(this._cncLevel, this._cncEnabled);
        this._props.box1CheckButton1State = value;
        this._props.box2CheckButton1State = value;
        this._props.optionsBoxVisible = enabled ? 2 : 1;
        this.dataHandler?.setProps(this._props);
    }

    _box2SliderValueChanged(value) {
        const nc = this._modelData.audioModes?.nc;
        const maxLevel = nc.level;
        const step = nc.steps;

        let level = Math.round(value * maxLevel / 100);
        level = Math.max(0, Math.min(maxLevel, level));
        level = Math.round(level / step) * step;

        if (this._cncLevel === level)
            return;

        this._cncLevel = level;
        this._props.box2SliderValue = this._cncLevel * 100 / maxLevel;
        this._boseBudsSocket?.setCnc(level, this._cncEnabled);
    }

    _box2SliderIsDragging(value) {
        if (value === 0) {
            const maxLevel = this._modelData.audioModes.nc.level;
            this._props.box2SliderValue = this._cncLevel * 100 / maxLevel;
            this.dataHandler?.setProps(this._props);
        }
    }

    updateSpatialAudio(mode) {
        if (mode < 0 || mode > 2)
            return;

        this._props.toggle2State = mode + 1;
        this.dataHandler?.setProps(this._props);
    }

    _toggle2ButtonClicked(index) {
        const mode = index - 1;
        this._props.toggle2State = index;
        this.dataHandler?.setProps(this._props);
        this._boseBudsSocket?.setSpatialAudio(mode);
    }

    updateEq(arr) {
        const gains = arr.map(({current}) => current);
        let preset = 'custom';

        for (const [name, values] of Object.entries(this._modelData.eq.presets ?? {})) {
            if (gains.length === values.length && gains.every((value, i) => value === values[i])) {
                preset = name;
                break;
            }
        }

        this._devInfo?.updateUI('eq-preset', preset);
        this._devInfo?.updateUI('eq-custom', arr);
    }

    _setEqCustom() {
        const newGains = this._devInfo.getValue('eq-custom');
        if (!this._customEq || !isArrayEqual(newGains, this._customEq)) {
            const oldGains = this._customEq;
            this._customEq = newGains;

            for (let i = 0; i < (oldGains?.length ?? 0); i++) {
                if (oldGains[i] !== newGains[i])
                    this._boseBudsSocket?.setEq(newGains[i], i);
            }
        }
    }

    updateSideTone(level) {
        this._log.info(`updateSideTone level: ${level}`);
        this._devInfo?.updateUI('side-tone', level);
    }

    _setSideTone() {
        const level = this._devInfo.getValue('side-tone');
        this._boseBudsSocket?.setSideTone(level);
    }

    updateDualConnection(enabled) {
        this._log.info(`updateDualConnection enabled: ${enabled}`);
        this._devInfo?.updateUI('multipoint', enabled);
    }

    _setMultipoint() {
        const enabled = this._devInfo.getValue('multipoint');
        this._boseBudsSocket?.setDualConnection(enabled);
    }

    updateInEarSettings(enabled, autoPause, autoAnswer, autoTransparency) {
        this._log.info(`updateInEarSettings enabled: ${enabled}, ` +
            `autoPause: ${autoPause}, autoAnswer: ${autoAnswer}, ` +
            `autoTransparency: ${autoTransparency}`);

        this._devInfo?.updateUI('in-ear', enabled);
        this._devInfo?.updateUI('auto-pause', autoPause);
        this._devInfo?.updateUI('auto-answer', autoAnswer);
        this._devInfo?.updateUI('auto-transp', autoTransparency);
    }

    _setInEarSettings() {
        const enabled = this._devInfo.getValue('in-ear');
        const autoPause = this._devInfo.getValue('auto-pause');
        const autoAnswer = this._devInfo.getValue('auto-answer');
        const autoTransparency = this._devInfo.getValue('auto-transp');
        this._boseBudsSocket?.setInEarSettings(enabled, autoPause, autoAnswer, autoTransparency);
    }

    updateAutoAnswer(enabled) {
        this._log.info(`updateAutoAnswer enabled: ${enabled}`);
        this._devInfo?.updateUI('auto-answer', enabled);
    }

    _setAutoAnswer() {
        if (this._modelData.inEarSettings) {
            this._setInEarSettings();
        } else {
            const enabled = this._devInfo.getValue('auto-answer');
            this._boseBudsSocket?.setAutoAnswer(enabled);
        }
    }

    updateAutoPause(enabled) {
        this._log.info(`updateAutoPause enabled: ${enabled}`);
        this._devInfo?.updateUI('auto-pause', enabled);
    }

    _setAutoPause() {
        if (this._modelData.inEarSettings) {
            this._setInEarSettings();
        } else {
            const enabled = this._devInfo.getValue('auto-pause');
            this._boseBudsSocket?.setAutoPause(enabled);
        }
    }

    updateAutoTransparency(enabled) {
        this._log.info(`updateAutoTransparency enabled: ${enabled}`);
        this._devInfo?.updateUI('auto-transp', enabled);
    }

    _setAutoTransparency() {
        if (this._modelData.inEarSettings) {
            this._setInEarSettings();
        } else {
            const enabled = this._devInfo.getValue('auto-transp');
            this._boseBudsSocket?.setAutoTransparency(enabled);
        }
    }

    updateAutoPowerOffTimer(minutes) {
        this._log.info(`updateAutoPowerOffTimer minutes: ${minutes}`);
        this._devInfo?.updateUI('auto-power', minutes);
    }

    _setAutoPowerOffTimer() {
        const minutes = this._devInfo.getValue('auto-power');
        this._boseBudsSocket?.setAutoPowerOffTimer(minutes);
    }

    updateVoicePrompt(enabled, language, supported, batSupported, batEnabled) {
        this._devInfo?.updateUI('voice-enabled', enabled);
        this._devInfo?.updateUI('voice-prompt', language);
        this._devInfo?.updateUI('supported-voice', supported);
        this._devInfo?.updateUI('vobat-sup', batSupported);
        this._devInfo?.updateUI('vobat-en', batEnabled);
    }

    _setVoicePrompt() {
        const voicePrompt = this._devInfo.getValue('voice-prompt');
        if (voicePrompt === 0xFF)
            return;

        const voiceEnabled = this._devInfo.getValue('voice-enabled');
        const voiceBatSupported = this._devInfo.getValue('vobat-sup');
        const voiceBatEnabled = this._devInfo.getValue('vobat-en');

        this._boseBudsSocket?.setVoicePrompt(voiceEnabled, voicePrompt,
            voiceBatSupported, voiceBatEnabled);
    }

    updateActionButton(buttonId, eventType, action) {
        this._log.info(`updateActionButton buttonId: ${hexBytes(buttonId)}, ` +
                `eventType: ${hexBytes(eventType)}, action: ${hexBytes(action)}`);

        const index = this._gestures.findIndex(g => g.id === buttonId && g.gesture === eventType);

        if (index === -1)
            return;

        if (this._gestures[index].action === action)
            return;

        this._gestures[index] = {...this._gestures[index], action};
        this._devInfo?.updateUI('gestures', this._gestures);
    }

    _setGestures() {
        const gestures = this._devInfo.getValue('gestures') ?? [];

        const getGestureKey = g => g.id << 8 | g.gesture;

        const oldGestures = new Map(
            (this._gestures ?? []).map(g => [getGestureKey(g), g])
        );

        for (const gesture of gestures) {
            const old = oldGestures.get(getGestureKey(gesture));

            if (!old || old.action !== gesture.action)
                this._boseBudsSocket?.setActionButton(gesture.id, gesture.gesture, gesture.action);
        }

        this._gestures = gestures;
    }

    updateBTDeviceList(devices) {
        this._log.info('updateBTDeviceList');
        const deviceSet = new Set(devices);
        this._deviceMgmtInfo = this._deviceMgmtInfo.filter(info => deviceSet.has(info.id));

        for (const id of devices) {
            if (!this._deviceMgmtInfo.some(info => info.id === id)) {
                this._deviceMgmtInfo.push({
                    id,
                    name: '',
                    connected: false,
                    state: BtDeviceState.NotInitialized,
                });
            }
        }

        this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
    }

    updateBTDeviceInfo(mac, name, connected) {
        this._log.info(`updateBTDeviceInfo connected: ${connected}`);

        this._stopBTTimeout(mac);

        const device = this._deviceMgmtInfo.find(info => info.id === mac);
        if (!device)
            return;

        let changed = false;

        if (device.name !== name) {
            device.name = name;
            changed = true;
        }

        if (device.connected !== connected) {
            device.connected = connected;
            changed = true;
        }

        if (device.state !== BtDeviceState.Ready) {
            device.state = BtDeviceState.Ready;
            changed = true;
        }

        if (changed)
            this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
    }

    updatePairingMode(enabled) {
        this._log.info(`updatePairingMode enabled: ${enabled}`);
        this._devInfo?.updateUI('pairing-mode', enabled);
    }

    _setPairingMode() {
        const enabled = this._devInfo.getValue('pairing-mode');
        this._boseBudsSocket?.setPairingMode(enabled);
    }

    _startBTTimeout(id, operation) {
        const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
            const pending = this._pendingBTOperations.get(id);

            if (!pending)
                return GLib.SOURCE_REMOVE;

            const device = this._deviceMgmtInfo.find(info => info.id === id);

            if (device) {
                device.state = BtDeviceState.Ready;
                this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
            }

            this._pendingBTOperations.delete(id);

            return GLib.SOURCE_REMOVE;
        });

        this._pendingBTOperations.set(id, {operation, timeoutId});
    }


    _stopBTTimeout(id) {
        const pending = this._pendingBTOperations.get(id);
        if (!pending)
            return;

        if (pending.timeoutId)
            GLib.Source.remove(pending.timeoutId);

        this._pendingBTOperations.delete(id);
    }

    updateConnectError() {
        const pending = [...this._pendingBTOperations.entries()]
                .find(([, pending]) => pending.operation === 'connect');

        if (!pending)
            return;

        const [id] = pending;
        const device = this._deviceMgmtInfo.find(device => device.id === id);

        if (device) {
            device.state = BtDeviceState.Ready;
            this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
        }

        this._stopBTTimeout(id);
    }

    updateConnectStatus(id, connected) {
        const device = this._deviceMgmtInfo.find(info => info.id === id);

        if (!device)
            return;

        this._stopBTTimeout(id);
        device.connected = connected;
        device.state = BtDeviceState.Ready;
        this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
    }

    _connectBTDevice(id) {
        const device = this._deviceMgmtInfo.find(info => info.id === id);
        if (!device)
            return;

        if (this._pendingBTOperations.has(id))
            return;

        device.state = BtDeviceState.Processing;
        this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
        this._startBTTimeout(id, 'connect');
        this._boseBudsSocket?.connectBTDevice(id);
    }

    updateDisconnectError() {
        const pending = [...this._pendingBTOperations.entries()]
                .find(([, pending]) => pending.operation === 'disconnect');

        if (!pending)
            return;

        const [id] = pending;
        const device = this._deviceMgmtInfo.find(device => device.id === id);

        if (device) {
            device.state = BtDeviceState.Ready;
            this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
        }

        this._stopBTTimeout(id);
    }

    updateDisconnectStatus(id) {
        const device = this._deviceMgmtInfo.find(device => device.id === id);

        if (!device)
            return;

        device.connected = false;
        device.state = BtDeviceState.Ready;
        this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
        this._stopBTTimeout(id);
    }

    _disconnectBTDevice(id) {
        const device = this._deviceMgmtInfo.find(info => info.id === id);
        if (!device)
            return;

        if (this._pendingBTOperations.has(id))
            return;

        device.state = BtDeviceState.Processing;
        this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
        this._startBTTimeout(id, 'disconnect');
        this._boseBudsSocket?.disconnectBTDevice(id);
    }

    updateRemoveBTDeviceError() {
        const pending = [...this._pendingBTOperations.entries()]
                .find(([, pending]) => pending.operation === 'remove');

        if (!pending)
            return;

        const [id] = pending;
        const device = this._deviceMgmtInfo.find(device => device.id === id);

        if (device) {
            device.state = BtDeviceState.Ready;
            this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
        }

        this._stopBTTimeout(id);
    }

    updateRemoveBTDeviceStatus(id) {
        this._deviceMgmtInfo = this._deviceMgmtInfo.filter(device => device.id !== id);
        this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
        this._stopBTTimeout(id);
    }

    _removeBTDevice(id) {
        const device = this._deviceMgmtInfo.find(info => info.id === id);
        if (!device)
            return;

        if (this._pendingBTOperations.has(id))
            return;

        device.state = BtDeviceState.Processing;
        this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
        this._startBTTimeout(id, 'remove');
        this._boseBudsSocket?.removeBTDevice(id);
    }

    updateRoutingStatus(id) {
        if (this._activeDevice !== id) {
            this._activeDevice = id;
            this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
        }
    }

    _setRoutingBTDevice(id) {
        this._boseBudsSocket?.setRoutingBTDevice(id);
    }

    _refreshBTDevice() {
        for (const device of this._deviceMgmtInfo)
            device.state = BtDeviceState.Processing;

        this._devInfo?.updateUI('dev-mgmt', this._deviceMgmtInfo);
        this._boseBudsSocket?.refreshBTDevice();
    }

    _setDeviceManagementAction() {
        const devMgmtAction = this._devInfo.getValue('dev-mgmt-action');
        switch (devMgmtAction.action) {
            case DeviceManagementAction.Connect:
                this._connectBTDevice(devMgmtAction.id);
                break;

            case DeviceManagementAction.Disconnect:
                this._disconnectBTDevice(devMgmtAction.id);
                break;

            case DeviceManagementAction.Remove:
                this._removeBTDevice(devMgmtAction.id);
                break;

            case DeviceManagementAction.Routing:
                this._setRoutingBTDevice(devMgmtAction.id);
                break;

            case DeviceManagementAction.Refresh:
                this._refreshBTDevice();
                break;
        }
    }

    async _updateOwnId() {
        const ownMac = await getAdapterMac();

        if (!ownMac)
            return;

        const id = ownMac.replaceAll(':', '').toLowerCase();
        this._devInfo?.updateUI('own-dev', id);
    }

    _settingsButtonClicked() {
        if (this._configureWindow) {
            this._configureWindow.present();
        } else {
            this._configureWindow = new ConfigureWindow(this._devInfo, this._modelData);
            this._configureWindow.connect('close-request', () => {
                this._configureWindow = null;
            });
            this._configureWindow.present();
        }
    }

    destroy() {
        this._configureWindow?.close();
        this._configureWindow = null;

        this._boseBudsSocket?.destroy();
        this._boseBudsSocket = null;

        for (const {timeoutId} of this._pendingBTOperations.values())
            GLib.Source.remove(timeoutId);

        this._pendingBTOperations.clear();

        if (this._devInfoSignalId)
            this._devInfo?.disconnect(this._devInfoSignalId);
        this._devInfoSignalId = null;
        this._devInfo = null;

        if (this._dataHandlerId)
            this.dataHandler?.disconnect(this._dataHandlerId);
        this._dataHandlerId = null;
        this.dataHandler = null;

        if (this._mediaHandlerId)
            this._mediaController?.disconnect(this._mediaHandlerId);
        this._mediaHandlerId = null;
        this._mediaController?.destroy();
        this._mediaController = null;
        this._settings = null;
        this._battInfoRecieved = false;
    }
});

