'use strict';
import GObject from 'gi://GObject';
import {gettext as _, pgettext} from 'gettext';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {DeviceInfo} from '../../deviceInfo.js';
import {buds2to1BatteryLevel} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {MediaController} from '../mediaController.js';
import {RedmiBudsSocket} from './redmiBudsSocket.js';

import {ConfigureWindow} from '../../../preferences/devices/redmiBuds/configureWindow.js';

export const DeviceTypeRedmiBuds = 'redmiBuds';

// Keep existing translations when a locale has no Redmi-specific entry yet.
const localizedLabel = (translation, original) =>
    translation === original ? _(original) : translation;

const RedmiBudsUUID = '0000fd2d-0000-1000-8000-00805f9b34fb';
export function isRedmiBuds(bluezDeviceProxy, uuids) {
    const bluezProps = [];
    const supported = uuids.includes(RedmiBudsUUID) ? 'yes' : 'no';
    return {supported, bluezProps};
}

export const RedmiBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_RedmiBudsDevice',
}, class RedmiBudsDevice extends GObject.Object {
    _init(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super._init();
        const identifier = getDeviceIdentifier(devicePath);
        const tag = `RedmiBudsDevice-${identifier}`;
        this._log = createLogger(tag);
        this._log.info('------------------- RedmiBudsDevice init -------------------');
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
        this._serialNo = '';

        this._callbacks = {
            modelIntialized: this.modelIntialized.bind(this),
            updateFirmware: this.updateFirmware.bind(this),
            updateSerial: this.updateSerial.bind(this),
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateInEarState: this.updateInEarState.bind(this),
            updateNoiseControl: this.updateNoiseControl.bind(this),
            updateAdaptiveNC: this.updateAdaptiveNC.bind(this),
            updateAncStrength: this.updateAncStrength.bind(this),
            updateAmbientStrength: this.updateAmbientStrength.bind(this),

            updateGestureSingle: this.updateGestureSingle.bind(this),
            updateGestureDouble: this.updateGestureDouble.bind(this),
            updateGestureTriple: this.updateGestureTriple.bind(this),
            updateGestureLong: this.updateGestureLong.bind(this),
            updateGestureSwipe: this.updateGestureSwipe.bind(this),

            updateAutoAnswer: this.updateAutoAnswer.bind(this),
            updateDualConnection: this.updateDualConnection.bind(this),
            updateEqPreset: this.updateEqPreset.bind(this),
            updateLongGestures: this.updateLongGestures.bind(this),
            updateAdaptiveSound: this.updateAdaptiveSound.bind(this),
            updateLowLatency: this.updateLowLatency.bind(this),
            updateImmersiveSound: this.updateImmersiveSound.bind(this),
            updateHeadTracking: this.updateHeadTracking.bind(this),
            updateSpatialAudioScene: this.updateSpatialAudioScene.bind(this),
            updateCustomEq: this.updateCustomEq.bind(this),
        };

        const profile = {type: DeviceTypeRedmiBuds, uuid: RedmiBudsUUID};

        this._redmiBudsSocket = new RedmiBudsSocket(
            this._devicePath,
            profileManager,
            profile,
            this._callbacks
        );
    }

    modelIntialized(modelData) {
        this._modelData = modelData;
        this._log.info(`Configuration: ${JSON.stringify(this._modelData, null, 2)}`);

        this._config.battery1ShowOnDisconnect = true;
        this._config.showSettingsButton = true;

        this._initializeDeviceInfo();
        this._updateIcons();
        this._setupAncConfig();

        if (this._modelData.ring) {
            this._devInfo.updateUI('ring-state', 'stopped');
            this._devInfo.updateUI('ring-state-left', 'stopped');
        }
    }

    _initializeDeviceInfo() {
        const features = [
            {key: 'alias', default: '', persist: false},
            {key: 'icon', default: this._modelData.budsIcon, persist: true},
            {key: 'fw-version', default: '', persist: true},
            {key: 'serial', default: '', persist: true},
        ];

        if (this._modelData.batteryCase)
            features.push({key: 'case', default: this._modelData.case, persist: true});

        if (this._modelData.eqPreset) {
            const eqPresetDef = Object.values(this._modelData.eqPreset)[0];
            features.push({key: 'eq-preset', default: eqPresetDef, persist: true});
        }

        if (this._modelData.eqPreset?.custom !== undefined) {
            const custom = this._modelData.eqPreset.custom;
            features.push({key: 'eq-custom', default: custom, persist: true});
        }

        if (this._modelData.adaptiveSound)
            features.push({key: 'adapt-sound', default: false, persist: true});

        if (this._modelData.dualConnection)
            features.push({key: 'dual-conn', default: false, persist: true});

        if (this._modelData.inEarDetection)
            features.push({key: 'ear-detection-mode', default: 0, persist: true});

        if (this._modelData.autoAnswer)
            features.push({key: 'auto-answer', default: false, persist: true});

        if (this._modelData.lowLatencyMode)
            features.push({key: 'low-latency', default: false, persist: true});

        if (this._modelData.immersiveSound)
            features.push({key: 'immersive-sound', default: false, persist: true});

        if (this._modelData.headTracking)
            features.push({key: 'head-tracking', default: false, persist: true});

        if (this._modelData.spatialAudioScenes) {
            const defaultScene = Object.values(this._modelData.spatialAudioScenes)[0];
            features.push({key: 'spatial-audio-scene', default: defaultScene, persist: true});
        }

        const gestureTypes = this._modelData.gestureOptions?.gestureTypes;

        if (gestureTypes?.single !== undefined) {
            const single = gestureTypes.single;
            features.push({key: 'single-left', default: single.left, persist: true});
            features.push({key: 'single-right', default: single.right, persist: true});
        }

        if (gestureTypes?.double !== undefined) {
            const double = gestureTypes.double;
            features.push({key: 'double-left', default: double.left, persist: true});
            features.push({key: 'double-right', default: double.right, persist: true});
        }

        if (gestureTypes?.triple !== undefined) {
            const triple = gestureTypes.triple;
            features.push({key: 'triple-left', default: triple.left, persist: true});
            features.push({key: 'triple-right', default: triple.right, persist: true});
        }

        if (gestureTypes?.['action-hold'] !== undefined) {
            const actionHold = gestureTypes['action-hold'];
            features.push({key: 'action-hold-left', default: actionHold.left, persist: true});
            features.push({key: 'action-hold-right', default: actionHold.right, persist: true});
        }

        if (gestureTypes?.swipe !== undefined) {
            const swipe = gestureTypes.swipe;
            features.push({key: 'swipe-left', default: swipe.left, persist: true});
            features.push({key: 'swipe-right', default: swipe.right, persist: true});
        }

        if (this._modelData.gestureOptions?.noiseControlModes !== undefined) {
            const modes = this._modelData.gestureOptions.noiseControlModes;
            features.push({key: 'left-longpress', default: modes.left, persist: true});
            features.push({key: 'right-longpress', default: modes.right, persist: true});
        }

        if (this._modelData.ring !== undefined) {
            features.push({key: 'ring-state', default: 'stopped', persist: true});
            features.push({key: 'ring-state-left', default: 'stopped', persist: true});
        }

        this._devInfo = new DeviceInfo({
            settings: this._settings,
            settingsKey: 'redmi-buds-list',
            devicePath: this._devicePath,
            features,
        });

        if (this._alias)
            this._devInfo.updateUI('alias', this._alias);

        if (this._fwVersion)
            this._devInfo.updateUI('fw-version', this._fwVersion);

        if (this._serialNo)
            this._devInfo.updateUI('serial', this._serialNo);

        const featureCallbacks = {
            'icon': () => this._updateIcons(),
            'case': () => this._updateIcons(),
            'eq-preset': () => this._setEqPreset(),
            'eq-custom': () => this._setCustomEq(),
            'adapt-sound': () => this._setAdaptiveSound(),
            'dual-conn': () => this._setDualConn(),
            'ear-detection-mode': () => this._configureMediaController(),
            'auto-answer': () => this._setAutoAnswer(),
            'low-latency': () => this._setLowLatency(),
            'immersive-sound': () => this._setImmersiveSound(),
            'head-tracking': () => this._setImmersiveSound(),
            'spatial-audio-scene': () => this._setSpatialAudioScene(),
            'single-left': () => this._setSingleLeftGesture(),
            'single-right': () => this._setSingleRightGesture(),
            'double-left': () => this._setDoubleLeftGesture(),
            'double-right': () => this._setDoubleRightGesture(),
            'triple-left': () => this._setTripleLeftGesture(),
            'triple-right': () => this._setTripleRightGesture(),
            'action-hold-left': () => this._setActionHoldLeftGesture(),
            'action-hold-right': () => this._setActionHoldRightGesture(),
            'swipe-left': () => this._setSwipeLeftGesture(),
            'swipe-right': () => this._setSwipeRightGesture(),
            'left-longpress': () => this._setLeftLongPressMode(),
            'right-longpress': () => this._setRightLongPressMode(),
            'ring-state': () => this._setRingMyBuds(),
            'ring-state-left': () => this._setRingMyBudsLeft(),
        };

        this._devInfoSignalId = this._devInfo.connect('update-device', (info, feature) => {
            featureCallbacks[feature]?.();
        });
    }

    _updateIcons() {
        const commonIcon = this._devInfo.getValue('icon');
        this._config.commonIcon = commonIcon;
        this._config.albumArtIcon = commonIcon;

        this._config.battery1ShowOnDisconnect = true;
        if (this._modelData.batteryMutiple) {
            this._config.battery1Icon = `${commonIcon}-left`;
            this._config.battery2Icon = `${commonIcon}-right`;
            this._config.battery2ShowOnDisconnect = true;
            this._config.battery3Icon = this._devInfo.getValue('case');
        } else {
            this._config.battery1Icon = commonIcon;
        }

        this.dataHandler?.setConfig(this._config);
    }

    updateFirmware(fwVersion) {
        this._fwVersion = fwVersion;
        this._devInfo?.updateUI('fw-version', fwVersion);
    }

    updateSerial(serial) {
        this._serialNo = serial;
        this._devInfo?.updateUI('serial', serial);
    }

    _setupAncConfig() {
        const nc = this._modelData.noiseControl;
        if (!nc)
            return;

        this._strengthMap = {
            'off': 0x00,
            'noiseCancellation': 0x00,
            'transparency': 0x00,
        };

        let buttonIndex = 1;
        this._ancToggleMap = {};
        this._config.toggle1Title = _('Noise Control');

        const addToggle = (type, byte, icon, name) => {
            if (byte == null)
                return;

            this._config[`toggle1Button${buttonIndex}Icon`] = icon;
            this._config[`toggle1Button${buttonIndex}Name`] = name;

            this._ancToggleMap[buttonIndex] = {type, byte};

            buttonIndex++;
        };

        if (nc.off != null) {
            addToggle(
                'off',
                nc.off,
                'bbm-anc-off-symbolic',
                _('Off')
            );
        }

        if (nc.transparency != null) {
            addToggle(
                'transparency',
                nc.transparency,
                'bbm-transperancy-symbolic',
                _('Transparency')
            );
        }

        if (nc.noiseCancellation != null) {
            addToggle(
                'noiseCancellation',
                nc.noiseCancellation,
                'bbm-anc-on-symbolic',
                _('Noise Cancellation')
            );
        }

        this._setupAdaptiveSwitch();
        this._setupNCStrength();
        this._setupNcLevel();
        this._setupTransparencyStrength();
    }

    _setupAdaptiveSwitch() {
        if (!this._modelData.adaptiveNcSwitch)
            return;

        this._config.optionsBox1.push('check-button');
        this._config.box1CheckButton = [_('Adaptive')];

        if (this._modelData.noiseCancellationStrength || this._modelData.ancLevel) {
            this._config.optionsBox2.push('check-button');
            this._config.box2CheckButton = [_('Adaptive')];
        }
    }

    _setupNCStrength() {
        const data = this._modelData.noiseCancellationStrength;
        if (!data)
            return;

        const levelNames = {
            low: _('Low'),
            mid: _('Mid'),
            high: _('High'),
            adaptive: _('Adaptive'),
        };

        const keys = Object.keys(data);
        if (keys.length < 2)
            return;

        const labels = [];
        const map = {};
        const reverse = {};

        keys.forEach((k, i) => {
            const index = i + 1;
            const byte = data[k];

            labels.push(levelNames[k] ?? k);
            map[index] = byte;
            reverse[byte] = index;
        });

        this._config.box1RadioTitle = _('Noise Cancellation Strength');
        this._config.box1RadioButton = labels;

        this._noiseCancellationStrengthMap = map;
        this._noiseCancellationStrengthReverse = reverse;
        this._config.optionsBox1.push('radio-button');
    }

    _setupNcLevel() {
        if (!this._modelData.ancLevel)
            return;

        this._config.optionsBox1.push('slider');
        this._config.box1SliderTitle = _('Noise Level');
    }

    _setupTransparencyStrength() {
        const data = this._modelData.transparencyStrength;
        if (!data)
            return;

        const transNames = {
            regular: localizedLabel(pgettext('Redmi transparency mode', 'Regular'), 'Regular'),
            voice: localizedLabel(pgettext('Redmi transparency mode', 'Voice'), 'Voice'),
            ambient: localizedLabel(pgettext('Redmi transparency mode', 'Ambient'), 'Ambient'),
        };

        const keys = Object.keys(data);
        if (keys.length < 2)
            return;

        const labels = [];
        const map = {};
        const reverse = {};

        keys.forEach((k, i) => {
            const index = i + 1;
            const byte = data[k];

            labels.push(transNames[k] ?? k);
            map[index] = byte;
            reverse[byte] = index;
        });

        this._config.box3RadioTitle = _('Transparency Strength');
        this._config.box3RadioButton = labels;

        this._transparencyStrengthMap = map;
        this._transparencyStrengthReverse = reverse;

        this._config.optionsBox3.push('radio-button');
    }

    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level  ?? 0;
        const bat2level = battInfo.battery2Level  ?? 0;
        const bat3level = battInfo.battery3Level  ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

        this._configureMediaController();

        if (this._modelData.noiseControl)
            this._props.toggle1Visible = true;

        this.dataHandler = new DataHandler(this._config, this._props);

        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect(
            'ui-action', (o, command, value) => {
                if (command === 'toggle1State')
                    this._toggle1ButtonClicked(value);

                if (command === 'box1CheckButton1State')
                    this._box1CheckButton1StateChanged(value);

                if (command === 'box2CheckButton1State')
                    this._box2CheckButton1StateChanged(value);

                if (command === 'box1RadioButtonState')
                    this._box1RadioButtonStateChanged(value);

                if (command === 'box3RadioButtonState')
                    this._box3RadioButtonStateChanged(value);

                if (command === 'box1SliderValue')
                    this._box1SliderValueChanged(value);

                if (command === 'settingsButtonClicked')
                    this._settingsButtonClicked();
            }
        );
    }

    _configureMediaController() {
        if (!this._modelData.inEarDetection)
            return;

        const earDetectionMode = this._devInfo.getValue('ear-detection-mode');
        const enableMediaController = earDetectionMode !== 0;

        if (enableMediaController && !this._mediaController) {
            this._mediaController = new MediaController(this._settings, this._devicePath);
        } else if (!enableMediaController) {
            this._mediaController?.destroy();
            this._mediaController = null;
        }
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};

        if (!this._modelData)
            return;

        if (!this._modelData.batteryMutiple)
            this._props.computedBatteryLevel = props.battery1Level;
        else
            this._props.computedBatteryLevel = buds2to1BatteryLevel(props);

        if (!this._battInfoRecieved)
            this._startConfiguration(props);

        this.dataHandler?.setProps(this._props);
    }

    updateNoiseControl(mode) {
        this._log.info(`UpdateNoiseControl mode: ${hexBytes(mode)}`);
        if (!this._ancToggleMap)
            return;

        let toggleIndex = 0;
        let modeType = null;

        for (const [index, data] of Object.entries(this._ancToggleMap)) {
            if (data.byte === mode) {
                toggleIndex = Number(index);
                modeType = data.type;
                break;
            }
        }

        this._props.toggle1State = toggleIndex;
        const hasNCOptions = this._modelData.adaptiveANCSwitch || this._modelData.ancLevel ||
            this._modelData.noiseCancellationStrength;

        if (hasNCOptions && modeType === 'noiseCancellation') {
            const adaptiveEnabled = this._modelData.adaptiveNcSwitch &&
                this._props.box1CheckButton1State;

            this._props.optionsBoxVisible = adaptiveEnabled ? 2 : 1;
        } else if (this._modelData.transparencyStrength && modeType === 'transparency') {
            this._props.optionsBoxVisible = 3;
        } else {
            this._props.optionsBoxVisible = 0;
        }

        this.dataHandler?.setProps(this._props);
    }

    updateAdaptiveNC(enabled) {
        this._log.info(`updateAdaptiveNC enabled: ${enabled}`);
        if (!this._modelData?.adaptiveNcSwitch)
            return;

        const state = enabled ? 1 : 0;
        this._props.box1CheckButton1State = state;
        this._props.box2CheckButton1State = state;
        const modeIndex = this._props.toggle1State;
        const toggle = this._ancToggleMap?.[modeIndex];
        if (toggle?.type === 'noiseCancellation')
            this._props.optionsBoxVisible = enabled ? 2 : 1;

        this.dataHandler?.setProps(this._props);
    }

    updateAncStrength(strength) {
        this._log.info(`updateAncStrength strength: ${hexBytes(strength)}`);

        this._strengthMap['noiseCancellation'] = strength;

        if (this._modelData.noiseCancellationStrength) {
            const index = this._noiseCancellationStrengthReverse?.[strength];
            if (index == null)
                return;

            this._props.box1RadioButtonState = index;
            this.dataHandler?.setProps(this._props);
        } else if (this._modelData.ancLevel) {
            if (this._ancLevel !== strength) {
                this._ancLevel = strength;

                const level = this._modelData.ancLevel;
                this._props.box1SliderValue = Math.round(strength * 100 / level);

                this.dataHandler?.setProps(this._props);
            }
        }
    }

    updateAmbientStrength(strength) {
        this._log.info(`updateAmbientStrength strength: ${hexBytes(strength)}`);

        this._strengthMap['transparency'] = strength;
        const index = this._transparencyStrengthReverse?.[strength];

        if (index == null)
            return;

        this._props.box3RadioButtonState = index;
        this.dataHandler?.setProps(this._props);
    }

    _toggle1ButtonClicked(index) {
        const toggle = this._ancToggleMap?.[index];
        if (!toggle)
            return;

        this._props.toggle1State = index;

        const hasNCOptions = this._modelData.adaptiveANCSwitch || this._modelData.ancLevel ||
            this._modelData.noiseCancellationStrength;

        if (hasNCOptions && toggle.type === 'noiseCancellation') {
            const adaptiveEnabled = this._modelData.adaptiveNcSwitch &&
                this._props.box1CheckButton1State;

            this._props.optionsBoxVisible = adaptiveEnabled ? 2 : 1;
        } else if (this._modelData.transparencyStrength && toggle.type === 'transparency') {
            this._props.optionsBoxVisible = 3;
        } else {
            this._props.optionsBoxVisible = 0;
        }

        this.dataHandler?.setProps(this._props);
        this._redmiBudsSocket?.setNoiseControl(toggle.byte, this._strengthMap[toggle.type]);
    }

    _box1CheckButton1StateChanged(state) {
        this.updateAdaptiveNC(state);
        this._redmiBudsSocket?.setAdaptiveNC(state);
    }

    _box2CheckButton1StateChanged(state) {
        this.updateAdaptiveNC(state);
        this._redmiBudsSocket?.setAdaptiveNC(state);
    }

    _box1RadioButtonStateChanged(index) {
        const strength = this._noiseCancellationStrengthMap?.[index];
        if (strength == null)
            return;

        this._props.box1RadioButtonState = index;
        this.dataHandler?.setProps(this._props);

        const ncByte = this._modelData.noiseControl.noiseCancellation;
        this._strengthMap['noiseCancellation'] = strength;
        this._redmiBudsSocket?.setNoiseControl(ncByte, strength);
    }

    _box3RadioButtonStateChanged(index) {
        const strength = this._transparencyStrengthMap?.[index];
        if (strength == null)
            return;

        this._props.box3RadioButtonState = index;
        this.dataHandler?.setProps(this._props);

        const transparencyByte = this._modelData.noiseControl.transparency;
        this._strengthMap['transparency'] = strength;
        this._redmiBudsSocket?.setNoiseControl(transparencyByte, strength);
    }

    _box1SliderValueChanged(value) {
        this._props.box1SliderValue = value;
        this.dataHandler?.setProps(this._props);
        const ncByte = this._modelData.noiseControl.noiseCancellation;
        const level = this._modelData.ancLevel;
        const strength = Math.round(value * level / 100);
        this._strengthMap['noiseCancellation'] = strength;
        this._redmiBudsSocket?.setNoiseControl(ncByte, strength);
    }

    updateInEarState(left, right) {
        this._log.info(`Inear status left: ${left} Right: ${right}`);
        const earDetectionMode = this._devInfo.getValue('ear-detection-mode');
        if (!this._modelData?.inEarDetection || earDetectionMode === 0)
            return;

        const bothInEars = left  && right;
        const budInEar = left || right;

        let playbackMode = null;
        if (earDetectionMode === 1)
            playbackMode = bothInEars ? 'play' : 'pause';
        else if (this._earDetectionMode === 2)
            playbackMode = budInEar ? 'play' : 'pause';

        if (playbackMode)
            this._mediaController?.changeActivePlayerState(playbackMode);
    }

    updateEqPreset(mode) {
        this._log.info(`updateEqPreset : ${hexBytes(mode)}`);
        this._devInfo?.updateUI('eq-preset', mode);
    }

    _setEqPreset() {
        const mode = this._devInfo.getValue('eq-preset');
        this._redmiBudsSocket?.setEqPreset(mode);
    }

    updateCustomEq(eqArray) {
        this._log.info(`updateCustomEq : ${hexBytes(eqArray)}`);
        this._devInfo?.updateUI('eq-custom', eqArray);
    }

    _setCustomEq() {
        const eqArray = this._devInfo.getValue('eq-custom');
        this._redmiBudsSocket?.setCustomEq(eqArray);
    }

    updateAdaptiveSound(enable) {
        this._log.info(`updateAdaptiveSound : ${enable}`);
        this._devInfo?.updateUI('adapt-sound', enable);
    }

    _setAdaptiveSound() {
        const enable = this._devInfo.getValue('adapt-sound');
        this._redmiBudsSocket?.setAdaptiveSound(enable);
    }


    updateDualConnection(enable) {
        this._log.info(`updateDualConnection : ${enable}`);
        this._devInfo?.updateUI('dual-conn', enable);
    }

    _setDualConn() {
        const enable = this._devInfo.getValue('dual-conn');
        this._redmiBudsSocket?.setDualConn(enable);
    }

    updateAutoAnswer(enable) {
        this._log.info(`updateAutoAnswer : ${enable}`);
        this._devInfo?.updateUI('auto-answer', enable);
    }

    _setAutoAnswer() {
        const enable = this._devInfo.getValue('auto-answer');
        this._redmiBudsSocket?.setAutoAnswer(enable);
    }

    updateLowLatency(enable) {
        this._log.info(`updateLowLatency : ${enable}`);
        this._devInfo?.updateUI('low-latency', enable);
    }

    _setLowLatency() {
        const enable = this._devInfo.getValue('low-latency');
        this._redmiBudsSocket?.setLowLatency(enable);
    }

    updateImmersiveSound(enable) {
        this._log.info(`updateImmersiveSound : ${enable}`);
        this._devInfo?.updateUI('immersive-sound', enable);
    }

    updateHeadTracking(enable) {
        this._log.info(`updateHeadTracking : ${enable}`);
        this._devInfo?.updateUI('head-tracking', enable);
    }

    updateSpatialAudioScene(scene) {
        this._log.info(`updateSpatialAudioScene : ${scene}`);
        this._devInfo?.updateUI('spatial-audio-scene', scene);
    }

    _setImmersiveSound() {
        const enable = this._devInfo.getValue('immersive-sound');
        let headTracking = false;
        if (this._modelData.headTracking)
            headTracking = this._devInfo.getValue('head-tracking');

        this._redmiBudsSocket?.setImmersiveSound(enable, headTracking);
    }

    _setSpatialAudioScene() {
        const scene = this._devInfo.getValue('spatial-audio-scene');
        this._redmiBudsSocket?.setSpatialAudioScene(scene);
    }

    updateGestureSingle(left, right) {
        this._log.info(`updateGestureSingle L : ${hexBytes(left)} R: ${hexBytes(right)}`);

        const gestureTypes = this._modelData?.gestureOptions?.gestureTypes;
        if (gestureTypes?.single === undefined)
            return;

        this._devInfo?.updateUI('single-left', left);
        this._devInfo?.updateUI('single-right', right);
    }

    _setSingleLeftGesture() {
        const value = this._devInfo.getValue('single-left');
        this._redmiBudsSocket?.setGesture('single', 'left', value);
    }

    _setSingleRightGesture() {
        const value = this._devInfo.getValue('single-right');
        this._redmiBudsSocket?.setGesture('single', 'right', value);
    }

    updateGestureDouble(left, right) {
        this._log.info(`updateGestureDouble L : ${hexBytes(left)} R: ${hexBytes(right)}`);

        const gestureTypes = this._modelData?.gestureOptions?.gestureTypes;
        if (gestureTypes?.double === undefined)
            return;

        this._devInfo?.updateUI('double-left', left);
        this._devInfo?.updateUI('double-right', right);
    }

    _setDoubleLeftGesture() {
        const value = this._devInfo.getValue('double-left');
        this._redmiBudsSocket?.setGesture('double', 'left', value);
    }

    _setDoubleRightGesture() {
        const value = this._devInfo.getValue('double-right');
        this._redmiBudsSocket?.setGesture('double', 'right', value);
    }

    updateGestureTriple(left, right) {
        this._log.info(`updateGestureTriple L : ${hexBytes(left)} R: ${hexBytes(right)}`);

        const gestureTypes = this._modelData?.gestureOptions?.gestureTypes;
        if (gestureTypes?.triple === undefined)
            return;

        this._devInfo?.updateUI('triple-left', left);
        this._devInfo?.updateUI('triple-right', right);
    }

    _setTripleLeftGesture() {
        const value = this._devInfo.getValue('triple-left');
        this._redmiBudsSocket?.setGesture('triple', 'left', value);
    }

    _setTripleRightGesture() {
        const value = this._devInfo.getValue('triple-right');
        this._redmiBudsSocket?.setGesture('triple', 'right', value);
    }

    updateGestureLong(left, right) {
        this._log.info(`updateGestureLong L : ${hexBytes(left)} R: ${hexBytes(right)}`);

        const gestureTypes = this._modelData?.gestureOptions?.gestureTypes;
        if (gestureTypes?.['action-hold'] === undefined)
            return;

        this._devInfo?.updateUI('action-hold-left', left);
        this._devInfo?.updateUI('action-hold-right', right);
    }

    _setActionHoldLeftGesture() {
        const value = this._devInfo.getValue('action-hold-left');
        this._redmiBudsSocket?.setGesture('action-hold', 'left', value);
    }

    _setActionHoldRightGesture() {
        const value = this._devInfo.getValue('action-hold-right');
        this._redmiBudsSocket?.setGesture('action-hold', 'right', value);
    }

    updateGestureSwipe(left, right) {
        this._log.info(`updateGestureSwipe L : ${hexBytes(left)} R: ${hexBytes(right)}`);

        const gestureTypes = this._modelData?.gestureOptions?.gestureTypes;
        if (gestureTypes?.swipe === undefined)
            return;

        this._devInfo?.updateUI('swipe-left', left);
        this._devInfo?.updateUI('swipe-right', right);
    }

    _setSwipeLeftGesture() {
        const value = this._devInfo.getValue('swipe-left');
        this._redmiBudsSocket?.setGesture('swipe', 'left', value);
    }

    _setSwipeRightGesture() {
        const value = this._devInfo.getValue('swipe-right');
        this._redmiBudsSocket?.setGesture('swipe', 'right', value);
    }

    updateLongGestures(leftPressMode, rightPressMode) {
        this._log.info(`updateLongGestures L: ${hexBytes(leftPressMode)}
            R: ${hexBytes(rightPressMode)}`);

        if (this._modelData?.gestureOptions?.noiseControlModes === undefined)
            return;

        this._devInfo?.updateUI('left-longpress', leftPressMode);
        this._devInfo?.updateUI('right-longpress', rightPressMode);
    }

    _setLeftLongPressMode() {
        const mode = this._devInfo.getValue('left-longpress');
        this._redmiBudsSocket?.setLongPressMode(true, mode);
    }

    _setRightLongPressMode() {
        const mode = this._devInfo.getValue('right-longpress');
        this._redmiBudsSocket?.setLongPressMode(false, mode);
    }

    _setRingMyBuds() {
        const state = this._devInfo.getValue('ring-state');
        this._redmiBudsSocket?.setRingMyBuds(state, false);
    }

    _setRingMyBudsLeft()  {
        const state = this._devInfo.getValue('ring-state-left');
        this._redmiBudsSocket?.setRingMyBuds(state, true);
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

        this._redmiBudsSocket?.destroy();
        this._redmiBudsSocket = null;

        if (this._devInfoSignalId)
            this._devInfo?.disconnect(this._devInfoSignalId);
        this._devInfoSignalId = null;
        this._devInfo = null;

        if (this._dataHandlerId)
            this.dataHandler?.disconnect(this._dataHandlerId);
        this._dataHandlerId = null;
        this.dataHandler = null;

        this._settings = null;
        this._mediaController?.destroy();
        this._mediaController = null;
        this._battInfoRecieved = false;
    }
});

