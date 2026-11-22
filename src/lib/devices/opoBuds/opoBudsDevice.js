'use strict';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier} from '../logger.js';
import {buds2to1BatteryLevel} from '../deviceUtils.js';
import {DeviceInfo} from '../../deviceInfo.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {OpoBudsSocket} from './opoBudsSocket.js';
import {findChangedGestureSlots, updateGestureSlotInHex} from './opoBudsConfig.js';

import {ConfigureWindow} from '../../../preferences/devices/opoBuds/configureWindow.js';

export const DeviceTypeOpoBuds = 'opoBuds';

const OpoBudsUUID = '0000079a-d102-11e1-9b23-00025b00a5a5';

export function isOpoBuds(bluezDeviceProxy, uuids) {
    const bluezProps = [];
    const supported = uuids.some(uuid => uuid.toLowerCase() === OpoBudsUUID) ? 'yes' : 'no';
    return {supported, bluezProps};
}

export const OpoBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_OpoBudsDevice',
}, class OpoBudsDevice extends GObject.Object {
    constructor(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super();
        const identifier = getDeviceIdentifier(devicePath);
        const tag = `OpoBudsDevice-${identifier}`;
        this._log = createLogger(tag);
        this._log.info('------------------- OpoBudsDevice init -------------------');
        this._settings = settings;
        this._devicePath = devicePath;
        this._alias = alias;
        this._extPath = extPath;
        this.updateDeviceMapCb = updateDeviceMapCb;
        this._ignoreGsettingsChange = false;
        this._fwVersion = '';
        this._config = createConfig();
        this._props = createProperties();
        this._modelData = null;
        this._pendingCustomEqOps = new Map();

        this._callbacks = {
            modelInitialized: this.modelInitialized.bind(this),
            updateFirmwareInfo: this.updateFirmwareInfo.bind(this),
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateNoiseControl: this.updateNoiseControl.bind(this),
            updateInEar: this.updateInEar.bind(this),
            updateLatency: this.updateLatency.bind(this),
            updateDualConnection: this.updateDualConnection.bind(this),
            updateWindNoise: this.updateWindNoise.bind(this),
            updateVolumeEnhancer: this.updateVolumeEnhancer.bind(this),
            updateSpatialAudio: this.updateSpatialAudio.bind(this),
            updateHighRes: this.updateHighRes.bind(this),
            updateDynamicBass: this.updateDynamicBass.bind(this),
            updateAutoAnswer: this.updateAutoAnswer.bind(this),
            updateFindPhone: this.updateFindPhone.bind(this),
            updateEqPreset: this.updateEqPreset.bind(this),
            updateGestures: this.updateGestures.bind(this),
            updateSingleGesture: this.updateSingleGesture.bind(this),
            updateMultiConnectDevices: this.updateMultiConnectDevices.bind(this),
            updateNoiseControlCycle: this.updateNoiseControlCycle.bind(this),
            updateFitTestResult: this.updateFitTestResult.bind(this),
            updateCustomEqs: this.updateCustomEqs.bind(this),
            onCustomEqOperationResult: this.onCustomEqOperationResult.bind(this),
            updateBassLevel: this.updateBassLevel.bind(this),
        };

        const profile = {type: DeviceTypeOpoBuds, uuid: OpoBudsUUID};

        this._opoBudsSocket = new OpoBudsSocket(
            devicePath,
            profileManager,
            profile,
            this._callbacks
        );

        this._battInfoReceived = false;
        this._pendingAncMode = null;
        this._pendingWindNoise = null;
        this._pendingVolumeEnhancer = null;
        this._isReady = false;
        this._customEqList = [];
        this._lastCustomEqOpTs = 0;
    }

    modelInitialized(modelData) {
        this._modelData = modelData;

        this._log.info(`Configuration: ${JSON.stringify(this._modelData, null, 2)}`);

        this._initializeDeviceInfo();

        this._updateIcons();
        this._updateAncConfig();

        if (this._pendingAncMode != null) {
            this.updateNoiseControl(this._pendingAncMode);
            this._pendingAncMode = null;
        }

        if (this._pendingWindNoise !== null) {
            this.updateWindNoise(this._pendingWindNoise);
            this._pendingWindNoise = null;
        }

        if (this._pendingVolumeEnhancer !== null) {
            this.updateVolumeEnhancer(this._pendingVolumeEnhancer);
            this._pendingVolumeEnhancer = null;
        }

        this._isReady = true;
        this._log.info('OpoBudsDevice is ready.');
    }


    _initializeDeviceInfo() {
        const features = [
            {key: 'modelid', default: this._modelData.modelId, persist: true},
            {key: 'alias', default: this._alias, persist: true},
            {key: 'icon', default: this._modelData.budsIcon, persist: true},
            {key: 'fw-version', default: this._fwVersion, persist: true},
        ];

        if (this._modelData.batteryCase)
            features.push({key: 'case', default: this._modelData.case, persist: true});

        if (this._modelData.eqPreset) {
            const def = Object.values(this._modelData.eqPreset)[0];
            features.push({key: 'eq-preset', default: def, persist: true});
        }

        if (this._modelData.customEqSupport) {
            features.push({key: 'custom-eq-list', default: [], persist: true});
            features.push({key: 'custom-eq-op', default: null, relay: true});
        }

        if (this._modelData.inEarDetection)
            features.push({key: 'inear-enable', default: false, persist: true});

        if (this._modelData.lowLatencyMode)
            features.push({key: 'lowlatency', default: false, persist: true});

        if (this._modelData.dualConnection) {
            features.push({key: 'dual-connection', default: false, persist: true});
            features.push({key: 'audio-priority-mac', default: '', persist: true});
            features.push({key: 'multi-device-op', default: null, relay: true});
        }

        if (this._modelData.windNoiseReduction)
            features.push({key: 'wind-noise', default: false, persist: true});

        if (this._modelData.volumeEnhancer)
            features.push({key: 'volume-enhancer', default: false, persist: true});

        if (this._modelData.fitTest)
            features.push({key: 'fit-test-op', default: null, relay: true});

        if (this._modelData.spatialAudio)
            features.push({key: 'spatial', default: false, persist: true});

        if (this._modelData.highResAudio)
            features.push({key: 'high-res', default: false, persist: true});

        if (this._modelData.dynamicBass) {
            features.push({key: 'dynamic-bass', default: false, persist: true});

            if (this._modelData.dynamicBassOpo) {
                features.push({key: 'bass-level', default: 0, persist: true});
            } else {
                features.push({key: 'dynamic-audio-low', default: 0, persist: true});
                features.push({key: 'dynamic-audio-med', default: 0, persist: true});
                features.push({key: 'dynamic-audio-high', default: 0, persist: true});
            }
        }

        if (this._modelData.gestureOptions)
            features.push({key: 'gestures', default: '', persist: true});

        if (this._modelData.ring)
            features.push({key: 'ring-state', default: 'stopped', persist: true});

        if (this._modelData.autoAnswer)
            features.push({key: 'auto-answer', default: false, persist: true});

        if (this._modelData.findMyPhone)
            features.push({key: 'find-phone', default: false, persist: true});

        if (this._modelData.noiseControl)
            features.push({key: 'nc-cycle-mask', default: 0x0B, persist: true});

        this._devInfo = new DeviceInfo({
            settings: this._settings,
            settingsKey: 'opo-buds-list',
            devicePath: this._devicePath,
            features,
        });

        const featureCallbacks = {
            'icon': () => this._updateIcons(),
            'case': () => this._updateIcons(),
            'eq-preset': () => this._setEqPreset(),
            'custom-eq-op': () => this._setCustomEq(),
            'multi-device-op': () => this._setMultiDevice(),
            'fit-test-op': () => this._setFitTest(),
            'dynamic-bass': () => this._setDynamicBass(),
            'bass-level': () => this._setBassLevel(),
            'dynamic-audio-low': () => this._setDynamicAudioEq(),
            'dynamic-audio-med': () => this._setDynamicAudioEq(),
            'dynamic-audio-high': () => this._setDynamicAudioEq(),
            'gestures': () => this._setGestures(),
            'nc-cycle-mask': () => this._setNoiseControlCycle(),
            'inear-enable': () => this._setInEarEnable(),
            'lowlatency': () => this._setLowLatency(),
            'dual-connection': () => this._setDualConnection(),
            'wind-noise': () => this._setWindNoise(),
            'volume-enhancer': () => this._setVolumeEnhancer(),
            'spatial': () => this._setSpatialAudio(),
            'high-res': () => this._setHighResAudio(),
            'auto-answer': () => this._setAutoAnswer(),
            'find-phone': () => this._setFindPhone(),
            'ring-state': () => this._setRingState(),
        };

        this._devInfoSignalId = this._devInfo.connect('update-device', (info, feature) => {
            featureCallbacks[feature]?.();
        });
    }

    _updateIcons() {
        const commonIcon = this._devInfo.getValue('icon');
        this._config.commonIcon = commonIcon;
        this._config.albumArtIcon = commonIcon;
        this._config.showSettingsButton = true;
        this._config.battery1ShowOnDisconnect = true;

        if (this._modelData.batteryLR) {
            this._config.battery1Icon = `${commonIcon}-left`;
            this._config.battery2Icon = `${commonIcon}-right`;
            this._config.battery2ShowOnDisconnect = true;
            this._config.battery3Icon = this._devInfo.getValue('case');
        } else {
            this._config.battery1Icon = commonIcon;
        }

        this.dataHandler?.setConfig(this._config);
    }

    _updateAncConfig() {
        const nc = this._modelData?.noiseControl;
        if (!nc?.modes)
            return;

        const modes = nc.modes;

        let buttonIndex = 1;
        this._ancToggleMap = {};
        this._config.toggle1Title = _('Noise Control');

        const addToggle = (type, mode, icon, name, matchModes = [mode]) => {
            this._config[`toggle1Button${buttonIndex}Icon`] = icon;
            this._config[`toggle1Button${buttonIndex}Name`] = name;
            this._ancToggleMap[buttonIndex] = {type, mode, matchModes};
            buttonIndex++;
        };

        const addMode = (type, icon, name) => {
            const config = modes[type];
            if (!config)
                return;

            if (!config.levels) {
                addToggle(type, type, icon, name);
                return;
            }

            const levels = Object.keys(config.levels);
            const modeIds = levels.map(level => `${type}.${level}`);
            const isTransparency = type === 'transparency';
            const radioNames = [];

            const levelNames = isTransparency
                ? {
                    regular: _('Regular'),
                    voice: _('Voice'),
                }
                : {
                    auto: _('Auto'),
                    low: _('Low'),
                    mid: _('Mid'),
                    high: _('High'),
                };

            const radioMap = isTransparency
                ? this._ancTransparencyMap = {}
                : this._ancRadioMap = {};

            const radioReverse = isTransparency
                ? this._ancTransparencyReverse = {}
                : this._ancRadioReverse = {};

            levels.forEach((key, idx) => {
                const num = idx + 1;
                const displayName = levelNames[key] ??
                key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');

                radioNames.push(displayName);
                radioMap[num] = modeIds[idx];
                radioReverse[modeIds[idx]] = num;
            });

            if (isTransparency) {
                this._config.optionsBox2.push('radio-button');
                this._config.box2RadioButton = radioNames;
                this._config.box2RadioTitle = _('Transparency Level');
            } else {
                this._config.optionsBox1.push('radio-button');
                this._config.box1RadioButton = radioNames;
                this._config.box1RadioTitle = _('Noise Cancellation Level');
            }

            addToggle(type, modeIds[0], icon, name, modeIds);
        };

        this._ancRadioMap = {};
        this._ancRadioReverse = {};
        this._ancTransparencyMap = {};
        this._ancTransparencyReverse = {};

        if (modes.off)
            addToggle('off', 'off', 'bbm-anc-off-symbolic', _('Off'));

        addMode(
            'transparency',
            'bbm-transperancy-symbolic',
            _('Transparency')
        );

        addMode(
            'noiseCancellation',
            'bbm-anc-on-symbolic',
            _('Noise Cancellation')
        );

        if (modes.adaptive)
            addToggle('adaptive', 'adaptive', 'bbm-adaptive-symbolic', _('Adaptive'));

        if (this._modelData.windNoiseReduction) {
            this._config.optionsBox1.push('check-button');
            this._config.box1CheckButton = [_('Wind Noise Reduction')];
        }

        this._box2Map = [];
        const box2Labels = [];
        if (this._modelData.volumeEnhancer) {
            box2Labels.push(_('Focus on Voice'));
            this._box2Map.push('volumeEnhancer');
        }
        if (this._modelData.windNoiseReduction) {
            box2Labels.push(_('Wind Noise Reduction'));
            this._box2Map.push('windNoise');
        }

        if (box2Labels.length > 0) {
            this._config.optionsBox2.push('check-button');
            this._config.box2CheckButton = box2Labels;
        }

        if (this._config.box1RadioButton?.length && !this._props.box1RadioButtonState)
            this._props.box1RadioButtonState = 1;

        if (this._box2Map?.length) {
            this._box2Map.forEach((feat, idx) => {
                let val;
                if (feat === 'volumeEnhancer')
                    val = this._volumeEnhancer ? 1 : 0;
                else
                    val = this._windNoise ? 1 : 0;


                if (idx === 0)
                    this._props.box2CheckButton1State = val;
                else if (idx === 1)
                    this._props.box2CheckButton2State = val;
            });
        }

        if (this._modelData.windNoiseReduction)
            this._props.box1CheckButton1State = this._windNoise ? 1 : 0;

        this.dataHandler?.setConfig(this._config);
    }

    _startConfiguration(battProps) {
        if (!this._modelData)
            return;

        const bat1level = battProps.battery1Level ?? 0;
        const bat2level = battProps.battery2Level ?? 0;
        const bat3level = battProps.battery3Level ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoReceived = true;

        if (this._modelData.noiseControl)
            this._props.toggle1Visible = true;

        if (this.dataHandler) {
            this.dataHandler.setProps(this._props);
            return;
        }

        this.dataHandler = new DataHandler(this._config, this._props);
        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect('ui-action', (o, command, value) => {
            try {
                this._log.info(`ui-action received: command=${command}, value=${value}`);
                if (command === 'toggle1State')
                    this._toggle1ButtonClicked(value);
                else if (command === 'box1RadioButtonState')
                    this._box1RadioButtonStateChanged(value);
                else if (command === 'box2RadioButtonState')
                    this._box2RadioButtonStateChanged(value);
                else if (command === 'box1CheckButton1State')
                    this._box1CheckButton1Changed(value);
                else if (command === 'box2CheckButton1State')
                    this._box2CheckButton1Changed(value);
                else if (command === 'box2CheckButton2State')
                    this._box2CheckButton2Changed(value);
                else if (command === 'settingsButtonClicked')
                    this._settingsButtonClicked();
            } catch (e) {
                this._log.error(`Error in ui-action (${command}): ${e.message}\n${e.stack}`);
            }
        });

        this._isReady = true;
    }

    _toggle1ButtonClicked(index) {
        if (!this._ancToggleMap || !this._modelData)
            return;

        const toggle = this._ancToggleMap[index];
        if (!toggle)
            return;

        const isSameState = this._props.toggle1State === index;
        this._props.toggle1State = index;

        let ancMode = null;

        if (toggle.type === 'noiseCancellation') {
            this._props.optionsBoxVisible = this._config.optionsBox1?.length ? 1 : 0;

            if (toggle.matchModes.length > 1) {
                const radioIndex = this._props.box1RadioButtonState;
                this._props.box1RadioButtonState = radioIndex;
                ancMode = this._ancRadioMap?.[radioIndex] ?? toggle.mode;
            } else {
                ancMode = toggle.mode;
            }
        } else if (toggle.type === 'transparency') {
            this._props.optionsBoxVisible = this._config.optionsBox2?.length ? 2 : 0;

            if (toggle.matchModes.length > 1) {
                const radioIndex = this._props.box2RadioButtonState;
                this._props.box2RadioButtonState = radioIndex;
                ancMode = this._ancTransparencyMap?.[radioIndex] ?? toggle.mode;
            } else {
                ancMode = toggle.mode;
            }
        } else {
            this._props.optionsBoxVisible = 0;
            ancMode = toggle.mode;
        }

        this.dataHandler?.setProps(this._props);

        if (this._isReady && !isSameState && ancMode !== null)
            this._opoBudsSocket?.setNoiseControl(ancMode);
    }

    _box1RadioButtonStateChanged(index) {
        if (!this._ancRadioMap)
            return;

        this._props.box1RadioButtonState = index;
        this.dataHandler?.setProps(this._props);

        const mode = this._ancRadioMap[index];
        if (mode)
            this._opoBudsSocket?.setNoiseControl(mode);
    }

    _box2RadioButtonStateChanged(index) {
        if (!this._ancTransparencyMap)
            return;

        this._props.box2RadioButtonState = index;
        this.dataHandler?.setProps(this._props);

        const mode = this._ancTransparencyMap[index];
        if (mode)
            this._opoBudsSocket?.setNoiseControl(mode);
    }

    _box1CheckButton1Changed(value) {
        const enabled = value > 0;
        this._windNoise = enabled;
        this._updateSettingKey('wind-noise', enabled);
        this._props.box1CheckButton1State = value;
        if (this._box2Map) {
            const idx = this._box2Map.indexOf('windNoise');
            if (idx === 0)
                this._props.box2CheckButton1State = value;
            else if (idx === 1)
                this._props.box2CheckButton2State = value;
        }
        this.dataHandler?.setProps(this._props);
        this._opoBudsSocket?.setWindNoise(enabled);
    }

    _handleBox2Checkbox(index, value) {
        const feature = this._box2Map?.[index];
        if (!feature)
            return;

        const enabled = value > 0;
        if (feature === 'volumeEnhancer') {
            this._volumeEnhancer = enabled;
            this._updateSettingKey('volume-enhancer', enabled);
            if (index === 0)
                this._props.box2CheckButton1State = value;
            else if (index === 1)
                this._props.box2CheckButton2State = value;
            this.dataHandler?.setProps(this._props);
            this._opoBudsSocket?.setVolumeEnhancer(enabled);
        } else if (feature === 'windNoise') {
            this._windNoise = enabled;
            this._updateSettingKey('wind-noise', enabled);
            this._props.box1CheckButton1State = value;
            if (index === 0)
                this._props.box2CheckButton1State = value;
            else if (index === 1)
                this._props.box2CheckButton2State = value;
            this.dataHandler?.setProps(this._props);
            this._opoBudsSocket?.setWindNoise(enabled);
        }
    }

    _box2CheckButton1Changed(value) {
        this._handleBox2Checkbox(0, value);
    }

    _box2CheckButton2Changed(value) {
        this._handleBox2Checkbox(1, value);
    }

    updateFirmwareInfo(version) {
        this._devInfo?.updateUI('fw-version', version);
    }

    updateMultiConnectDevices(devices) {
        this._devInfo?.updateUI('multi-devices', devices);
    }

    updateBatteryProps({left, right, case: cse}) {
        if (left) {
            this._props.battery1Level = left.level;
            this._props.battery1Status = left.isCharging ? 'charging' : 'discharging';
        }
        if (right) {
            this._props.battery2Level = right.level;
            this._props.battery2Status = right.isCharging ? 'charging' : 'discharging';
        }
        if (cse) {
            this._props.battery3Level = cse.level;
            this._props.battery3Status = cse.isCharging ? 'charging' : 'discharging';
        }

        if (!this._modelData?.batteryLR) {
            const primary = left ?? right ?? cse;
            if (primary) {
                this._props.battery1Level = primary.level;
                this._props.battery1Status = primary.isCharging ? 'charging' : 'discharging';
            }
            this._props.computedBatteryLevel = this._props.battery1Level ?? 0;
        } else {
            this._props.computedBatteryLevel = buds2to1BatteryLevel(this._props);
        }

        if (!this._battInfoReceived)
            this._startConfiguration(this._props);
        else
            this.dataHandler?.setProps(this._props);
    }

    updateNoiseControl(mode) {
        if (!this._ancToggleMap) {
            this._pendingAncMode = mode;
            return;
        }

        const modes = this._modelData?.noiseControl?.modes;
        if (!modes)
            return;

        let toggleIndex = 0;
        let activeType = 'off';

        for (const [index, toggle] of Object.entries(this._ancToggleMap)) {
            if (toggle.matchModes.includes(mode)) {
                toggleIndex = Number(index);
                activeType = toggle.type;
                break;
            }
        }

        this._props.toggle1State = toggleIndex;

        if (activeType === 'noiseCancellation') {
            if (modes.noiseCancellation?.levels) {
                const radioIndex = this._ancRadioReverse?.[mode];
                if (radioIndex !== undefined)
                    this._props.box1RadioButtonState = radioIndex;
                else if (!this._props.box1RadioButtonState)
                    this._props.box1RadioButtonState = 1;
            }

            this._props.optionsBoxVisible = this._config.optionsBox1?.length ? 1 : 0;
        } else if (activeType === 'transparency') {
            if (modes.transparency?.levels) {
                const radioIndex = this._ancTransparencyReverse?.[mode];
                if (radioIndex !== undefined)
                    this._props.box2RadioButtonState = radioIndex;
                else if (!this._props.box2RadioButtonState)
                    this._props.box2RadioButtonState = 1;
            }

            this._props.optionsBoxVisible = this._config.optionsBox2?.length ? 2 : 0;
        } else {
            this._props.optionsBoxVisible = 0;
        }

        this.dataHandler?.setProps(this._props);
    }

    updateNoiseControlCycle(maskByte) {
        this._devInfo?.updateUI('nc-cycle-mask', maskByte);
    }

    _setNoiseControlCycle() {
        const mask = this._devInfo.getValue('nc-cycle-mask');
        this._opoBudsSocket?.setNoiseControlCycle(mask);
    }

    updateInEar(inEar) {
        this._devInfo?.updateUI('inear-enable', inEar);
    }

    _setInEarEnable() {
        const enable = this._devInfo.getValue('inear-enable');
        this._opoBudsSocket?.setInEar(enable);
    }

    updateLatency(latency) {
        this._devInfo?.updateUI('lowlatency', latency);
    }

    _setLowLatency() {
        const enable = this._devInfo.getValue('lowlatency');
        this._opoBudsSocket?.setLatency(enable);
    }

    updateDualConnection(dual) {
        this._devInfo?.updateUI('dual-connection', dual);
    }

    _setDualConnection() {
        const enable = this._devInfo.getValue('dual-connection');
        this._opoBudsSocket?.setDualConnection(enable);
    }

    _setMultiDevice() {
        const value = this._devInfo.getValue('multi-device-op');
        if (value.op === 'refresh' || value.op === 0xFF)
            this._opoBudsSocket?.getMultiConnectInfo();
        else
            this._opoBudsSocket?.operateMultiConnect(value.op, value.mac);
    }

    updateWindNoise(windNoise) {
        if (!this._modelData) {
            this._pendingWindNoise = windNoise;
            return;
        }
        this._windNoise = windNoise;
        this._devInfo?.updateUI('wind-noise', windNoise);
        this._props.box1CheckButton1State = windNoise ? 1 : 0;
        if (this._box2Map) {
            const idx = this._box2Map.indexOf('windNoise');
            if (idx === 0)
                this._props.box2CheckButton1State = windNoise ? 1 : 0;
            else if (idx === 1)
                this._props.box2CheckButton2State = windNoise ? 1 : 0;
        }
        this.dataHandler?.setProps(this._props);
    }

    _setWindNoise() {
        const enable = this._devInfo.getValue('wind-noise');
        this._opoBudsSocket?.setWindNoise(enable);
    }

    updateVolumeEnhancer(volumeEnhancer) {
        if (!this._modelData) {
            this._pendingVolumeEnhancer = volumeEnhancer;
            return;
        }
        this._volumeEnhancer = volumeEnhancer;
        this._devInfo?.updateUI('volume-enhancer', volumeEnhancer);
        if (this._box2Map) {
            const idx = this._box2Map.indexOf('volumeEnhancer');
            if (idx === 0)
                this._props.box2CheckButton1State = volumeEnhancer ? 1 : 0;
            else if (idx === 1)
                this._props.box2CheckButton2State = volumeEnhancer ? 1 : 0;
        }
        this.dataHandler?.setProps(this._props);
    }

    _setVolumeEnhancer() {
        const enable = this._devInfo.getValue('volume-enhancer');
        this._opoBudsSocket?.setVolumeEnhancer(enable);
    }

    updateSpatialAudio(spatial) {
        this._devInfo?.updateUI('spatial', spatial);
    }

    _setSpatialAudio() {
        const enable = this._devInfo.getValue('spatial');
        this._opoBudsSocket?.setSpatialAudio(enable);
    }

    updateHighRes(highRes) {
        this._devInfo?.updateUI('high-res', highRes);
    }

    _setHighResAudio() {
        const enable = this._devInfo.getValue('high-res');
        this._opoBudsSocket?.setHighRes(enable);
    }

    updateDynamicBass(dynamicBass) {
        this._devInfo?.updateUI('dynamic-bass', dynamicBass);
    }

    _setDynamicBass() {
        const enable = this._devInfo.getValue('dynamic-bass');
        this._opoBudsSocket?.setDynamicBass(enable);

        if (this._modelData.dynamicBassOpo)
            this._setBassLevel();
        else
            this._setDynamicAudioEq();
    }

    _setDynamicAudioEq() {
        if (!this._devInfo.getValue('dynamic-bass'))
            return;

        const low = this._devInfo.getValue('dynamic-audio-low');
        const med = this._devInfo.getValue('dynamic-audio-med');
        const high = this._devInfo.getValue('dynamic-audio-high');

        this._opoBudsSocket?.setDynamicAudioEq(low, med, high);
    }

    updateBassLevel(level) {
        this._devInfo?.updateUI('bass-level', level);
    }

    _setBassLevel() {
        if (!this._devInfo.getValue('dynamic-bass'))
            return;

        const level = this._devInfo.getValue('bass-level');
        this._opoBudsSocket?.setBassLevel(level);
    }

    updateAutoAnswer(autoAnswer) {
        this._devInfo?.updateUI('auto-answer', autoAnswer);
    }

    _setAutoAnswer() {
        const enable = this._devInfo.getValue('auto-answer');
        this._opoBudsSocket?.setAutoAnswer(enable);
    }


    updateFindPhone(findPhone) {
        this._devInfo?.updateUI('find-phone', findPhone);
    }

    _setFindPhone() {
        const enable = this._devInfo.getValue('find-phone');
        this._opoBudsSocket?.setFindPhone(enable);
    }

    updateEqPreset(preset) {
        this._devInfo?.updateUI('eq-preset', preset);
    }

    _setEqPreset() {
        const preset = this._devInfo.getValue('eq-preset');
        const custom = this._devInfo.getValue('custom-eq-list').find(e => e.eqId === preset);

        if (custom) {
            this._opoBudsSocket?.modifyCustomEq(custom.eqId, {
                name: custom.name,
                min: custom.min,
                max: custom.max,
                freqs: custom.freqs,
                dbs: custom.dbs,
            });
        } else {
            this._opoBudsSocket?.setEqPreset(preset);
        }
    }

    updateCustomEqs(entries) {
        if (!this._modelData?.customEqSupport)
            return;

        const customEqList = Array.isArray(entries) ? entries : [];

        this._devInfo?.updateUI('custom-eq-list', customEqList);

        if (customEqList.length > 0)
            this._log.info(`Custom EQ list updated (${customEqList.length} entries)`);

        const selected = customEqList.find(e => e.selected);

        if (selected)
            this._devInfo?.updateUI('eq-preset', selected.eqId);
    }

    _queueCustomEqOperation(action, eqId, data) {
        this._pendingCustomEqOps.set(eqId, {action, data});
    }

    onCustomEqOperationResult(eqId) {
        const operation = this._pendingCustomEqOps.get(eqId);
        if (!operation)
            return;

        this._pendingCustomEqOps.delete(eqId);

        const {action, data} = operation;
        const entries = [...this._devInfo.getValue('custom-eq-list') ?? []];
        const index = entries.findIndex(entry => entry.eqId === eqId);

        switch (action) {
            case 'add':
            case 'modify':
            case 'select': {
                let selected = this._devInfo.getValue('eq-preset') === eqId;

                if (index >= 0)
                    selected = entries[index].selected;

                if (action === 'select')
                    selected = true;

                const entry = {...data, eqId, selected};

                if (index >= 0)
                    entries[index] = entry;
                else
                    entries.push(entry);

                if (action === 'select') {
                    for (const item of entries)
                        item.selected = item.eqId === eqId;

                    this._devInfo.updateUI('eq-preset', eqId);
                }

                break;
            }

            case 'delete':
                if (index >= 0)
                    entries.splice(index, 1);
                break;
        }

        this._devInfo.updateUI('custom-eq-list', entries);
    }

    _setCustomEq() {
        const value = this._devInfo.getValue('custom-eq-op');

        const eqId = value.eqId;
        const eqData = {
            name: value.name ?? '',
            min: value.min ?? -6,
            max: value.max ?? 6,
            freqs: value.freqs ?? [],
            dbs: value.dbs ?? [],
        };

        switch (value.action) {
            case 'add':
                this._queueCustomEqOperation('add', eqId, eqData);
                this._opoBudsSocket?.addCustomEq(eqId, eqData);
                break;

            case 'modify':
                this._queueCustomEqOperation('modify', eqId, eqData);
                this._opoBudsSocket?.modifyCustomEq(eqId, eqData);
                break;

            case 'delete':
                this._queueCustomEqOperation('delete', eqId, eqData);
                this._opoBudsSocket?.deleteCustomEq(eqId, eqData);
                break;

            case 'select':
                if (eqData.dbs.length > 0) {
                    this._queueCustomEqOperation('select', eqId, eqData);
                    this._opoBudsSocket?.modifyCustomEq(eqId, eqData);
                }
                break;

            case 'list':
                this._queueCustomEqOperation('list', eqId, eqData);
                this._opoBudsSocket?.getCustomEqInfo();
                break;

            default:
                this._log.info(`Unknown custom EQ op action: ${value.action}`);
                break;
        }
    }

    updateGestures(gesturesHex) {
        this._devInfo?.updateUI('gestures', gesturesHex);
    }

    updateSingleGesture(dev, btn, act, func) {
        const gestures = this._devInfo?.getValue('gestures');

        if (!gestures)
            return;

        const newHex = updateGestureSlotInHex(gestures, dev, btn, act, func);

        if (newHex !== gestures)
            this._devInfo?.updateUI('gestures', newHex);
    }

    _setGestures() {
        const gestures = this._devInfo.getValue('gestures');

        const changedSlots = findChangedGestureSlots(
            this._gestures,
            gestures,
            this._modelData.gestureOptions
        );

        this._gestures = gestures;

        if (changedSlots.length > 0)
            this._opoBudsSocket?.setGestureSlots(changedSlots);
    }

    updateFitTestResult(result) {
        this._log.info(`Update Fit Test Result: left=${result?.left}, right=${result?.right}`);
        this._devInfo?.updateUI('fit-test-result', result);
    }

    _setFitTest() {
        const value = this._devInfo.getValue('fit-test-op');

        if (value === 'start')
            this._opoBudsSocket?.startFitTest();
        else if (value === 'stop')
            this._opoBudsSocket?.stopFitTest();
    }

    _setRingState() {
        const state = this._devInfo.getValue('ring-state');
        this._opoBudsSocket?.setFindBuds(state);
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

        if (this._devInfoSignalId)
            this._devInfo?.disconnect(this._devInfoSignalId);
        this._devInfoSignalId = null;
        this._devInfo = null;

        if (this._dataHandlerId)
            this.dataHandler?.disconnect(this._dataHandlerId);
        this._dataHandlerId = null;
        this.dataHandler = null;

        this._opoBudsSocket?.destroy();
        this._opoBudsSocket = null;

        this._settings = null;
        this._battInfoRecieved = false;
    }
});
