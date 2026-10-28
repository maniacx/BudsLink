'use strict';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier} from '../logger.js';
import {getBluezDeviceProxy} from '../../bluezDeviceProxy.js';
import {DeviceInfo} from '../../deviceInfo.js';
import {buds2to1BatteryLevel} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {MediaController} from '../mediaController.js';
import {AirpodsSocket} from './airpodsSocket.js';
import {
    AirpodsModelList, ANCMode, AwarenessMode, EarDetection,
    PressSpeedMode, PressDurationMode, VolSwipeLength
} from './airpodsConfig.js';

import {ConfigureWindow} from '../../../preferences/devices/airpods/configureWindow.js';

export const DeviceTypeAirpods = 'airpods';

const AirpodsUUID = '74ec2172-0bad-4d01-8f77-997b2be0722a';
export function isAirpods(bluezDeviceProxy, uuids) {
    const bluezProps = ['Modalias'];
    let supported = 'no';

    if (!uuids.includes(AirpodsUUID))
        return {supported, bluezProps};

    const modalias = bluezDeviceProxy.Modalias;
    if (!modalias) {
        supported = 'pending';
        return {supported, bluezProps};
    }

    const regex = /v004Cp([0-9A-Fa-f]{4})d/;
    const match = modalias.match(regex);
    if (!match)
        return {supported, bluezProps};

    const model = match[1].toUpperCase();
    if (AirpodsModelList.some(m => m.key === model))
        supported = 'yes';

    return {supported, bluezProps};
}

export const AirpodsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_AirpodsDevice',
}, class AirpodsDevice extends GObject.Object {
    _init(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super._init();
        const identifier = getDeviceIdentifier(devicePath);
        const tag = `AirpodsDevice-${identifier}`;
        this._log = createLogger(tag);
        this._log.info('------------------- AirpodsDevice init -------------------');
        const now = Date.now();
        this._settings = settings;
        this._devicePath = devicePath;
        this._alias = alias;
        this._extPath = extPath;
        this.updateDeviceMapCb = updateDeviceMapCb;

        this._config = createConfig();
        this._props = createProperties();
        this._model = null;
        this._budInEar = false;
        this._bothBudsInEar = false;
        this._battInfoRecieved = false;

        this._callbacks = {
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateAncMode: this.updateAncMode.bind(this),
            updateAdaptiveLevel: this.updateAdaptiveLevel.bind(this),
            updateAwarenessMode: this.updateAwarenessMode.bind(this),
            updateAwarenessData: this.updateAwarenessData.bind(this),
            updateInEarStatus: this.updateInEarStatus.bind(this),

            updatePressSpeed: this.updatePressSpeed.bind(this),
            updatePressDuration: this.updatePressDuration.bind(this),
            updateVolSwipeLength: this.updateVolSwipeLength.bind(this),
            updateVolSwipeMode: this.updateVolSwipeMode.bind(this),
            updateNotificationToneMode: this.updateNotificationToneMode.bind(this),
        };
        this._initialize(profileManager);
    }

    _initialize(profileManager) {
        this._bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
        const modalias = this._bluezDeviceProxy.Modalias;
        const regex = /v004Cp([0-9A-Fa-f]{4})d/;
        const match = modalias.match(regex);
        if (!match)
            return;

        this._model = match[1].toUpperCase();
        this._modelData = AirpodsModelList.find(m => m.key === this._model);
        this._log.info(`Configuration: ${JSON.stringify(this._modelData, null, 2)}`);


        this._commonIcon = this._modelData.budsIcon;
        this._config.battery1ShowOnDisconnect = true;
        this._config.showSettingsButton = true;

        if (this._modelData.batteryType !== 1)
            this._caseIcon = `${this._modelData.case}`;

        this._initializeDeviceInfo();
        this._updateIcons();
        this._updateAncConfig();
        this._updateAwarnessConfig();

        const profile = {type: DeviceTypeAirpods, uuid: AirpodsUUID};

        this._airpodsSocket = new AirpodsSocket(
            this._devicePath,
            profileManager,
            profile,
            this._modelData,
            this._callbacks
        );
    }

    _updateIcons() {
        this._config.commonIcon = this._commonIcon;
        this._config.albumArtIcon = this._commonIcon;

        this._config.battery1ShowOnDisconnect = true;
        if (this._modelData.batteryType !== 1) {
            this._config.battery1Icon = `${this._commonIcon}-left`;
            this._config.battery2Icon = `${this._commonIcon}-right`;
            this._config.battery2ShowOnDisconnect = true;
            this._config.battery3Icon = this._caseIcon;
        } else {
            this._config.battery1Icon = this._commonIcon;
        }

        this.dataHandler?.setConfig(this._config);
    }

    _updateAncConfig() {
        if (!this._modelData.ancSupported)
            return;

        this._config.toggle1Title = _('Noise Control');

        const allowOff = !this._modelData.enableTurnOffListeningMode ||
                this._modelData.enableTurnOffListeningMode && this._lisMode;

        const modes = [];

        if (allowOff)
            modes.push('off');

        modes.push('transparency');

        if (this._modelData.adaptiveSupported)
            modes.push('adaptive');

        modes.push('anc');

        this._toggle1Modes = modes;

        const icons = {
            off: 'bbm-anc-off-symbolic',
            transparency: 'bbm-transperancy-symbolic',
            adaptive: 'bbm-adaptive-symbolic',
            anc: 'bbm-anc-on-symbolic',
        };

        const labels = {
            off: _('Off'),
            transparency: _('Transparency'),
            adaptive: _('Adaptive'),
            anc: _('Noise Cancellation'),
        };

        const ncModes = {
            off: ANCMode.ANC_OFF,
            transparency: ANCMode.TRANSPARENCY,
            adaptive: ANCMode.ADAPTIVE,
            anc: ANCMode.ANC_ON,
        };

        this._toggle1ButtonToAncMode = [];

        for (let i = 1; i <= 4; i++) {
            this._config[`toggle1Button${i}Icon`] = '';
            this._config[`toggle1Button${i}Name`] = '';
            this._toggle1ButtonToAncMode[i] = null;
        }

        modes.forEach((mode, index) => {
            const button = index + 1;

            this._config[`toggle1Button${button}Icon`] = icons[mode];
            this._config[`toggle1Button${button}Name`] = labels[mode];

            this._toggle1ButtonToAncMode[button] = ncModes[mode];
        });

        if (this._modelData.adaptiveSupported) {
            this._config.optionsBox1 = ['slider'];
            this._config.box1SliderTitle = _('Ambient Level');
        }
    }

    _updateAwarnessConfig() {
        if (this._modelData.awarenessSupported) {
            this._config.toggle2Title = _('Conversation Awareness');
            this._config.toggle2Button1Icon = 'bbm-ca-on-symbolic';
            this._config.toggle2Button1Name = _('On');
            this._config.toggle2Button2Icon = 'bbm-ca-off-symbolic';
            this._config.toggle2Button2Name = _('Off');
        }
    }

    _initializeDeviceInfo() {
        const features = [
            {key: 'alias', default: this._alias, persist: false},
            {key: 'icon', default: this._commonIcon, persist: true},
            {key: 'wear-detection-mode', default: 1, persist: true},
        ];

        if (this._modelData.batteryType !== 1)
            features.push({key: 'case', default: this._caseIcon, persist: true});

        if (this._modelData.enableTurnOffListeningMode)
            features.push({key: 'listening-mode', default: true, persist: true});

        if (this._modelData.awarenessSupported) {
            features.push({key: 'ca-volume-enabled', default: true, persist: true});
            features.push({key: 'ca-volume', default: 20, persist: true});
        }

        if (this._modelData.longPressCycleSupported)
            features.push({key: 'lp-value', default: 6, persist: true});

        if (this._modelData.toneVolumeSupported)
            features.push({key: 'noti-vol', default: 77, persist: true});

        if (this._modelData.volumeSwipeSupported) {
            features.push({key: 'swipe-mode', default: true, persist: true});
            features.push({key: 'swipe-len', default: 0, persist: true});
        }

        if (this._modelData.pressSpeedDurationSupported) {
            features.push({key: 'press-speed', default: 0, persist: true});
            features.push({key: 'press-dur', default: 0, persist: true});
        }

        this._devInfo = new DeviceInfo({
            settings: this._settings,
            settingsKey: 'airpods-list',
            devicePath: this._devicePath,
            features,
        });

        this._commonIcon = this._devInfo.getValue('icon');
        this._caseIcon = this._devInfo.getValue('case');
        this._wearDetectionMode = this._devInfo.getValue('wear-detection-mode');
        this._caVolume = this._devInfo.getValue('ca-volume');
        this._caVolEnabled = this._devInfo.getValue('ca-volume-enabled');
        this._lisMode = this._devInfo.getValue('listening-mode');

        this._devInfoSignalId = this._devInfo.connect('update-device', (info, feature) => {
            const value = info.getValue(feature);

            switch (feature) {
                case 'icon':
                    this._commonIcon = value;
                    this._updateIcons();
                    break;

                case 'case':
                    this._caseIcon = value;
                    this._updateIcons();
                    break;

                case 'wear-detection-mode':
                    this._wearDetectionMode = value;
                    this._configureMediaController();
                    break;

                case 'ca-volume':
                    this._caVolume = value;
                    break;

                case 'ca-volume-enabled':
                    if (this._caVolEnabled && !value) {
                        this._mediaController?.setConversationAwarenessVolume(
                            false, this._caVolume);
                    }

                    this._caVolEnabled = value;
                    break;

                case 'listening-mode':
                    this._lisMode = value;
                    this._setListMode(value);
                    break;

                case 'lp-value':
                    this._setLongpressCycle(value);
                    break;

                case 'noti-vol':
                    this._setNotiVolume(value);
                    break;

                case 'swipe-mode':
                    this._setSwipeMode(value);
                    break;

                case 'swipe-len':
                    this._setSwipeLength(value);
                    break;

                case 'press-speed':
                    this._setPressSpeed(value);
                    break;

                case 'press-dur':
                    this._setPressDur(value);
                    break;
            }
        });
    }

    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level  ?? 0;
        const bat2level = battInfo.battery2Level  ?? 0;
        const bat3level = battInfo.battery3Level  ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

        this._configureMediaController();

        if (this._modelData.enableTurnOffListeningMode)
            this._setListMode(this._lisMode, true);

        this.dataHandler = new DataHandler(this._config, this._props);

        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect(
            'ui-action', (o, command, value) => {
                if (command === 'toggle1State')
                    this._toggle1ButtonClicked(value);

                if (command === 'toggle2State')
                    this._toggle2ButtonClicked(value);

                if (command === 'box1SliderValue')
                    this._setSliderChanged(value);

                if (command === 'settingsButtonClicked')
                    this._settingsButtonClicked();
            }
        );
    }

    _configureMediaController() {
        const enableMediaController =
                this._wearDetectionMode !== 0 || this._modelData.awarenessSupported;

        if (enableMediaController && !this._mediaController) {
            this._mediaController = new MediaController(this._settings, this._devicePath);

            this._mediaHandlerId = this._mediaController.connect(
                'notify::output-is-a2dp', () => {
                    this._outputIsA2dp = this._mediaController.output_is_a2dp;
                    this._updatetoggleVisibility();
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
        }
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};

        if (this._modelData.batteryType === 1)
            this._props.computedBatteryLevel = props.battery1Level;
        else
            this._props.computedBatteryLevel = buds2to1BatteryLevel(props);

        if (!this._battInfoRecieved)
            this._startConfiguration(props);

        this.dataHandler?.setProps(this._props);
    }

    updateAncMode(ancMode) {
        if (!this._modelData.ancSupported)
            return;

        if (ancMode !== null)
            this._ancMode = ancMode;

        let index = this._toggle1ButtonToAncMode?.findIndex(v => v === this._ancMode);

        if (index < 0)
            index = 0;

        this._props.toggle1State = index;

        this._props.optionsBoxVisible =
            this._modelData.adaptiveSupported && ancMode === ANCMode.ADAPTIVE ? 1 : 0;

        this.dataHandler?.setProps(this._props);
    }

    updateAdaptiveLevel(level) {
        const inverseLevel = 100 - level;
        this._inverseLevel = inverseLevel;
        this._props.box1SliderValue = inverseLevel;
        this.dataHandler?.setProps(this._props);
    }

    updateAwarenessMode(mode) {
        if (!this._modelData.awarenessSupported)
            return;

        if (mode === AwarenessMode.ON)
            this._props.toggle2State = 1;
        else if (mode === AwarenessMode.OFF)
            this._props.toggle2State = 2;

        this.dataHandler?.setProps(this._props);
    }

    _updatetoggleVisibility() {
        const toggle1Visible = this._budInEar && this._modelData.ancSupported;
        const toggle2Visible =
            this._bothBudsInEar  && this._modelData.awarenessSupported && this._outputIsA2dp;

        this._props.toggle1Visible = toggle1Visible;
        this._props.toggle2Visible = toggle2Visible;
        this.dataHandler?.setProps(this._props);
    }

    updateInEarStatus(bud1Status, bud2Status) {
        this._bothBudsInEar =
            bud1Status === EarDetection.IN_EAR && bud2Status === EarDetection.IN_EAR;

        this._budInEar =
            bud1Status === EarDetection.IN_EAR || bud2Status === EarDetection.IN_EAR;

        this._updatetoggleVisibility();

        if (this._wearDetectionMode !== 0) {
            let playbackMode = null;

            if (this._wearDetectionMode === 1)
                playbackMode = this._bothBudsInEar ? 'play' : 'pause';
            else if (this._wearDetectionMode === 2)
                playbackMode = this._budInEar ? 'play' : 'pause';

            if (playbackMode)
                this._mediaController?.changeActivePlayerState(playbackMode);
        }
    }

    updateAwarenessData(attenuated) {
        if (this._caVolEnabled)
            this._mediaController?.setConversationAwarenessVolume(attenuated, this._caVolume);
    }

    updateNotificationToneMode(level) {
        this._devInfo?.updateUI('noti-vol', level);
    }

    updateVolSwipeMode(state) {
        this._devInfo?.updateUI('swipe-mode', state);
    }

    updateVolSwipeLength(duration) {
        let index;
        if (duration === VolSwipeLength.DEFAULT)
            index = 0;
        else if (duration === VolSwipeLength.LONGER)
            index = 1;
        else
            index = 2;

        this._devInfo?.updateUI('swipe-len', index);
    }

    updatePressSpeed(speed) {
        let index;
        if (speed === PressSpeedMode.DEFAULT)
            index = 0;
        else if (speed === PressSpeedMode.SLOWER)
            index = 1;
        else
            index = 2;

        this._devInfo?.updateUI('press-speed', index);
    }

    updatePressDuration(duration) {
        let index;
        if (duration === PressDurationMode.DEFAULT)
            index = 0;
        else if (duration === PressDurationMode.SLOWER)
            index = 1;
        else
            index = 2;

        this._devInfo?.updateUI('press-dur', index);
    }

    _toggle1ButtonClicked(index) {
        const ancMode = this._toggle1ButtonToAncMode?.[index];
        if (ancMode == null)
            return;

        this._props.toggle1State = index;
        this._props.optionsBoxVisible =
            this._modelData.adaptiveSupported && ancMode === ANCMode.ADAPTIVE ? 1 : 0;
        this.dataHandler?.setProps(this._props);
        this._airpodsSocket?.setAncMode(ancMode);
    }

    _toggle2ButtonClicked(index) {
        this._props.toggle2State = index;
        this.dataHandler?.setProps(this._props);
        if (index === 1)
            this._airpodsSocket?.setAwarenessMode(AwarenessMode.ON);
        else if (index === 2)
            this._airpodsSocket?.setAwarenessMode(AwarenessMode.OFF);
    }

    _setSliderChanged(level) {
        const inverseLevel = 100 - level;
        if (this._inverseLevel !== inverseLevel) {
            this._inverseLevel = inverseLevel;
            this._airpodsSocket?.setAdaptiveLevel(inverseLevel);
        }
    }

    _setListMode(lisMode, atInit = false) {
        if (!this._modelData.enableTurnOffListeningMode)
            return;

        this._airpodsSocket?.setListMode(lisMode);
        if (!atInit) {
            this._updateAncConfig();
            this.dataHandler?.setConfig(this._config);
            this.updateAncMode(this._ancMode);
        }
    }

    _setLongpressCycle(cyclicValue) {
        this._airpodsSocket?.setLongpressCycle(cyclicValue);
    }

    _setNotiVolume(volume) {
        this._airpodsSocket?.setNotiVolume(volume);
    }

    _setSwipeMode(state) {
        this._airpodsSocket?.setSwipeMode(state);
    }

    _setSwipeLength(index) {
        if (index === 0)
            this._airpodsSocket?.setSwipeLength(VolSwipeLength.DEFAULT);
        else if (index === 1)
            this._airpodsSocket?.setSwipeLength(VolSwipeLength.LONGER);
        else if (index === 2)
            this._airpodsSocket?.setSwipeLength(VolSwipeLength.LONGEST);
    }

    _setPressSpeed(index) {
        if (index === 0)
            this._airpodsSocket?.setPressSpeed(PressSpeedMode.DEFAULT);
        else if (index === 1)
            this._airpodsSocket?.setPressSpeed(PressSpeedMode.SLOWER);
        else if (index === 2)
            this._airpodsSocket?.setPressSpeed(PressSpeedMode.SLOWEST);
    }

    _setPressDur(index) {
        if (index === 0)
            this._airpodsSocket?.setPressDur(PressDurationMode.DEFAULT);
        else if (index === 1)
            this._airpodsSocket?.setPressDur(PressDurationMode.SHORTER);
        else if (index === 2)
            this._airpodsSocket?.setPressDur(PressDurationMode.SHORTEST);
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
        this._airpodsSocket?.destroy();
        this._airpodsSocket = null;
        this._configureWindow?.close();
        this._configureWindow = null;
        if (this._devInfoSignalId && this._devInfo)
            this._devInfo.disconnect(this._devInfoSignalId);
        this._devInfoSignalId = null;
        this._devInfo = null;
        this._bluezDeviceProxy = null;
        if (this._dataHandlerId)
            this.dataHandler?.disconnect(this._dataHandlerId);
        this._dataHandlerId = null;
        this.dataHandler = null;
        if (this._settingsHandlerId)
            this._settings?.disconnect(this._settingsHandlerId);
        this._settingsHandlerId = null;
        if (this._mediaHandlerId)
            this._mediaController?.disconnect(this._mediaHandlerId);
        this._mediaHandlerId = null;
        this._mediaController?.destroy();
        this._mediaController = null;
        this._settings = null;
        this._battInfoRecieved = false;
    }
});

