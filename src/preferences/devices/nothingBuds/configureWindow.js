'use strict';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {
    supportedAudioSingleIcons, supportedAudioDualIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';
import {SliderRowWidget} from './../../widgets/sliderRowWidget.js';
import {CheckBoxesRowWidget} from './../../widgets/checkBoxesRowWidget.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';
import {RingMyBudsRow} from './../../widgets/ringMyBudsRow.js';
import {EqualizerWidget} from './../../widgets/equalizerWidget.js';
import {DeviceManagementRow} from './../../widgets/deviceMgmtRowWidget.js';
import {BtDeviceState} from '../../../lib/devices/commonEmuns.js';
import {EarTipStatus, EarTipFitTestRow} from '../../widgets/earTipFitTestRow.js';

const NC_BITMASK_TO_BYTE = {
    0b101: 0x14,
    0b110: 0x16,
    0b111: 0x0A,
    0b011: 0x15,
};

const NC_BYTE_TO_BITMASK = {
    0x14: 0b101,
    0x16: 0b110,
    0x0A: 0b111,
    0x15: 0b011,
};

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_NothingBudsConfigureWindow',
}, class ConfigureWindow extends Adw.Window {
    _init(devInfo, modelData) {
        super._init({
            default_width: 650,
            default_height: 650,
            width_request: 320,
            height_request: 100,
        });

        this._devInfo = devInfo;
        this._modelData = modelData;

        this._isCompactMode = false;

        this._breakpointCompact = new Adw.Breakpoint({
            condition: Adw.BreakpointCondition.parse('max-width: 500px'),
        });

        this._breakpointExpanded = new Adw.Breakpoint({
            condition: Adw.BreakpointCondition.parse('min-width: 550px'),
        });

        this.add_breakpoint(this._breakpointCompact);
        this.add_breakpoint(this._breakpointExpanded);

        this._breakpointCompact.connect('apply', () => {
            this._isCompactMode = true;
            this._updateCompactStatus();
        });

        this._breakpointExpanded.connect('apply', () => {
            this._isCompactMode = false;
            this._updateCompactStatus();
        });

        this.checkBoxWidgets = [];

        this.title = this._devInfo.getValue('alias');

        const toolViewBar = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        this._page = new Adw.PreferencesPage();

        toolViewBar.add_top_bar(headerBar);
        toolViewBar.set_content(this._page);
        this.set_content(toolViewBar);

        const iconList = this._modelData.batteryLR ? supportedAudioDualIcons
            : supportedAudioSingleIcons;

        let caseIconList = [];
        let initialCaseIcon = '';
        if (this._modelData.batteryCase) {
            caseIconList = supportedCaseIcons;
            initialCaseIcon = this._devInfo.getValue('case');
        }

        const iconSelector = new IconSelectorWidget({
            iconList,
            initialIcon: this._devInfo.getValue('icon'),
            caseIconList,
            initialCaseIcon,
            mac: this._devInfo.mac,
            fw: this._devInfo.getValue('fw-version'),
            serial: this._devInfo.getValue('serial'),
        });

        iconSelector.connect('notify::selected-icon', () => {
            const deviceIcon = iconSelector.selected_icon;
            this._fitTestRow?.updateIcon(deviceIcon);
            this._devInfo.updateDevice('icon', deviceIcon);
        });

        this._fitTestRow?.updateIcon(this._devInfo.getValue('icon'));

        if (this._modelData.batteryCase) {
            iconSelector.connect('notify::selected-case-icon', () => {
                this._devInfo.updateDevice('case', iconSelector.selected_case_icon);
            });
        }

        this._page.add(iconSelector);

        this._addEq();
        this._addSpatialAudio();
        this._addMiscSetting();
        this._addConnectionManagement();
        this._addGestureControls();

        this._devInfoSignalId = this._devInfo.connect('update-ui', (info, feature) => {
            const value = info.getValue(feature);

            switch (feature) {
                case 'alias':
                    this.title = value;
                    break;

                case 'eq-preset':
                    if (this._eqPresetDropdown)
                        this._eqPresetDropdown.selected_item = value;
                    break;

                case 'eq-custom':
                    if (this._eq)
                        this._eq.setValues(value);
                    break;

                case 'bass-enable':
                    if (this._bassEnhanceSwitch)
                        this._bassEnhanceSwitch.active = value;
                    break;

                case 'bass-level':
                    if (this._baseLevel)
                        this._baseLevel.value = value;
                    break;

                case 'lowlatency':
                    if (this._lowLatencySwitch)
                        this._lowLatencySwitch.active = value;
                    break;

                case 'inear-enable':
                    if (this._inEarSwitch)
                        this._inEarSwitch.active = value;
                    break;

                case 'spatial':
                    if (this._spatialAudioSwitch)
                        this._spatialAudioSwitch.active = value;
                    break;

                case 'fit-test-result':
                    if (this._fitTestRow?.isTestInProgress())
                        this._onFitTestCompleted?.(value);
                    break;

                case 'multipoint':
                    if (this._dualConnSwitch)
                        this._dualConnSwitch.active = value;
                    break;

                case 'dev-mgmt':
                    if (this._dualConnSwitch)
                        this._dualConnSwitch?.updateDevices(value ?? []);
                    break;
            }
        });

        this.connect('close-request', () => {
            if (this._devInfoSignalId)
                this._devInfo?.disconnect(this._devInfoSignalId);
            this._devInfoSignalId = null;

            if (this._modelData?.ring) {
                const ringState = devInfo.getValue('ring-state');
                if (ringState === 'playing')
                    this._devInfo.updateDevice('ring-state', 'stopped');

                if (!this._modelData.ringLegacy && !this._modelData.batterySingle) {
                    const ringStateLeft = devInfo.getValue('ring-state-left');
                    if (ringStateLeft === 'playing')
                        this._devInfo.updateDevice('ring-state-left', 'stopped');
                }
            }

            if (this._fitTestTimeoutId) {
                GLib.source_remove(this._fitTestTimeoutId);
                this._fitTestTimeoutId = null;
            }

            if (this._modelData?.fitTest && this._fitTestRow) {
                if (this._fitTestRow.isTestInProgress())
                    this._devInfo.updateDevice('fit-test-op', 'stop');

                if (this._fitTestRowCancelId)
                    this._fitTestRow.disconnect(this._fitTestRowCancelId);
                this._fitTestRowCancelId = null;

                if (this._fitTestRowStartId)
                    this._fitTestRow.disconnect(this._fitTestRowStartId);
                this._fitTestRowStartId = null;
            }

            this._eq?.destroy();
            this._eq = null;
            this._baseLevel?.destroy();
            this._baseLevel = null;
            this._devInfo = null;

            return false;
        });
    }

    _addEq() {
        if (!this._modelData?.eqPreset)
            return;

        const eqGroup = new Adw.PreferencesGroup({title: _('Sound Settings')});
        this._page.add(eqGroup);

        const presetObj = this._modelData.eqPreset;

        const presetLabels = {
            balanced: _('Balanced'),
            voice: _('Vocals'),
            more_treble: _('Treble Boost'),
            more_bass: _('Bass Boost'),
            dirac: _('Dirac'),
            rock: _('Rock'),
            electronic: _('Electronic'),
            pop: _('Pop'),
            enhance_vocals: _('Vocal Boost'),
            classical: _('Classical'),
            custom: _('Custom'),
        };

        const descriptors = Object.keys(presetObj).filter(key => presetLabels[key] !== undefined)
                .map(key => ({label: presetLabels[key], value: presetObj[key]}));

        const options = descriptors.map(d => d.label);
        const presetValues  = descriptors.map(d => d.value);

        const customEqButton = presetObj.custom !== undefined ? {
            hasButton: true,
            buttonIcon: 'bbm-eq-symbolic',
            buttonTooltip: _('Custom Equalizer'),
            buttonVisibleFor: [presetObj.custom],
        } : {};

        this._eqPresetDropdown = new DropDownRowWidget({
            title: _('Equalizer Preset'),
            subtitle: _('Change the sound signature'),
            options,
            values: presetValues,
            initialValue: this._devInfo.getValue('eq-preset'),
            ...customEqButton,
        });

        this._eqPresetDropdown.connect('notify::selected-item', () => {
            this._devInfo.updateDevice('eq-preset', this._eqPresetDropdown.selected_item);
        });

        eqGroup.add(this._eqPresetDropdown);

        if (this._modelData.eqPreset?.custom === undefined)
            return;

        const eqFreqs = [_('Bass'), _('Mid'), _('Treble')];
        const eqRange = 6;
        const initialValues = this._devInfo.getValue('eq-custom');

        this._eq = new EqualizerWidget({
            freqs: eqFreqs,
            initialValues,
            range: eqRange,
            topBarTitle: _('Band'),
            bottomBarTitle: _('Gain (dB)'),
        });

        this._eq.connect('eq-changed', (_widget, values) => {
            this._devInfo.updateDevice('eq-custom', values);
        });

        this._eqPresetDropdown.connect('button-clicked', () => this._eq.present(this));

        this._addBassEnhance(eqGroup);
    }

    _addBassEnhance(eqGroup) {
        if (!this._modelData?.bassEnhanceLevel)
            return;

        this._bassEnhanceSwitch = new Adw.SwitchRow({
            title: _('Bass Enhancement'),
            subtitle: _('Enhances bass in real time'),
        });

        this._bassEnhanceSwitch.active = this._devInfo.getValue('bass-enable');

        this._bassEnhanceSwitch.connect('notify::active', () => {
            this._devInfo.updateDevice('bass-enable', this._bassEnhanceSwitch.active);
        });

        eqGroup.add(this._bassEnhanceSwitch);

        this._baseLevel = new SliderRowWidget({
            rowTitle: _('Bass Enhancement Level'),
            range: [1, 5, 1],
            marks: [
                {mark: 1, label: _('-')},
                {mark: 2},
                {mark: 3},
                {mark: 4},
                {mark: 5, label: _('+')},
            ],
            initialValue: this._devInfo.getValue('bass-level'),
            snapOnStep: true,
        });

        this._baseLevel.compact_mode = this._isCompactMode;

        this._baseLevel.connect('notify::value', () => {
            this._devInfo.updateDevice('bass-level', this._baseLevel.value);
        });

        eqGroup.add(this._baseLevel);

        this._bassEnhanceSwitch.bind_property(
            'active',
            this._baseLevel,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );
    }

    _addSpatialAudio() {
        if (!this._modelData?.spatialAudioSwitch)
            return;

        const spatialAudioGroup = new Adw.PreferencesGroup({title: _('Immersive Audio')});
        this._page.add(spatialAudioGroup);

        this._spatialAudioSwitch = new Adw.SwitchRow({
            title: _('Spatial Audio'),
            subtitle: _('Add depth for a more immersive experience'),
        });

        this._spatialAudioSwitch.active = this._devInfo.getValue('spatial');

        this._spatialAudioSwitch.connect('notify::active', () => {
            this._devInfo.updateDevice('spatial', this._spatialAudioSwitch.active);
        });

        spatialAudioGroup.add(this._spatialAudioSwitch);
    }

    _addMiscSetting() {
        let miscGroup;

        if (this._modelData?.lowLatencyMode || this._modelData?.inEarDetection ||
                this._modelData.fitTest || this._modelData?.ring) {
            miscGroup = new Adw.PreferencesGroup({title: _('Additional Settings')});
            this._page.add(miscGroup);
        }

        if (this._modelData?.lowLatencyMode) {
            this._lowLatencySwitch = new Adw.SwitchRow({
                title: _('Game Mode'),
                subtitle: _('Reduces latency and enhances in-game audio'),
            });

            this._lowLatencySwitch.active = this._devInfo.getValue('lowlatency');

            this._lowLatencySwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('lowlatency', this._lowLatencySwitch.active);
            });

            miscGroup.add(this._lowLatencySwitch);
        }

        if (this._modelData?.inEarDetection) {
            this._inEarSwitch = new Adw.SwitchRow({
                title: _('In-Ear Detection'),
                subtitle: _('Enable features based on wearing detection'),
            });

            this._inEarSwitch.active = this._devInfo.getValue('inear-enable');

            this._inEarSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('inear-enable', this._inEarSwitch.active);
            });

            miscGroup.add(this._inEarSwitch);
        }

        if (this._modelData.fitTest) {
            const deviceIcon = this._devInfo.getValue('icon');

            this._fitTestRow = new EarTipFitTestRow(this, deviceIcon);

            this._fitTestRowStartId = this._fitTestRow.connect('start-test', () => {
                this._devInfo.updateDevice('fit-test-result', null);
                this._devInfo.updateDevice('fit-test-op', 'start');

                if (this._fitTestTimeoutId) {
                    GLib.source_remove(this._fitTestTimeoutId);
                    this._fitTestTimeoutId = null;
                }

                this._fitTestTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
                    this._fitTestTimeoutId = null;
                    this._fitTestRow.updateStatus(EarTipStatus.Error, EarTipStatus.Error);

                    return GLib.SOURCE_REMOVE;
                });
            });

            this._fitTestRowCancelId = this._fitTestRow.connect('cancel-test', () => {
                if (this._fitTestTimeoutId) {
                    GLib.source_remove(this._fitTestTimeoutId);
                    this._fitTestTimeoutId = null;
                }

                this._devInfo.updateDevice('fit-test-result', null);
                this._devInfo.updateDevice('fit-test-op', 'stop');
            });

            miscGroup.add(this._fitTestRow);

            this._onFitTestCompleted = res => {
                if (!res)
                    return;

                if (!this._fitTestRow)
                    return;

                if (this._fitTestTimeoutId) {
                    GLib.source_remove(this._fitTestTimeoutId);
                    this._fitTestTimeoutId = null;
                }

                this._fitTestRow.updateStatus(res.left, res.right);
            };
        }


        if (this._modelData?.ring) {
            const dual = !this._modelData.ringLegacy && !this._modelData.batterySingle;

            this._ringBudsRow = new RingMyBudsRow({dual});

            this._ringBudsRow.connect('notify::status', () => {
                this._devInfo.updateDevice('ring-state', this._ringBudsRow.status);
            });

            if (dual) {
                this._ringBudsRow.connect('notify::status-left', () => {
                    this._devInfo.updateDevice('ring-state-left', this._ringBudsRow.statusLeft);
                });
            }

            miscGroup.add(this._ringBudsRow);
        }
    }

    _addConnectionManagement() {
        if (!this._modelData.dualConnection)
            return;

        const devMgmtGroup = new Adw.PreferencesGroup({
            title: _('Connection Management'),
        });
        this._page.add(devMgmtGroup);

        const deviceManagementConfig = {
            maxConnected: this._modelData.maxConnected ?? 2,
            hasMultipointSwitch: true,
            hasPairMode: false,
            hasRoutingIndicator: false,
            hasRoutingControl: false,
            hasActiveFix: false,
            hasConnectDisconnectOnly: true,
            showMac: true,
            refreshOnWindowOpen: false,
        };

        const ownDevice = this._devInfo.getValue('own-dev');

        this._dualConnSwitch = new DeviceManagementRow(
            this,
            this._devInfo.getValue('dev-mgmt') ?? [],
            ownDevice,
            '',
            deviceManagementConfig
        );

        this._dualConnSwitch.active = this._devInfo.getValue('multipoint');

        this._dualConnSwitch.connect('notify::active', () => {
            this._devInfo.updateDevice('multipoint', this._dualConnSwitch.active);
        });

        this._dualConnSwitch.connect('device-action', (_row, action, id) => {
            const devices = this._devInfo.getValue('dev-mgmt');
            const device = devices.find(device => device.id === id);

            if (device) {
                device.state = BtDeviceState.Processing;
                this._devInfo.updateDevice('dev-mgmt', devices);
                this._dualConnSwitch.updateDevices(devices);
            }

            const data = {action, id};
            this._devInfo.updateDevice('dev-mgmt-action', data);
        });

        devMgmtGroup.add(this._dualConnSwitch);
    }

    _buildNoiseControlRow(title, savedSlot)  {
        const items = [
            {name: _('Off'), icon: 'bbm-anc-off-symbolic'},
            {name: _('Ambient'), icon: 'bbm-transperancy-symbolic'},
            {name: _('Noise Cancellation'), icon: 'bbm-anc-on-symbolic'},
        ];

        const initialMask =
            savedSlot && NC_BYTE_TO_BITMASK[savedSlot.action]
                ? NC_BYTE_TO_BITMASK[savedSlot.action]
                : 0;

        const checkBoxWidget =  new CheckBoxesRowWidget({
            rowTitle: _('Noise Control Cycle: ') + title,
            items,
            applyBtnName: _('Apply'),
            initialValue: initialMask,
            minRequired: 2,
        });

        checkBoxWidget.compact_mode = this._isCompactMode;
        this.checkBoxWidgets.push(checkBoxWidget);

        return checkBoxWidget;
    };

    _addGestureControls() {
        const gc = this._modelData?.gestureOptions;
        if (!gc)
            return;

        const allSlots = this._devInfo.getValue('gestures');

        const gestureGroup = new Adw.PreferencesGroup({
            title: _('Gesture Controls'),
            description: _('Customize actions for buttons and touch gestures'),
        });

        const GESTURE_DISPLAY = {
            'single-tap': _('Single Tap'),
            'double-tap': _('Double Tap'),
            'triple-tap': _('Triple Tap'),
            'action-hold-tap': _('Tap and Hold'),
            'double-action-hold-tap': _('Double Tap and Hold'),
            'both-buds-action-tap': _('Tap Both Buds'),

            'single-press': _('Single Press'),
            'double-press': _('Double Press'),
            'triple-press': _('Triple Press'),
            'action-hold-press': _('Press and Hold'),
            'double-action-hold-press': _('Double Press and Hold'),
            'both-buds-action-press': _('Press Both Buds'),

            'single-pinch': _('Single Pinch'),
            'double-pinch': _('Double Pinch'),
            'triple-pinch': _('Triple Pinch'),
            'action-hold-pinch': _('Pinch and Hold'),
            'double-action-hold-pinch': _('Double Pinch and Hold'),
            'both-buds-action-pinch': _('Pinch Both Buds'),

            'roller-action-hold-press': _('Press and Hold'),
            'slider-single-slide': _('Slide to Adjust'),

            'case-knob-single-press': _('Single Press'),
            'case-knob-double-press': _('Double Press'),
            'case-knob-triple-press': _('Triple Press'),
            'case-knob-action-hold-press': _('Press and Hold'),
            'case-knob-double-action-hold-press': _('Double Press and Hold'),
            'case-knob-rotate-rotate': _('Rotate'),
        };

        const makeDropdown = (gestureKey, gestureConfig, slot) => {
            if (!gestureConfig?.actions?.length)
                return null;

            const actions = gestureConfig.actions;
            const onlyNoiseControl = actions.length === 1 && actions[0] === 'noise-control';

            const typeByte = gc.mapping.gestureTypes?.[gestureKey];
            if (typeByte === undefined)
                return null;

            const deviceByte = slot.device;

            let savedSlot = allSlots.find(s => s.device === deviceByte && s.type === typeByte);

            const displayKey = `${slot.type}-${gestureConfig.type}`;
            const title = GESTURE_DISPLAY[displayKey] ?? _('Unknown Gesture');

            let dd = null;
            let ncRow = null;

            if (!onlyNoiseControl) {
                const options = actions.map(a => this._readableAction(_, a));
                const values = actions.map(a => {
                    const bytes = gc.mapping.actions[a];
                    return Array.isArray(bytes) ? bytes[0] : bytes;
                });

                const initialValue = savedSlot?.action ?? values[0];

                dd = new DropDownRowWidget({
                    title,
                    options,
                    values,
                    initialValue,
                });
            }

            if (gc.noiseControlModes && actions.includes('noise-control')) {
                ncRow = this._buildNoiseControlRow(title, savedSlot);

                if (dd) {
                    const ncBytes = gc.mapping.actions['noise-control'];
                    ncRow.visible = ncBytes.includes(dd.selected_item);
                }

                ncRow.connect('notify::toggled-value', () => {
                    const byte = NC_BITMASK_TO_BYTE[ncRow.toggled_value];
                    if (!byte)
                        return;

                    if (!savedSlot) {
                        savedSlot = {device: deviceByte, type: typeByte};
                        allSlots.push(savedSlot);
                    }

                    savedSlot.action = byte;
                    this._devInfo.updateDevice('gestures', allSlots);
                });
            }

            if (dd) {
                dd.connect('notify::selected-item', () => {
                    const val = dd.selected_item;

                    if (!savedSlot) {
                        savedSlot = {device: deviceByte, type: typeByte};
                        allSlots.push(savedSlot);
                    }

                    savedSlot.action = val;

                    if (ncRow) {
                        const isNC = gc.mapping.actions['noise-control'].includes(val);
                        ncRow.visible = isNC;
                    }

                    this._devInfo.updateDevice('gestures', allSlots);
                });
            }

            return {dropdown: dd, checkBoxWidget: ncRow};
        };

        const groups = new Map();

        for (const slot of gc.slots) {
            if (!groups.has(slot.group)) {
                const expander = new Adw.ExpanderRow({
                    title: this._getGroupTitle(slot.group),
                    subtitle: _('Configure controls'),
                });

                groups.set(slot.group, expander);
                gestureGroup.add(expander);
            }
        }

        for (const slot of gc.slots) {
            const gestureKey = slot.type;
            const gestureConfig = gc.gestures?.[gestureKey];
            if (!gestureConfig)
                continue;

            const expander = groups.get(slot.group);
            if (!expander)
                continue;

            const widgets = makeDropdown(gestureKey, gestureConfig, slot);
            if (!widgets)
                continue;

            if (widgets.dropdown)
                expander.add_row(widgets.dropdown);

            if (widgets.checkBoxWidget)
                expander.add_row(widgets.checkBoxWidget);
        }

        this._page.add(gestureGroup);
    }

    _getGroupTitle(group) {
        switch (group) {
            case 'single':
                return _('Gesture Controls');

            case 'left':
                return _('Left Earbud');

            case 'right':
                return _('Right Earbud');

            case 'roller':
                return _('Roller Controls');

            case 'case-knob':
                return _('Charging Case');

            case 'slider':
                return _('Slider Controls');

            default:
                return _('Gesture Controls');
        }
    }

    _readableAction(_, action) {
        switch (action) {
            case 'play-pause':
                return _('Play / Pause');

            case 'skip-back':
                return _('Previous Track');

            case 'skip-forward':
                return _('Next Track');

            case 'voice-assistant':
                return _('Voice Assistant');

            case 'volume-up':
                return _('Volume Up');

            case 'volume-down':
                return _('Volume Down');

            case 'volume-control':
                return _('Volume Control');

            case 'noise-control':
                return _('Noise Control');

            case 'anc-type':
                return _('ANC Type');

            case 'no-action':
                return _('No Action');

            case 'change-volume':
                return _('Change Volume');

            case 'channel-hop':
                return _('Channel Hop');

            case 'news-description':
                return _('New Reporter');

            case 'spatial-audio':
                return _('Spatial Audio');

            case 'mic-on-off':
                return _('Mic On/Off');

            case 'eq-preset':
                return _('Equalizer Preset');

            case 'super-mic':
                return _('Walkie-Talkie');

            case 'ultra-bass':
                return _('Bass');

            case 'treble-enhance':
                return _('Treble');

            case 'case-game-mode':
                return _('Toggle Low Latency');

            case 'essential-space':
                return _('Essential Space');

            case 'take-photo':
                return _('Take Photo');

            case 'recording':
                return _('Start / Stop Recording');

            case 'mic-mute':
                return _('Mute / Unmute Mic');

            default:
                return action;
        }
    }

    _updateCompactStatus() {
        for (const widget of this.checkBoxWidgets)
            widget.set_property('compact-mode', this._isCompactMode);

        this._baseLevel?.set_property('compact-mode', this._isCompactMode);
    }
});
