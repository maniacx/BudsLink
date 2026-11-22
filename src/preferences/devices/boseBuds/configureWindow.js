'use strict';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {
    supportedAudioSingleIcons, supportedAudioDualIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';
import {RadioButtonRowWidget} from './../../widgets/radioButtonRowWidget.js';
import {EqualizerWidget} from './../../widgets/equalizerWidget.js';
import {DeviceManagementRow} from './../../widgets/deviceMgmtRowWidget.js';
import {ModesGroupWidget} from './modesGroupWidget.js';
import {VoicePrompt} from '../../../lib/devices/boseBuds/boseBudsConfig.js';

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_BoseBudsConfigureWindow',
}, class ConfigureWindow extends Adw.Window {
    constructor(devInfo, modelData) {
        super({
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

        this.title = this._devInfo.getValue('alias');

        this._toastOverlay = new Adw.ToastOverlay();
        const toolViewBar = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        this._page = new Adw.PreferencesPage();
        this._toastOverlay.set_child(toolViewBar);
        toolViewBar.add_top_bar(headerBar);
        toolViewBar.set_content(this._page);
        this.set_content(this._toastOverlay);

        const iconList = this._modelData.batterySingle ? supportedAudioSingleIcons
            : supportedAudioDualIcons;

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

        this._addAudioModes();
        this._addSoundSettings();
        this._addCallsSetting();
        this._addInEarSettings();
        this._addVoicePrompt();
        this._addConnectionManagement();
        this._addMiscSetting();
        this._addGestureControls();

        this._devInfoSignalId = this._devInfo.connect('update-ui', (info, feature) => {
            const value = info.getValue(feature);

            switch (feature) {
                case 'alias':
                    this.title = value;
                    break;

                case 'modes':
                case 'current-mode':
                    if (this._audioModesGrp) {
                        this._audioModesGrp.updateParams(info.getValue('modes'),
                            info.getValue('current-mode'));
                    }
                    break;

                case 'restore-mode':
                    if (this._restoreModeSwitch)
                        this._restoreModeSwitch.active = value;
                    break;

                case 'eq-preset':
                    if (this._eqPresetDropdown)
                        this._eqPresetDropdown.selected_item = value;
                    break;

                case 'eq-custom':
                    if (this._eq) {
                        const eqCustom = value.toSorted((a, b) => a.band - b.band);
                        this._eq.setValues(eqCustom.map(item => item.current));
                    }
                    break;

                case 'in-ear':
                    if (this._inEarSettingsSwitch)
                        this._inEarSettingsSwitch.active = value;
                    break;

                case 'auto-pause':
                    if (this._autoPauseSwitch)
                        this._autoPauseSwitch.active = value;
                    break;

                case 'auto-answer':
                    if (this._autoAnswerSwitch)
                        this._autoAnswerSwitch.active = value;
                    break;

                case 'auto-transp':
                    if (this._autoTransparencySwitch)
                        this._autoTransparencySwitch.active = value;
                    break;

                case 'side-tone':
                    if (this._sideToneDropdown)
                        this._sideToneDropdown.selected_item = value;
                    break;

                case 'multipoint':
                    if (this._dualConnSwitch)
                        this._dualConnSwitch.active = value;
                    break;

                case 'pairing-mode':
                    if (this._dualConnSwitch)
                        this._dualConnSwitch.pair_mode = value;
                    break;

                case 'dev-mgmt':
                    if (this._dualConnSwitch)
                        this._dualConnSwitch.updateDevices(value);
                    break;

                case 'active-dev':
                    if (this._dualConnSwitch)
                        this._dualConnSwitch.updateRouteDevice(value);
                    break;

                case 'own-dev':
                    if (this._dualConnSwitch)
                        this._dualConnSwitch.updateOwnDevice(value);
                    break;

                case 'auto-power':
                    if (this._autoPowerOffDropdown)
                        this._autoPowerOffDropdown.selected_item = value;
                    break;

                case 'voice-enabled':
                    if (this._voicePromptSwitch) {
                        this._voicePromptSwitch.active = value;
                        this._updateVoicePromptSensitivity();
                    }
                    break;

                case 'voice-prompt':
                    if (this._voicePrompDropdown)
                        this._voicePrompDropdown.selected_item = value;
                    break;

                case 'supported-voice':
                    if (this._voicePrompDropdown)
                        this._updateVoicePromptList();
                    break;

                case 'vobat-en':
                    if (this._battVoiceSwitch)
                        this._battVoiceSwitch.active = value;
                    break;

                case 'vobat-sup':
                    if (this._battVoiceSwitch)
                        this._battVoiceSwitch.visible = value;
                    break;

                case 'gestures': {
                    const gestures = value ?? [];

                    for (const row of this._gestureRows) {
                        const slot = gestures.find(g =>
                            g.id === row.buttonId && g.gesture === row.gestureByte);

                        if (slot)
                            row.dropdown.selected_item = slot.action;
                    }
                    break;
                }
            }
        });

        this.connect('close-request', () => {
            this._eq?.destroy();
            this._eq = null;

            this._audioModesGrp?.destroy();
            this._audioModesGrp = null;

            return false;
        });
    }

    showToast(message) {
        this._toastOverlay.dismiss_all();
        this._toastOverlay.add_toast(new Adw.Toast({title: message, timeout: 2}));
    }

    _addAudioModes() {
        if (!this._modelData.audioModes)
            return;

        const curretMode = this._devInfo.getValue('current-mode');
        const modes = this._devInfo.getValue('modes');
        const alias = this._devInfo.getValue('alias');
        this._audioModesGrp = new ModesGroupWidget(this, this._modelData,
            modes, curretMode, alias);

        this._audioModesGrp.connect('current-mode-changed', (_w, mode) => {
            this._devInfo.updateDevice('current-mode', mode);
        });

        this._audioModesGrp.connect('modes-changed', (_o, modes) => {
            this._devInfo.updateDevice('modes', modes);
        });

        this._page.add(this._audioModesGrp);

        const restoreModeGrp = new Adw.PreferencesGroup();
        this._restoreModeSwitch = new Adw.SwitchRow({title: _('Remember my mode')});
        this._restoreModeSwitch.active = this._devInfo.getValue('restore-mode');
        this._restoreModeSwitch.connect('notify::active', () => {
            this._devInfo.updateDevice('restore-mode', this._restoreModeSwitch.active);
        });

        restoreModeGrp.add(this._restoreModeSwitch);
        this._page.add(restoreModeGrp);
    }

    _addSoundSettings() {
        if (!this._modelData.eq)
            return;

        const eqGroup = new Adw.PreferencesGroup({title: _('Sound Settings')});
        this._page.add(eqGroup);

        if (this._modelData.eq) {
            const presetOptions = [];
            const presetValues = [];

            const getPresetLabel = name => {
                const labels = {
                    flat: _('Flat'),
                    bassBoost: _('Bass Boost'),
                    bassReducer: _('Bass Reducer'),
                    trebleBoost: _('Treble Boost'),
                    trebleReducer: _('Treble Reducer'),
                };

                return labels[name] ?? name;
            };

            for (const presetName of Object.keys(this._modelData.eq.presets)) {
                presetOptions.push(getPresetLabel(presetName));
                presetValues.push(presetName);
            }

            let customEqButton = {};
            if (this._modelData.eq?.custom) {
                presetOptions.push(_('Custom'));
                presetValues.push('custom');

                customEqButton =  {
                    hasButton: true,
                    buttonIcon: 'bbm-eq-symbolic',
                    buttonTooltip: _('Custom Equalizer'),
                    buttonVisibleFor: ['custom'],
                };
            }

            this._eqPresetDropdown = new DropDownRowWidget({
                title: _('Equalizer Preset'),
                subtitle: _('Change the sound signature'),
                options: presetOptions,
                values: presetValues,
                initialValue: this._devInfo.getValue('eq-preset'),
                ...customEqButton,
            });

            eqGroup.add(this._eqPresetDropdown);

            const freqLabels = {
                bass: _('Bass'),
                mid: _('Mid'),
                treble: _('Treble'),
            };

            const freqs = this._modelData.eq.bands.map(
                freq => freqLabels[freq] ?? `${freq}`
            );

            const range = this._modelData.eq.range;

            const eqCustom = this._devInfo.getValue('eq-custom')
                    .toSorted((a, b) => a.band - b.band);

            const initialValues = eqCustom.map(item => item.current);

            this._eq = new EqualizerWidget({
                freqs,
                initialValues,
                range,
                topBarTitle: _('Band'),
                bottomBarTitle: _('Gain (dB)'),
            });

            this._eq.connect('eq-changed', (_w, arr) => {
                this._eqPresetDropdown.selected_item = 'custom';
                this._devInfo.updateDevice('eq-custom', arr);
            });

            this._eqPresetDropdown.connect('notify::selected-item', () => {
                const preset = this._eqPresetDropdown.selected_item;
                this._devInfo.updateDevice('eq-preset', preset);
                if (preset === 'custom')
                    return;

                const eqValues = this._modelData.eq?.presets?.[preset];
                if (eqValues) {
                    this._devInfo.updateDevice('eq-custom', eqValues);
                    this._eq.setValues(eqValues);
                }
            });

            this._eqPresetDropdown.connect('button-clicked', () => {
                this._eq.present(this);
            });
        }
    }

    _addInEarSettings() {
        if (!this._modelData.inEarSettings && !this._modelData.autoAnswer &&
                !this._modelData.autoPause)
            return;

        const groupTitle = this._modelData.type === 'earbuds' ? _('In Ear Settings')
            : _('On Head Settings');

        const inEarGroup = new Adw.PreferencesGroup({title: groupTitle});
        this._page.add(inEarGroup);

        if (this._modelData.inEarSettings) {
            this._inEarDetectionSwitch = new Adw.SwitchRow({
                title: this._modelData.earbuds ? _('In-Ear Detection') : _('On Head Detection'),
                subtitle: _('Enable features based on wearing detection'),
            });
            this._inEarSettingsSwitch.active = this._devInfo.getValue('in-ear');
            this._inEarSettingsSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('in-ear', this._inEarSettingsSwitch.active);
                this._updateInEarSensitivity();
            });

            inEarGroup.add(this._inEarSettingsSwitch);
        }

        if (this._modelData.autoPause) {
            this._autoPauseSwitch = new Adw.SwitchRow({
                title: _('Pause Media When Not Worn'),
                subtitle: _('Playback controlled by the OEM app'),
            });
            this._autoPauseSwitch.active = this._devInfo.getValue('auto-pause');
            this._autoPauseSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('auto-pause', this._autoPauseSwitch.active);
            });

            inEarGroup.add(this._autoPauseSwitch);
        }

        if (this._modelData.autoAnswer) {
            this._autoAnswerSwitch = new Adw.SwitchRow({
                title: _('Answer Calls Automatically'),
                subtitle: _('Answer calls when the earbuds are worn'),
            });
            this._autoAnswerSwitch.active = this._devInfo.getValue('auto-answer');
            this._autoAnswerSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('auto-answer', this._autoAnswerSwitch.active);
            });

            inEarGroup.add(this._autoAnswerSwitch);
        }

        if (this._modelData.autoTransparency) {
            this._autoTransparencySwitch =  new Adw.SwitchRow({
                title: _('Automatic Transparency Mode'),
                subtitle: _('Switch to Transparency mode when an earbud is removed'),
            });

            this._autoTransparencySwitch.active = this._devInfo.getValue('auto-transp');
            this._autoTransparencySwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('auto-transp', this._autoTransparencySwitch.active);
            });

            inEarGroup.add(this._autoTransparencySwitch);
        }

        if (this._modelData.inEarSettings) {
            const inEarSettingsGroup = new Adw.PreferencesGroup({
                title: _('Playback Behavior'),
                description: _('Playback controlled by the BudsLink'),
            });

            const inEarOptions = this._modelData.type === 'earbuds' ? [
                _('Default behavior'),
                _('Resume with both earbuds, Pause if any removed'),
                _('Resume with any earbud, Pause if both removed'),
            ] : [
                _('Default behavior'),
                _('Resume when worn'),
            ];

            const inEarTitle = this._modelData.type === 'earbuds'
                ? _('Choose Playback Behavior for In-Ear Detection')
                : _('Choose Playback Behavior for On-Head Detection');

            this._inEarDropdown = new RadioButtonRowWidget({
                title: inEarTitle,
                subtitle: _('Automatically pause or resume playback ' +
                    'based on wearing detection.'),
                options: inEarOptions,
                initialValue: this._devInfo.getValue('wear-detection-mode'),
            });

            this._inEarDropdown.connect('notify::toggled-value', () => {
                this._devInfo.updateDevice('wear-detection-mode',
                    this._inEarDropdown.toggled_value);
            });

            inEarSettingsGroup.add(this._inEarDropdown);

            this._page.add(inEarSettingsGroup);
        }

        this._updateInEarSensitivity();
    }

    _updateInEarSensitivity() {
        if (!this._inEarSettingsSwitch)
            return;

        const sensitive = this._inEarSettingsSwitch?.active ?? true;

        this._autoPauseSwitch?.set_sensitive(sensitive);
        this._autoAnswerSwitch?.set_sensitive(sensitive);
        this._autoTransparencySwitch?.set_sensitive(sensitive);
        this._inEarDropdown?.set_sensitive(sensitive);
    }

    _addCallsSetting() {
        const st = this._modelData.sideTone;
        if (!st)
            return;

        const callGroup = new Adw.PreferencesGroup({title: _('Calls Settings')});
        this._page.add(callGroup);

        const sideToneLabelsMap = {
            [st.off]: _('Off'),
            [st.low]: _('Low'),
            [st.mid]: _('Medium'),
            [st.high]: _('High'),
        };

        const values = Object.values(st);
        const options = values.map(value => sideToneLabelsMap[value]);

        this._sideToneDropdown = new DropDownRowWidget({
            title: _('Ambient Sound During Calls'),
            subtitle: _('Adjust your voice feedback level'),
            options,
            values,
            initialValue: this._devInfo.getValue('side-tone'),
        });

        this._sideToneDropdown.connect('notify::selected-item', () => {
            this._devInfo.updateDevice('side-tone', this._sideToneDropdown.selected_item);
        });

        callGroup.add(this._sideToneDropdown);
    }

    _addConnectionManagement() {
        if (!this._modelData.dualConnection)
            return;

        const devMgmtGroup = new Adw.PreferencesGroup({title: _('Connection Management')});
        this._page.add(devMgmtGroup);

        if (this._modelData.dualConnection) {
            const deviceManagementConfig = {
                maxConnected: this._modelData.maxConnected ?? 2,
                hasMultipointSwitch: true,
                hasPairMode: true,
                hasRoutingIndicator: true,
                hasRoutingControl: true,
                hasActiveFix: false,
                showMac: true,
                refreshOnWindowOpen: true,
            };
            const deviceMgmtInfo = this._devInfo.getValue('dev-mgmt');
            const currentActiveRoute = this._devInfo.getValue('active-dev');
            const ownDevice = this._devInfo.getValue('own-dev');

            this._dualConnSwitch = new DeviceManagementRow(this, deviceMgmtInfo,
                ownDevice, currentActiveRoute, deviceManagementConfig);

            this._dualConnSwitch.active = this._devInfo.getValue('multipoint');
            this._dualConnSwitch.pair_mode = this._devInfo.getValue('pairing-mode');

            this._dualConnSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('multipoint', this._dualConnSwitch.active);
            });

            this._dualConnSwitch.connect('notify::pair-mode', () => {
                this._devInfo.updateDevice('pairing-mode', this._dualConnSwitch.pair_mode);
            });

            this._dualConnSwitch.connect('device-action', (_row, action, id) => {
                const data = {action, id};
                this._devInfo.updateDevice('dev-mgmt-action', data);
            });

            devMgmtGroup.add(this._dualConnSwitch);
        }
    }

    _addMiscSetting() {
        if (!this._modelData.automaticPowerOffTimer)
            return;

        const miscGroup = new Adw.PreferencesGroup({title: _('Additional Settings')});
        this._page.add(miscGroup);

        if (this._modelData.automaticPowerOffTimer) {
            const autoPowerOffLabelsMap = {
                0: _('Never'),
                5: _('After 5 minutes'),
                20: _('After 20 minutes'),
                40: _('After 40 minutes'),
                60: _('After 1 hour'),
                180: _('After 3 hours'),
            };

            const autoPowerOffLabels = this._modelData.automaticPowerOffTimer.map(minutes => {
                return autoPowerOffLabelsMap[minutes] ?? String(minutes);
            });

            this._autoPowerOffDropdown = new DropDownRowWidget({
                title: _('Automatic Power Off Duration'),
                subtitle: _('Automatically power off when not worn'),
                options: autoPowerOffLabels,
                values: this._modelData.automaticPowerOffTimer,
                initialValue: this._devInfo.getValue('auto-power'),
            });

            this._autoPowerOffDropdown.connect('notify::selected-item', () => {
                const selectedVal = this._autoPowerOffDropdown.selected_item;
                this._devInfo.updateDevice('auto-power', selectedVal);
            });
            miscGroup.add(this._autoPowerOffDropdown);
        }
    }

    _addVoicePrompt() {
        if (!this._modelData.voicePrompt)
            return;

        if (!this._promptGroup) {
            this._promptGroup = new Adw.PreferencesGroup({
                title: _('Voice Prompt Settings'),
                visible: false,
            });
            this._page.add(this._promptGroup);
        }

        this._voicePromptSwitch = new Adw.SwitchRow({
            title: _('Voice Prompts'),
            subtitle: _('Enable voice prompts for guidance and status updates'),
        });
        this._voicePromptSwitch.active = this._devInfo.getValue('voice-enabled');

        this._voicePromptSwitch.connect('notify::active', () => {
            this._devInfo.updateDevice('voice-enabled', this._voicePromptSwitch.active);
            this._updateVoicePromptSensitivity();
        });

        this._promptGroup.add(this._voicePromptSwitch);

        const voicePromptConfig = this._updateVoicePromptList();

        this._voicePrompDropdown = new DropDownRowWidget({
            title: _('Prompt Language'),
            subtitle: _('Select the language for voice prompts'),
            options: voicePromptConfig.voicePromptLabels,
            values: voicePromptConfig.voicePromptValues,
            initialValue: this._devInfo.getValue('voice-prompt'),
        });

        this._voicePrompDropdown.connect('notify::selected-item', () => {
            const selectedVal = this._voicePrompDropdown.selected_item;
            this._devInfo.updateDevice('voice-prompt', selectedVal);
        });
        this._promptGroup.add(this._voicePrompDropdown);

        this._battVoiceSwitch = new Adw.SwitchRow({
            title: _('Announce Battery Level at Startup'),
            subtitle: _('Announce the battery level when powered on'),
            visible: this._devInfo.getValue('vobat-sup'),
        });

        this._battVoiceSwitch.active = this._devInfo.getValue('vobat-en');

        this._battVoiceSwitch.connect('notify::active', () => {
            this._devInfo.updateDevice('vobat-en', this._battVoiceSwitch.active);
        });

        this._promptGroup.add(this._battVoiceSwitch);

        this._promptGroup.visible = true;
    }

    _updateVoicePromptList() {
        const supportedVoice = this._devInfo.getValue('supported-voice');

        const voicePromptValues = [];

        for (let i = 0; i < 32; i++) {
            if (supportedVoice & 1 << i)
                voicePromptValues.push(i);
        }

        const voicePromptLabels = voicePromptValues.map(value =>
            VoicePrompt[value] ?? String(value)
        );

        this._voicePrompDropdown?.updateList(voicePromptLabels, voicePromptValues);
        return {voicePromptLabels, voicePromptValues};
    }

    _updateVoicePromptSensitivity() {
        const enabled = this._voicePromptSwitch?.active;

        if (this._voicePrompDropdown)
            this._voicePrompDropdown.sensitive = enabled;

        if (this._battVoiceSwitch)
            this._battVoiceSwitch.sensitive = enabled;
    }

    _addGestureControls() {
        const gc = this._modelData.gestureOptions;
        if (!gc)
            return;

        this._gestureRows = [];
        const GESTURE_DISPLAY = {
            'single-tap': _('Single Tap'),
            'double-tap': _('Double Tap'),
            'triple-tap': _('Triple Tap'),
            'action-hold-tap': _('Touch and Hold'),
            'double-action-hold-tap': _('Double Tap and Hold'),

            'single-press': _('Single Press'),
            'double-press': _('Double Press'),
            'triple-press': _('Triple Press'),
            'action-hold-press': _('Press and Hold'),
            'double-action-hold-press': _('Double Press and Hold'),

            'single-pinch': _('Single Pinch'),
            'double-pinch': _('Double Pinch'),
            'triple-pinch': _('Triple Pinch'),
            'action-hold-pinch': _('Pinch and Hold'),
            'double-action-hold-pinch': _('Double Pinch and Hold'),
        };

        const allSlots = this._devInfo.getValue('gestures') ?? [];

        for (const [groupKey, button] of Object.entries(gc.buttons)) {
            const group = new Adw.PreferencesGroup({
                title: this._getGroupTitle(groupKey),
            });

            for (const [gestureKey, gesture] of Object.entries(button.gestures)) {
                const actions = Object.keys(gesture.actions);
                const values = Object.values(gesture.actions);
                const options = actions.map(a => this._readableAction(a));

                const displayKey = `${gestureKey}-${gesture.type}`;
                const title = GESTURE_DISPLAY[displayKey] ?? gestureKey;

                const savedSlot = allSlots.find(g =>
                    g.id === button.id && g.gesture === gesture.byte);

                const dropdown = new DropDownRowWidget({
                    title,
                    options,
                    values,
                    initialValue: savedSlot?.action ?? values[0],
                });

                this._gestureRows.push({
                    buttonId: button.id,
                    gestureByte: gesture.byte,
                    dropdown,
                });

                dropdown.connect('notify::selected-item', () => {
                    const action = dropdown.selected_item;

                    const index = allSlots.findIndex(g =>
                        g.id === button.id && g.gesture === gesture.byte);

                    if (index === -1) {
                        allSlots.push({
                            id: button.id,
                            gesture: gesture.byte,
                            action,
                        });
                    } else {
                        allSlots[index].action = action;
                    }

                    this._devInfo.updateDevice('gestures', allSlots);
                });

                group.add(dropdown);
            }

            this._page.add(group);
        }
    }

    _getGroupTitle(group) {
        switch (group) {
            case 'single':
                return _('Gesture Controls');

            case 'left':
                return _('Left Buds Gesture Control');

            case 'right':
                return _('Right Buds Gesture Control');

            default:
                return _('Gesture Controls');
        }
    }

    _readableAction(action) {
        switch (action) {
            case 'no-action':
                return _('No Action');

            case 'mode':
                return _('Cycle Through Modes');

            case 'spatial':
                return _('Spatial Audio');

            case 'switch-device':
                return _('Switch Devices');

            case 'spotify-go':
                return _('Spotify');

            case 'voice-assistant':
                return _('Voice Assistant');

            case 'not-configured':
                return _('Not Configured');

            case 'vpa':
                return _('Voice Assistant');

            case 'anc':
                return _('Noise Control');

            case 'battery-level':
                return _('Hear Battery Level');

            case 'play-pause':
                return _('Play / Pause');

            case 'increase-cnc':
                return _('Increase Noise Cancellation');

            case 'decrease-cnc':
                return _('Decrease Noise Cancellation');

            case 'toggle-wake-word':
                return _('Toggle Wake Word');

            case 'conversation-mode':
                return _('Conversation Mode');

            case 'skip-back':
                return _('Previous Track');

            case 'skip-forward':
                return _('Next Track');

            case 'fetch-notifications':
                return _('Hear Notifications');

            case 'wind-mode':
                return _('Wind Mode');

            case 'client-interaction':
                return _('Client Interaction');

            case 'line-in-switch':
                return _('Audio Line-In');

            case 'linking':
                return _('Speaker Link');

            case 'disabled':
                return _('Disabled');

            default:
                return action;
        }
    }

    _updateCompactStatus() {

    }
});
