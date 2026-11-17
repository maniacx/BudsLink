'use strict';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import {gettext as _, pgettext} from 'gettext';

import {
    supportedAudioSingleIcons, supportedAudioDualIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';
import {CheckBoxesRowWidget} from './../../widgets/checkBoxesRowWidget.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';
import {RadioButtonRowWidget} from './../../widgets/radioButtonRowWidget.js';
import {RingMyBudsRow} from './../../widgets/ringMyBudsRow.js';
import {EqualizerWidget} from './../../widgets/equalizerWidget.js';

// Keep existing translations when a locale has no Redmi-specific entry yet.
const localizedLabel = (translation, original) =>
    translation === original ? _(original) : translation;

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_RedmiBudsConfigureWindow',
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

        const iconList = this._modelData.batteryMutiple ? supportedAudioDualIcons
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
            this._devInfo.updateDevice('icon', iconSelector.selected_icon);
        });

        if (this._modelData.batteryCase) {
            iconSelector.connect('notify::selected-case-icon', () => {
                this._devInfo.updateDevice('case', iconSelector.selected_case_icon);
            });
        }

        this._page.add(iconSelector);

        this._addInEar();
        this._addEq();
        this._addSpatialAudio();
        this._addMiscSetting();
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

                case 'dual-conn':
                    if (this._dualConnSwitch)
                        this._dualConnSwitch.active = value;
                    break;

                case 'auto-answer':
                    if (this._autoAwnswerSwitch)
                        this._autoAwnswerSwitch.active = value;
                    break;

                case 'adapt-sound':
                    if (this._adaptiveSoundSwitch)
                        this._adaptiveSoundSwitch.active = value;
                    break;

                case 'low-latency':
                    if (this._lowLatencySwitch)
                        this._lowLatencySwitch.active = value;
                    break;

                case 'immersive-sound':
                    if (this._immersiveSoundSwitch)
                        this._immersiveSoundSwitch.active = value;
                    break;

                case 'head-tracking':
                    if (this._headTrackingSwitch)
                        this._headTrackingSwitch.active = value;
                    break;

                case 'spatial-audio-scene':
                    if (this._spatialAudioSceneDropdown)
                        this._spatialAudioSceneDropdown.selected_item = value;
                    break;

                case 'ring-state':
                    if (this._ringBudsRow)
                        this._ringBudsRow.status = value;
                    break;

                case 'ring-state-left':
                    if (this._ringBudsRow)
                        this._ringBudsRow.statusLeft = value;
                    break;

                case 'single-left':
                case 'single-right':
                case 'double-left':
                case 'double-right':
                case 'triple-left':
                case 'triple-right':
                case 'action-hold-left':
                case 'action-hold-right':
                case 'swipe-left':
                case 'swipe-right': {
                    const gestureRow = this._gestureRows[feature];

                    if (gestureRow)
                        gestureRow.selected_item = value;

                    const noiseControlRows = Object.values(this._noiseControlRows);
                    for (const {ncRow, dropdown, ncValue} of noiseControlRows) {
                        if (dropdown === gestureRow)
                            ncRow.visible = value === ncValue;
                    }
                    break;
                }
                case 'left-longpress':
                case 'right-longpress': {
                    const ncRow = this._noiseControlRows[feature]?.ncRow;

                    if (ncRow)
                        ncRow.toggled_value = value;
                    break;
                }
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

            this._eq?.destroy();
            this._eq = null;
            this._devInfo = null;

            return false;
        });
    }

    _addInEar() {
        if (!this._modelData.inEarDetection)
            return;

        const inEarSettingsGroup = new Adw.PreferencesGroup({
            title: _('Playback Behavior'),
        });

        const inEarOptions =  [
            _('Default behavior'),
            _('Resume with both earbuds, Pause if any removed'),
            _('Resume with any earbud, Pause if both removed'),
        ];

        this._inEarDropdown = new RadioButtonRowWidget({
            title: _('Choose Playback Behavior for Ear Detection'),
            subtitle: _('Automatically pause or resume playback ' +
                'based on wearing detection.'),
            options: inEarOptions,
            initialValue: this._devInfo.getValue('ear-detection-mode'),
        });

        this._inEarDropdown.connect('notify::toggled-value', () => {
            this._devInfo.updateDevice('ear-detection-mode', this._inEarDropdown.toggled_value);
        });

        inEarSettingsGroup.add(this._inEarDropdown);

        this._page.add(inEarSettingsGroup);
    }

    _addEq() {
        if (!this._modelData.eqPreset)
            return;

        const eqGroup = new Adw.PreferencesGroup({title: _('Equalizer')});
        this._page.add(eqGroup);

        const presetObj = this._modelData.eqPreset;

        const presetLabels = {
            standard: _('Standard'),
            voice: localizedLabel(pgettext('Redmi equalizer preset', 'Vocals'), 'Vocals'),
            base: _('Bass Boost'),
            treble: _('Treble Boost'),
            boostVolume: _('Volume Boost'),
            custom: _('Custom'),
            classic: _('Classic'),
            legendary: _('Audiophile'),
            soothingboost: _('Bass Reducer'),
            harman: _('Harman EFX'),
            harmanmaster: _('Harman Master'),
            standard2: _('Standard'),
            outdoor: _('Outdoor'),
            underwater: _('Underwater'),
            balanced: _('Balanced'),
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

        const eqFreqs = [_('62'), _('125'), _('250'), _('500'), _('1k'), _('2k'), _('4k'),
            _('8k'), _('12k'), _('16k')];

        const eqRange = 6;
        const initialValues = this._devInfo.getValue('eq-custom');

        this._eq = new EqualizerWidget({
            freqs: eqFreqs,
            initialValues,
            range: eqRange,
            topBarTitle: _('Frequency (Hz)'),
            bottomBarTitle: _('Gain (dB)'),
        });

        this._eq.connect('eq-changed', (_widget, values) => {
            this._devInfo.updateDevice('eq-custom', values);
        });

        this._eqPresetDropdown.connect('button-clicked', () => this._eq.present(this));
    }

    _addSpatialAudio() {
        if (!this._modelData.immersiveSound)
            return;

        const spatialAudioGroup = new Adw.PreferencesGroup({title: _('Immersive Audio')});
        this._page.add(spatialAudioGroup);


        this._immersiveSoundSwitch = new Adw.SwitchRow({
            title: _('Spatial Audio'),
            subtitle: _('Add depth for a more immersive experience'),
        });

        this._immersiveSoundSwitch.active = this._devInfo.getValue('immersive-sound');

        this._immersiveSoundSwitch.connect('notify::active', () => {
            this._devInfo.updateDevice('immersive-sound', this._immersiveSoundSwitch.active);
        });

        spatialAudioGroup.add(this._immersiveSoundSwitch);


        if (this._modelData.headTracking) {
            this._headTrackingSwitch = new Adw.SwitchRow({
                title: _('Track Head Movement'),
                subtitle: _('Audio moves with your head'),
            });

            this._headTrackingSwitch.active = this._devInfo.getValue('head-tracking');

            this._headTrackingSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('head-tracking', this._headTrackingSwitch.active);
            });

            spatialAudioGroup.add(this._headTrackingSwitch);

            this._immersiveSoundSwitch.bind_property('active',
                this._headTrackingSwitch, 'visible',
                GObject.BindingFlags.SYNC_CREATE);
        }

        if (this._modelData.spatialAudioScenes) {
            const scenes = this._modelData.spatialAudioScenes;
            // TRANSLATORS: Spatial audio scene names supplied by device configurations.
            const sceneLabels = {
                Standard: _('Standard'),
                Music: _('Music'),
                Video: _('Video'),
                Game: _('Game'),
                Audiobooks: _('Audiobooks'),
            };
            const sceneNames = Object.keys(scenes).map(k => sceneLabels[k] ?? _(k));
            const sceneValues = Object.values(scenes);

            this._spatialAudioSceneDropdown = new DropDownRowWidget({
                title: _('Spatial Audio Scene'),
                subtitle: _('Select the sound environment'),
                options: sceneNames,
                values: sceneValues,
                initialValue: this._devInfo.getValue('spatial-audio-scene'),
            });

            this._spatialAudioSceneDropdown.connect('notify::selected-item', () => {
                this._devInfo.updateDevice('spatial-audio-scene',
                    this._spatialAudioSceneDropdown.selected_item);
            });

            spatialAudioGroup.add(this._spatialAudioSceneDropdown);

            this._immersiveSoundSwitch.bind_property('active',
                this._spatialAudioSceneDropdown, 'visible',
                GObject.BindingFlags.SYNC_CREATE);
        }
    }

    _addMiscSetting() {
        let miscGroup;
        if (this._modelData.ring || this._modelData.dualConnection ||
                this._modelData.autoAnswer || this._modelData.adaptiveSound ||
                this._modelData.lowLatencyMode) {
            miscGroup = new Adw.PreferencesGroup({title: _('Additional Settings')});
            this._page.add(miscGroup);
        }

        if (this._modelData.dualConnection) {
            this._dualConnSwitch = new Adw.SwitchRow({
                title: localizedLabel(pgettext('Redmi connection setting',
                    'Allow Connections to Multiple Devices'),
                'Allow Connections to Multiple Devices'),
            });

            this._dualConnSwitch.active = this._devInfo.getValue('dual-conn');

            this._dualConnSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('dual-conn', this._dualConnSwitch.active);
            });

            miscGroup.add(this._dualConnSwitch);
        }

        if (this._modelData.autoAnswer) {
            this._autoAwnswerSwitch = new Adw.SwitchRow({
                title: _('Answer Calls Automatically'),
                subtitle: _('Answer calls when the earbuds are worn'),
            });

            this._autoAwnswerSwitch.active = this._devInfo.getValue('auto-answer');

            this._autoAwnswerSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('auto-answer', this._autoAwnswerSwitch.active);
            });

            miscGroup.add(this._autoAwnswerSwitch);
        }

        if (this._modelData.adaptiveSound) {
            this._adaptiveSoundSwitch = new Adw.SwitchRow({
                title: _('Adaptive Sound'),
                subtitle: _('Automatically adjust sound to your ear shape'),
            });

            this._adaptiveSoundSwitch.active = this._devInfo.getValue('adapt-sound');

            this._adaptiveSoundSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('adapt-sound', this._adaptiveSoundSwitch.active);
            });

            miscGroup.add(this._adaptiveSoundSwitch);
        }

        if (this._modelData.lowLatencyMode) {
            this._lowLatencySwitch = new Adw.SwitchRow({
                title: _('Game Mode'),
                subtitle: _('Reduces latency and enhances in-game audio'),
            });

            this._lowLatencySwitch.active = this._devInfo.getValue('low-latency');

            this._lowLatencySwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('low-latency', this._lowLatencySwitch.active);
            });

            miscGroup.add(this._lowLatencySwitch);
        }

        if (this._modelData.ring) {
            this._ringBudsRow = new RingMyBudsRow({dual: true});
            this._ringBudsRow.compact_mode = this._isCompactMode;

            this._ringBudsRow.connect('notify::status', () => {
                this._devInfo.updateDevice('ring-state', this._ringBudsRow.status);
            });

            this._ringBudsRow.connect('notify::status-left', () => {
                this._devInfo.updateDevice('ring-state-left', this._ringBudsRow.statusLeft);
            });

            miscGroup.add(this._ringBudsRow);
        }
    }

    _buildNoiseControlRow(title, initialValue) {
        const items = [
            {name: _('Off'), icon: 'bbm-anc-off-symbolic'},
            {
                name: localizedLabel(pgettext('Redmi listening mode', 'Ambient'), 'Ambient'),
                icon: 'bbm-transperancy-symbolic',
            },
            {name: _('Noise Cancellation'), icon: 'bbm-anc-on-symbolic'},
        ];

        const checkBoxWidget = new CheckBoxesRowWidget({
            rowTitle: _('Noise Control Cycle: ') + title,
            items,
            applyBtnName: _('Apply'),
            initialValue,
            minRequired: 2,
        });

        checkBoxWidget.compact_mode = this._isCompactMode;
        this.checkBoxWidgets.push(checkBoxWidget);

        return checkBoxWidget;
    }

    _addGestureControls() {
        const gc = this._modelData.gestureOptions;
        if (!gc)
            return;

        this._gestureRows = {};
        this._noiseControlRows = {};

        const GESTURE_DISPLAY = {
            'single-tap': _('Single Tap'),
            'double-tap': _('Double Tap'),
            'triple-tap': _('Triple Tap'),
            'action-hold-tap': _('Tap and Hold'),

            'single-press': _('Single Press'),
            'double-press': _('Double Press'),
            'triple-press': _('Triple Press'),
            'action-hold-press': _('Press and Hold'),

            'single-pinch': _('Single Pinch'),
            'double-pinch': _('Double Pinch'),
            'triple-pinch': _('Triple Pinch'),
            'action-hold-pinch': _('Pinch and Hold'),

            'swipe-swipe': _('Swipe'),
        };

        const leftGroup = new Adw.PreferencesGroup({
            title: _('Left Buds Gesture Control'),
        });

        const rightGroup = new Adw.PreferencesGroup({
            title: _('Right Buds Gesture Control'),
        });

        this._page.add(leftGroup);
        this._page.add(rightGroup);

        const createGestureWidget = (gestureKey, gestureConfig, side) => {
            const actions = gestureConfig.actions;
            const title = GESTURE_DISPLAY[`${gestureKey}-${gestureConfig.type}`] ?? gestureKey;
            const options = Object.keys(actions).map(action => this._readableAction(_, action));
            const values = Object.values(actions);
            const settingKey = `${gestureKey}-${side}`;
            const initialValue = this._devInfo.getValue(settingKey) ?? values[0];

            const dropdown = new DropDownRowWidget({
                title,
                options,
                values,
                initialValue,
            });

            this._gestureRows[settingKey] = dropdown;
            let ncRow = null;

            if (gc.noiseControlModes && Object.hasOwn(actions, 'noise-control')) {
                const ncSettingKey = side === 'left' ? 'left-longpress' : 'right-longpress';
                ncRow = this._buildNoiseControlRow(title, this._devInfo.getValue(ncSettingKey));
                const ncValue = actions['noise-control'];
                this._noiseControlRows[ncSettingKey] = {ncRow, dropdown, ncValue};
                ncRow.visible = dropdown.selected_item === ncValue;
                ncRow.connect('notify::toggled-value', () => {
                    this._devInfo.updateDevice(ncSettingKey, ncRow.toggled_value);
                });
            }

            dropdown.connect('notify::selected-item', () => {
                const value = dropdown.selected_item;
                this._devInfo.updateDevice(settingKey, value);
                if (ncRow)
                    ncRow.visible = value === actions['noise-control'];
            });

            return {dropdown, ncRow};
        };

        for (const [gestureKey, gestureConfig] of Object.entries(gc.gestures)) {
            const leftWidgets =
            createGestureWidget(gestureKey, gestureConfig, 'left');

            leftGroup.add(leftWidgets.dropdown);

            if (leftWidgets.ncRow)
                leftGroup.add(leftWidgets.ncRow);

            const rightWidgets =
            createGestureWidget(gestureKey, gestureConfig, 'right');

            rightGroup.add(rightWidgets.dropdown);

            if (rightWidgets.ncRow)
                rightGroup.add(rightWidgets.ncRow);
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

            case 'noise-control':
                return _('Noise Control');

            case 'no-action':
                return _('No Action');

            case 'change-volume':
                return _('Change Volume');

            case 'game-mode':
                return _('Toggle Low Latency');

            case 'take-photo':
                return _('Take Photo');

            default:
                return action;
        }
    }

    _updateCompactStatus() {
        for (const widget of this.checkBoxWidgets)
            widget.set_property('compact-mode', this._isCompactMode);

        this._ringBudsRow?.set_property('compact-mode', this._isCompactMode);
    }
});
