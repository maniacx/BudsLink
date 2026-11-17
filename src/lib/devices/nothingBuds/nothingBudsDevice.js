'use strict';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier} from '../logger.js';
import {DeviceInfo} from '../../deviceInfo.js';
import {buds2to1BatteryLevel, getAdapterMac} from '../deviceUtils.js';
import {BtDeviceState, DeviceManagementAction} from '../commonEmuns.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {NothingBudsSocket} from './nothingBudsSocket.js';

import {ConfigureWindow} from '../../../preferences/devices/nothingBuds/configureWindow.js';

export const DeviceTypeNothingBuds = 'nothingBuds';

const NothingBudsUUID = 'aeac4a03-dff5-498f-843a-34487cf133eb';
export function isNothingBuds(bluezDeviceProxy, uuids) {
    const bluezProps = [];
    const supported = uuids.includes(NothingBudsUUID) ? 'yes' : 'no';
    return {supported, bluezProps};
}

export const NothingBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_NothingBudsDevice',
}, class NothingBudsDevice extends GObject.Object {
    _init(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super._init();
        const identifier = getDeviceIdentifier(devicePath);
        const tag = `NothingBudsDevice-${identifier}`;
        this._log = createLogger(tag);
        this._log.info('------------------- NothingBudsDevice init -------------------');
        this._settings = settings;
        this._devicePath = devicePath;
        this._alias = alias;
        this._extPath = extPath;
        this.updateDeviceMapCb = updateDeviceMapCb;
        this._fwVersion = '';
        this._serialNo = '';

        this._config = createConfig();
        this._props = createProperties();
        this._modelData = null;

        this._callbacks = {
            modelIntialized: this.modelIntialized.bind(this),
            updateFirmwareInfo: this.updateFirmwareInfo.bind(this),
            updateSerial: this.updateSerial.bind(this),
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateNoiseControl: this.updateNoiseControl.bind(this),
            updatePersonalizedAnc: this.updatePersonalizedAnc.bind(this),
            updateEqPreset: this.updateEqPreset.bind(this),
            updateCustomEq: this.updateCustomEq.bind(this),
            updateEnhancedBass: this.updateEnhancedBass.bind(this),
            updateLatency: this.updateLatency.bind(this),
            updateInEar: this.updateInEar.bind(this),
            updateSpatialAudio: this.updateSpatialAudio.bind(this),
            updateFitTestResult: this.updateFitTestResult.bind(this),
            updateDualConnection: this.updateDualConnection.bind(this),
            updateDualConnectionDevices: this.updateDualConnectionDevices.bind(this),
            updateGestures: this.updateGestures.bind(this),
        };

        const profile = {type: DeviceTypeNothingBuds, uuid: NothingBudsUUID};

        this._nothingBudsSocket = new NothingBudsSocket(
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
        this._updateAncConfig();

        if (this._modelData.ring) {
            this._devInfo.updateUI('ring-state', 'stopped');
            if (!this._modelData.ringLegacy && !this._modelData.batterySingle)
                this._devInfo.updateUI('ring-state-left', 'stopped');
        }

        if (this._modelData.dualConnection)
            this._updateOwnId();
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

        if (this._modelData.eqPreset?.custom !== undefined)
            features.push({key: 'eq-custom', default: [0, 0, 0], persist: true});

        if (this._modelData.bassEnhanceLevel) {
            features.push({key: 'bass-enable', default: false, persist: true});
            features.push({key: 'bass-level', default: 1, persist: true});
        }

        if (this._modelData.lowLatencyMode)
            features.push({key: 'lowlatency', default: false, persist: true});

        if (this._modelData.inEarDetection)
            features.push({key: 'inear-enable', default: false, persist: true});

        if (this._modelData.spatialAudioSwitch)
            features.push({key: 'spatial', default: false, persist: true});

        if (this._modelData.ring) {
            features.push({key: 'ring-state', default: 'stopped', persist: true});

            if (!this._modelData.ringLegacy && !this._modelData.batterySingle)
                features.push({key: 'ring-state-left', default: 'stopped', persist: true});
        }

        if (this._modelData.fitTest) {
            features.push({key: 'fit-test-op', default: null, relay: true});
            features.push({key: 'fit-test-result', default: null, relay: true});
        }

        if (this._modelData.dualConnection) {
            features.push({key: 'multipoint', default: false, persist: true});
            features.push({key: 'own-dev', default: '', persist: true});
            features.push({key: 'dev-mgmt', default: [], persist: true});
            features.push({key: 'dev-mgmt-action', default: {action: 0, id: ''}, relay: true});
        }

        if (this._modelData.gestureOptions) {
            features.push({
                key: 'gestures', default: this._createDefaultGestures(),
                persist: true,
            });
        }

        this._devInfo = new DeviceInfo({
            settings: this._settings,
            settingsKey: 'nothing-buds-list',
            devicePath: this._devicePath,
            features,
        });

        this._gestures = this._devInfo.getValue('gestures');

        if (this._alias)
            this._devInfo?.updateUI('alias', this._alias);

        if (this._fwVersion)
            this._devInfo?.updateUI('fw-version', this._fwVersion);

        if (this._serialNo)
            this._devInfo?.updateUI('serial', this._serialNo);


        const featureCallbacks = {
            'icon': () => this._updateIcons(),
            'case': () => this._updateIcons(),
            'eq-preset': () => this._setEqPreset(),
            'eq-custom': () => this._setCustomEq(),
            'bass-enable': () => this._setEnhancedBass(),
            'bass-level': () => this._setEnhancedBass(),
            'lowlatency': () => this._setLatency(),
            'inear-enable': () => this._setInEar(),
            'spatial': () => this._setSpatialAudio(),
            'fit-test-op': () => this._setFitTest(),
            'ring-state': () => this._setRingMyBuds(),
            'ring-state-left': () => this._setRingMyBudsLeft(),
            'multipoint': () => this._setDualConnection(),
            'dev-mgmt-action': () => this._setDualConnectionDevice(),
            'gestures': () => this._handleGesturesUpdate(),
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
        const nc = this._modelData.noiseControl;
        if (!nc)
            return;

        let buttonIndex = 1;
        this._ancToggleMap = {};
        this._config.toggle1Title = _('Noise Control');

        const addToggle = (type, bytes, icon, name) => {
            this._config[`toggle1Button${buttonIndex}Icon`] = icon;
            this._config[`toggle1Button${buttonIndex}Name`] = name;
            this._ancToggleMap[buttonIndex] = {type, bytes};
            buttonIndex++;
        };

        if (nc.off)
            addToggle('off', [nc.off.byte], 'bbm-anc-off-symbolic', _('Off'));

        if (nc.transparency) {
            addToggle('transparency', [nc.transparency.byte],
                'bbm-transperancy-symbolic', _('Transparency'));
        }

        let hasNcLevel = false;
        if (nc.noiseCancellation) {
            let bytes = [];
            this._ancRadioMap = {};
            this._ancRadioReverse = {};

            if (nc.noiseCancellation.levels) {
                hasNcLevel = true;
                const levelOrder = ['low', 'mid', 'high', 'adaptive'];
                const levelsObj = nc.noiseCancellation.levels;
                const validLevels = levelOrder.filter(l => l in levelsObj);
                const labels = [];

                this._config.box1RadioTitle = _('Noise Cancellation Level');

                const levelNames = {
                    low: _('Low'),
                    mid: _('Mid'),
                    high: _('High'),
                    adaptive: _('Adaptive'),
                };

                validLevels.forEach((level, i) => {
                    const index = i + 1;
                    labels.push(levelNames[level]);
                    const byte = levelsObj[level];
                    bytes.push(byte);
                    this._ancRadioMap[index] = byte;
                    this._ancRadioReverse[byte] = index;
                });

                this._log.info(`ANC level labels: ${JSON.stringify(labels)}`);
                this._log.info(`ANC level bytes: ${JSON.stringify(bytes)}`);

                this._config.box1RadioButton = validLevels.map(l => levelNames[l]);
            } else if (nc.noiseCancellation.byte != null) {
                bytes = [nc.noiseCancellation.byte];
            }

            addToggle('noiseCancellation', bytes,
                'bbm-anc-on-symbolic', _('Noise Cancellation'));
        }

        if (hasNcLevel)
            this._config.optionsBox1.push('radio-button');

        if (this._modelData.personalizeAnc) {
            this._config.optionsBox1.push('check-button');
            this._config.box1CheckButton = [_('Personalized ANC')];
        }
    }

    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level  ?? 0;
        const bat2level = battInfo.battery2Level  ?? 0;
        const bat3level = battInfo.battery3Level  ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

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

                if (command === 'box1RadioButtonState')
                    this._box1RadioButtonStateChanged(value);

                if (command === 'settingsButtonClicked')
                    this._settingsButtonClicked();
            }
        );
    }

    updateFirmwareInfo(fwVersion) {
        this._fwVersion = fwVersion;
        this._devInfo?.updateUI('fw-version', fwVersion);
    }

    updateSerial(serial) {
        this._serialNo = serial;
        this._devInfo?.updateUI('serial', serial);
    }


    updateBatteryProps(props) {
        this._props = {...this._props, ...props};

        if (!this._modelData.batteryLR)
            this._props.computedBatteryLevel = props.battery1Level;
        else
            this._props.computedBatteryLevel = buds2to1BatteryLevel(props);

        if (!this._battInfoRecieved)
            this._startConfiguration(props);

        this.dataHandler?.setProps(this._props);
    }

    updateNoiseControl(mode) {
        if (!this._ancToggleMap)
            return;

        const nc = this._modelData.noiseControl;
        let toggleIndex = 0;
        let isNcMode = false;

        for (const [index, {bytes}] of Object.entries(this._ancToggleMap)) {
            if (bytes.includes(mode)) {
                toggleIndex = Number(index);
                if (this._ancToggleMap[toggleIndex]?.type === 'noiseCancellation')
                    isNcMode = true;
                break;
            }
        }

        this._props.toggle1State = toggleIndex;

        if (isNcMode && this._ancRadioReverse && this._ancRadioReverse[mode])
            this._props.box1RadioButtonState = this._ancRadioReverse[mode];

        if (isNcMode && (nc?.noiseCancellation?.levels || this._modelData.personalizeAnc))
            this._props.optionsBoxVisible = 1;
        else
            this._props.optionsBoxVisible = 0;

        this.dataHandler?.setProps(this._props);
    }

    _toggle1ButtonClicked(index) {
        if (!this._ancToggleMap)
            return;

        let ancMode = null;
        const toggle = this._ancToggleMap[index];
        if (!toggle)
            return;

        this._props.toggle1State = index;

        if (toggle.type === 'noiseCancellation') {
            const boxVisible = toggle.bytes.length > 1 || this._modelData.personalizeAnc;
            this._props.optionsBoxVisible = boxVisible ? 1 : 0;

            if (toggle.bytes.length > 1) {
                const radioIndex = this._props.box1RadioButtonState;
                let byte = this._ancRadioMap[radioIndex];
                if (byte == null) {
                    const levels = this._modelData.noiseControl.noiseCancellation.levels;
                    const lastLevelKey = Object.keys(levels).pop();
                    byte = levels[lastLevelKey];
                    this._props.box1RadioButtonState = this._ancRadioReverse[byte];
                }
                ancMode = byte;
            } else {
                ancMode = toggle.bytes[0];
            }
        } else {
            this._props.optionsBoxVisible = 0;
            ancMode = toggle.bytes[0];
        }

        this.dataHandler?.setProps(this._props);

        if (ancMode != null)
            this._nothingBudsSocket?.setNoiseControl(ancMode);
    }

    _box1RadioButtonStateChanged(index) {
        if (!this._ancRadioMap)
            return;

        this._props.box1RadioButtonState = index;
        this.dataHandler?.setProps(this._props);

        const byte = this._ancRadioMap[index];
        if (byte != null)
            this._nothingBudsSocket?.setNoiseControl(byte);
    }

    _box1CheckButton1StateChanged(state) {
        if (!this._modelData.personalizeAnc)
            return;

        this._props.box1CheckButton1State = state;
        this.dataHandler?.setProps(this._props);

        this._nothingBudsSocket?.setPersonalizedAnc(state);
    }

    updatePersonalizedAnc(state) {
        if (this._props.box1CheckButton1State === state)
            return;

        this._props.box1CheckButton1State = state;
        this.dataHandler?.setProps(this._props);
    }

    updateEqPreset(mode) {
        this._devInfo?.updateUI('eq-preset', mode);
    }

    _setEqPreset() {
        const mode = this._devInfo.getValue('eq-preset');
        this._nothingBudsSocket?.setEqPreset(mode);
    }

    updateCustomEq(eqArray) {
        this._devInfo?.updateUI('eq-custom', eqArray);
    }

    _setCustomEq() {
        const eqArray = this._devInfo.getValue('eq-custom');
        this._nothingBudsSocket?.setCustomEq(eqArray);
    }

    updateEnhancedBass(enable, level) {
        this._devInfo?.updateUI('bass-enable', enable);
        this._devInfo?.updateUI('bass-level', level);
    }

    _setEnhancedBass() {
        const enable = this._devInfo.getValue('bass-enable');
        const level = this._devInfo.getValue('bass-level');
        this._nothingBudsSocket?.setEnhancedBass(enable, level);
    }

    updateLatency(enable) {
        this._devInfo?.updateUI('lowlatency', enable);
    }

    _setLatency() {
        const enable = this._devInfo.getValue('lowlatency');
        this._nothingBudsSocket?.setLatency(enable);
    }

    updateInEar(enable) {
        this._devInfo?.updateUI('inear-enable', enable);
    }

    _setInEar() {
        const enable = this._devInfo.getValue('inear-enable');
        this._nothingBudsSocket?.setInEar(enable);
    }

    updateSpatialAudio(enable) {
        this._devInfo?.updateUI('spatial', enable);
    }

    _setSpatialAudio() {
        const enable = this._devInfo.getValue('spatial');
        this._nothingBudsSocket?.setSpatialAudio(enable);
    }

    updateDualConnection(enable) {
        this._devInfo?.updateUI('multipoint', enable);
    }

    _setDualConnection() {
        const enable = this._devInfo.getValue('multipoint');
        this._nothingBudsSocket?.setDualConnection(enable);
    }

    _dualConnectionDevicesEqual(a = [], b = []) {
        if (a.length !== b.length)
            return false;

        return a.every((device, index) => {
            const other = b[index];

            return device.id === other.id &&
                device.name === other.name &&
                device.connected === other.connected &&
                device.state === other.state;
        });
    }

    updateDualConnectionDevices(devices) {
        const updatedDevices = devices.map(device => ({
            id: device.mac.toLowerCase(),
            name: device.name,
            connected: device.connected,
            state: BtDeviceState.Ready,
        }));

        if (this._dualConnectionDevicesEqual(this._dualConnectionDevices, updatedDevices))
            return;

        this._dualConnectionDevices = updatedDevices;

        this._devInfo?.updateUI('dev-mgmt', updatedDevices);
    }

    _setDualConnectionDevice() {
        const data = this._devInfo.getValue('dev-mgmt-action');
        switch (data.action) {
            case DeviceManagementAction.Connect:
                this._nothingBudsSocket?.setDualConnectionDevice(data.id, true);
                break;

            case DeviceManagementAction.Disconnect:
                this._nothingBudsSocket?.setDualConnectionDevice(data.id, false);
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

    _handleGesturesUpdate() {
        const newGestures = this._devInfo.getValue('gestures');
        if (this._gestureSlotsEqual(this._gestures, newGestures))
            return;

        const oldGestures = this._gestures;
        this._gestures = newGestures;

        const diff = this._findGestureDiff(newGestures, oldGestures);
        if (diff)
            this._setGesture(diff);
    }

    _createDefaultGestures() {
        const opts = this._modelData.gestureOptions;
        const hex = opts?.default;
        if (!hex)
            return [];

        const bytes = [];

        for (let i = 0; i < hex.length; i += 2)
            bytes.push(parseInt(hex.substr(i, 2), 16));

        const count = bytes[0];
        const slots = [];

        let offset = 1;
        for (let i = 0; i < count; i++) {
            if (offset + 4 > bytes.length)
                break;

            slots.push({
                device: bytes[offset],
                buttonId: bytes[offset + 1],
                type: bytes[offset + 2],
                action: bytes[offset + 3],
            });

            offset += 4;
        }

        return slots;
    }

    _isValidGestureSlot(slot) {
        const opts = this._modelData.gestureOptions;
        if (!opts)
            return false;

        const {slots, mapping, gestures} = opts;

        const slotDef = slots.find(s =>
            s.device === slot.device &&
            s.buttonId === slot.buttonId &&
            mapping.gestureTypes[s.type] === slot.type
        );

        if (!slotDef) {
            this._log.info(
                `Unsupported slot device=${slot.device} button=${slot.buttonId} type=${slot.type}`
            );
            return false;
        }

        const gestureKey = Object.entries(mapping.gestureTypes)
            .find(([, v]) => v === slot.type)?.[0];

        if (!gestureKey || !gestures[gestureKey]) {
            this._log.info(`Unsupported gesture type byte: ${slot.type}`);
            return false;
        }

        const actionKey = Object.entries(mapping.actions)
            .find(([, values]) => values.includes(slot.action))?.[0];

        if (!actionKey) {
            this._log.info(`Unsupported action byte: ${slot.action}`);
            return false;
        }

        if (!gestures[gestureKey].actions.includes(actionKey)) {
            this._log.info(
                `Action '${actionKey}' not allowed for gesture '${gestureKey}'`
            );
            return false;
        }

        return true;
    }

    _gestureSlotsEqual(a = [], b = []) {
        if (a.length !== b.length)
            return false;

        const areEqual = a.every((slot, index) => {
            const other = b[index];

            const sameDevice = slot.device === other.device;
            const sameButton = slot.buttonId === other.buttonId;
            const sameType   = slot.type === other.type;
            const sameAction = slot.action === other.action;

            return sameDevice && sameButton && sameType && sameAction;
        });

        return areEqual;
    }

    _findGestureDiff(newSlots, oldSlots) {
        for (let i = 0; i < newSlots.length; i++) {
            const old = oldSlots[i];
            const cur = newSlots[i];

            if (!old || old.device !== cur.device || old.buttonId !== cur.buttonId ||
                    old.type !== cur.type || old.action !== cur.action)
                return cur;
        }
        return null;
    }

    updateGestures(slots) {
        const validSlots = [];

        for (const slot of slots) {
            if (this._isValidGestureSlot(slot))
                validSlots.push(slot);
        }

        this._gestures = validSlots;
        this._devInfo?.updateUI('gestures', validSlots);
    }

    _setGesture(slot) {
        this._nothingBudsSocket?.setGesture(slot);
    }

    updateFitTestResult(result) {
        this._log.info(`Update Fit Test Result: left=${result?.left}, right=${result?.right}`);
        this._fitTestResult = result;
        this._devInfo?.updateUI('fit-test-result', result);
    }

    _setFitTest() {
        const action = this._devInfo.getValue('fit-test-op');
        this._nothingBudsSocket?.setFitTest(action);
    }

    _setRingMyBuds() {
        const state = this._devInfo.getValue('ring-state');
        this._nothingBudsSocket?.setRingMyBuds(state, false);
    }

    _setRingMyBudsLeft() {
        const state = this._devInfo.getValue('ring-state-left');
        this._nothingBudsSocket?.setRingMyBuds(state, true);
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

        this._nothingBudsSocket?.destroy();
        this._nothingBudsSocket = null;

        if (this._devInfoSignalId)
            this._devInfo?.disconnect(this._devInfoSignalId);
        this._devInfoSignalId = null;
        this._devInfo = null;

        if (this._dataHandlerId)
            this.dataHandler?.disconnect(this._dataHandlerId);
        this._dataHandlerId = null;
        this.dataHandler = null;

        this._settings = null;
        this._battInfoRecieved = false;
    }
});

