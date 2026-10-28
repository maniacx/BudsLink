'use strict';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'gettext';

import {
    supportedAudioSingleIcons, supportedAudioDualIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {LongPressBits} from '../../../lib/devices/airpods/airpodsConfig.js';
import {CheckBoxesRowWidget} from './../../widgets/checkBoxesRowWidget.js';
import {RadioButtonRowWidget} from './../../widgets/radioButtonRowWidget.js';
import {SliderRowWidget} from './../../widgets/sliderRowWidget.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';

export const  ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_AirpodsConfigureWindow',
}, class ConfigureWindow extends Adw.Window {
    _init(devInfo, modelData) {
        super._init({
            default_width: 650,
            default_height: 650,
            width_request: 320,
            height_request: 100,
        });

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

        this.title = devInfo.getValue('alias');

        const toolViewBar = new Adw.ToolbarView();

        const headerBar = new Adw.HeaderBar();

        const page = new Adw.PreferencesPage();

        toolViewBar.add_top_bar(headerBar);
        toolViewBar.set_content(page);
        this.set_content(toolViewBar);

        const iconList = modelData.batteryType === 1 ? supportedAudioSingleIcons
            : supportedAudioDualIcons;

        let caseIconList = [];
        let initialCaseIcon = '';
        if (modelData.batteryType === 3) {
            caseIconList = supportedCaseIcons;
            initialCaseIcon = devInfo.getValue('case');
        }

        const iconSelector = new IconSelectorWidget({
            iconList,
            initialIcon: devInfo.getValue('icon'),
            caseIconList,
            initialCaseIcon,
            mac: devInfo.mac,
        });

        iconSelector.connect('notify::selected-icon', () => {
            devInfo.updateDevice('icon', iconSelector.selected_icon);
        });

        if (modelData.batteryType === 3) {
            iconSelector.connect('notify::selected-case-icon', () => {
                devInfo.updateDevice('case', iconSelector.selected_case_icon);
            });
        }

        page.add(iconSelector);

        const inEarSettingsGroup = new Adw.PreferencesGroup({
            title: _('Playback Behavior'),
        });

        const inEarOptions = modelData.batteryType === 1 ? [
            _('Default behavior'),
            _('Resume when worn'),
        ] : [
            _('Default behavior'),
            _('Resume with both earbuds, Pause if any removed'),
            _('Resume with any earbud, Pause if both removed'),
        ];

        this._inEarDropdown = new RadioButtonRowWidget({
            title: _('Choose Playback Behavior for In-Ear Detection'),
            subtitle: _('Automatically pause or resume playback ' +
                'based on wearing detection.'),
            options: inEarOptions,
            initialValue: devInfo.getValue('wear-detection-mode'),
        });

        this._inEarDropdown.connect('notify::toggled-value', () => {
            devInfo.updateDevice('wear-detection-mode', this._inEarDropdown.toggled_value);
        });

        inEarSettingsGroup.add(this._inEarDropdown);

        page.add(inEarSettingsGroup);

        if (modelData.awarenessSupported) {
            const awarnessVolumeGroup = new Adw.PreferencesGroup({
                title: _('Volume Level'),
            });

            this._awarenessSwitchRow = new Adw.SwitchRow({
                title: _('Lower volume during conversation awareness'),
                subtitle: _('Automatically lower the volume when conversation awareness is active'),
            });

            this._awarenessSwitchRow.active = devInfo.getValue('ca-volume-enabled');
            this._awarenessSwitchRow.connect('notify::active', () => {
                devInfo.updateDevice('ca-volume-enabled', this._awarenessSwitchRow.active);
            });
            awarnessVolumeGroup.add(this._awarenessSwitchRow);

            this._adjustment = new Gtk.Adjustment({
                lower: 0,
                upper: 50,
                step_increment: 1,
                page_increment: 10,
                value: devInfo.getValue('ca-volume'),
            });

            const awarnessVolumeRow = new Adw.SpinRow({
                title: _('Conversation awareness volume limit'),
                subtitle: _('Limits media volume to this percentage during conversation.' +
            ' Note: No change if current volume is below this level.'),
                adjustment: this._adjustment,
                numeric: true,
            });

            awarnessVolumeRow.connect('notify::value', () => {
                devInfo.updateDevice('ca-volume', awarnessVolumeRow.value);
            });
            awarnessVolumeGroup.add(awarnessVolumeRow);

            this._awarenessSwitchRow.bind_property(
                'active',
                awarnessVolumeRow,
                'sensitive',
                GObject.BindingFlags.SYNC_CREATE
            );

            page.add(awarnessVolumeGroup);
        }

        if (modelData.enableTurnOffListeningMode) {
            const listeningModeGrp = new Adw.PreferencesGroup({
                title: _('Turn off listening modes'),
            });

            this._listeningModeRow = new Adw.SwitchRow({
                title: _('Allows to turn off all listening mode technology'),
                subtitle: _('Allows Noise Cancellation, Transparency, ' +
                    'and Adaptive modes to be fully disabled. ' +
                    'Disabling listening modes also turns off Hearing Aid features ' +
                    'and reduces power usage.'),
            });

            this._currentListeningMode = devInfo.getValue('listening-mode');
            this._listeningModeRow.active = this._currentListeningMode;
            this._listeningModeRow.connect('notify::active', () => {
                const mode = this._listeningModeRow.active;
                devInfo.updateDevice('listening-mode', mode);
                if (this._currentListeningMode !== mode) {
                    this._currentListeningMode = mode;
                    if (modelData.longPressCycleSupported) {
                        this._buildLongPressItems();
                        this._longPressCycleWidget?.updateItems(this._longPressItems);
                    }
                }
            });

            listeningModeGrp.add(this._listeningModeRow);
            page.add(listeningModeGrp);
        }

        if (modelData.longPressCycleSupported) {
            this._buildLongPressItems = () => {
                const items = [];

                const allowOff = !modelData.enableTurnOffListeningMode ||
                    modelData.enableTurnOffListeningMode && this._currentListeningMode;

                if (allowOff) {
                    items.push({
                        mode: 'off',
                        name: _('Off'),
                        icon: 'bbm-anc-off-symbolic',
                    });
                }

                items.push({
                    mode: 'transparency',
                    name: _('Transparency'),
                    icon: 'bbm-transperancy-symbolic',
                });

                items.push({
                    mode: 'anc',
                    name: _('Noise Cancellation'),
                    icon: 'bbm-anc-on-symbolic',
                });

                if (modelData.adaptiveSupported) {
                    items.push({
                        mode: 'adaptive',
                        name: _('Adaptive'),
                        icon: 'bbm-adaptive-symbolic',
                    });
                }
                this._longPressItems = items;
            };

            this._buildLongPressItems();

            const longPressCycleGrp = new Adw.PreferencesGroup({title: _('Press and Hold Cycle')});

            this._longPressCycleWidget = new CheckBoxesRowWidget({
                rowTitle: _('Press and hold cycles between'),
                rowSubtitle: _('Settings don’t reflect current state'),
                items: this._longPressItems,
                applyBtnName: _('Apply'),
                resetOnApply: true,
            });

            this._longPressCycleWidget.compact_mode = this._isCompactMode;

            this._longPressCycleWidget.connect('notify::toggled-value', () => {
                const toggled = this._longPressCycleWidget.toggled_value;
                let mask = 0;

                this._longPressItems.forEach((item, index) => {
                    if (toggled & 1 << index)
                        mask |= LongPressBits[item.mode];
                });

                devInfo.updateDevice('lp-value', mask);
            });

            longPressCycleGrp.add(this._longPressCycleWidget);

            page.add(longPressCycleGrp);
        }

        if (modelData.toneVolumeSupported) {
            const toneGroup = new Adw.PreferencesGroup({
                title: _('Notification Volume'),
            });

            this._toneWidget = new SliderRowWidget({
                rowTitle: _('Tone Volume'),
                rowSubtitle: _('Adjust the volume of audio cues'),
                marks: [
                    {mark: 0, label: _('15%')},
                    {mark: 77, label: _('100%')},
                    {mark: 100, label: _('125%')},
                ],
                initialValue: devInfo.getValue('noti-vol'),
            });

            this._toneWidget.compact_mode = this._isCompactMode;

            this._toneWidget.connect('notify::value', () => {
                devInfo.updateDevice('noti-vol', this._toneWidget.value);
            });

            toneGroup.add(this._toneWidget);
            page.add(toneGroup);
        }

        if (modelData.volumeSwipeSupported) {
            const volumeControlGroup = new Adw.PreferencesGroup({
                title: _('Volume Control'),
            });

            this._volumeSwipeSwitchRow = new Adw.SwitchRow({
                title: _('Volume Swipe'),
                subtitle: _('Enable or disable volume adjustment by swiping on earbud stems'),
            });

            this._volumeSwipeSwitchRow.active = devInfo.getValue('swipe-mode');
            this._volumeSwipeSwitchRow.connect('notify::active', () => {
                devInfo.updateDevice('swipe-mode', this._volumeSwipeSwitchRow.active);
            });
            volumeControlGroup.add(this._volumeSwipeSwitchRow);

            const volumeSwipeDurOptions = [_('Default'), _('Longer'), _('Longest')];
            const volumeSwipeDurValues = [0, 1, 2];

            this._volumeSwipeDurDropdown = new DropDownRowWidget({
                title: _('Swipe Duration'),
                subtitle: _('To prevent unintended adjustments,' +
                    'select the preferred wait time between swipes'),
                options: volumeSwipeDurOptions,
                values: volumeSwipeDurValues,
                initialValue: devInfo.getValue('swipe-len'),
            });

            this._volumeSwipeDurDropdown.connect('notify::selected-item', () => {
                devInfo.updateDevice('swipe-len', this._volumeSwipeDurDropdown.selected_item);
            });

            this._volumeSwipeSwitchRow.bind_property(
                'active',
                this._volumeSwipeDurDropdown,
                'sensitive',
                GObject.BindingFlags.SYNC_CREATE
            );

            volumeControlGroup.add(this._volumeSwipeDurDropdown);

            page.add(volumeControlGroup);
        }

        if (modelData.pressSpeedDurationSupported) {
            const pressHoldGroup = new Adw.PreferencesGroup({
                title: _('Stem and Crown Response'),
            });

            const speedOptions = [_('Default'), _('Longer'), _('Longest')];
            const speedValues = [0, 1, 2];

            this._pressSpeedDropdown = new DropDownRowWidget({
                title: _('Press Speed'),
                subtitle: _('Adjust how quickly you must double or ' +
                        'triple-press the stem or Digital Crown before an action occurs'),
                options: speedOptions,
                values: speedValues,
                initialValue: devInfo.getValue('press-speed'),
            });

            this._pressSpeedDropdown.connect('notify::selected-item', () => {
                devInfo.updateDevice('press-speed', this._pressSpeedDropdown.selected_item);
            });

            pressHoldGroup.add(this._pressSpeedDropdown);

            const durationOptions = [_('Default'), _('Shorter'), _('Shortest')];
            const durationValues = [0, 1, 2];
            this._pressDurationDropdown = new DropDownRowWidget({
                title: _('Press and Hold Duration'),
                subtitle: _('Set how long you need to press and hold before an action occurs'),
                options: durationOptions,
                values: durationValues,
                initialValue: devInfo.getValue('press-dur'),
            });

            this._pressDurationDropdown.connect('notify::selected-item', () => {
                devInfo.updateDevice('press-dur', this._pressDurationDropdown.selected_item);
            });

            pressHoldGroup.add(this._pressDurationDropdown);

            page.add(pressHoldGroup);
        }

        let devInfoSignalId = devInfo.connect('update-ui', (info, feature) => {
            const value = info.getValue(feature);

            switch (feature) {
                case 'alias':
                    this.title = value;
                    break;
                case 'wear-detection-mode':
                    if (this._inEarDropdown)
                        this._inEarDropdown.selected_item = value;
                    break;
                case 'ca-volume-enabled':
                    if (this._awarenessSwitchRow)
                        this._awarenessSwitchRow.active = value;
                    break;
                case 'ca-volume':
                    if (this._adjustment)
                        this._adjustment.value = value;
                    break;
                case 'listening-mode':
                    this._currentListeningMode = value;
                    this._buildLongPressItems();
                    this._longPressCycleWidget?.updateItems(this._longPressItems);

                    if (this._listeningModeRow)
                        this._listeningModeRow.active = value;
                    break;
                case 'noti-vol':
                    if (this._toneWidget)
                        this._toneWidget.value = value;
                    break;
                case 'swipe-mode':
                    if (this._volumeSwipeSwitchRow)
                        this._volumeSwipeSwitchRow.active = value;
                    break;
                case 'swipe-len':
                    if (this._volumeSwipeDurDropdown)
                        this._volumeSwipeDurDropdown.selected_item = value;
                    break;
                case 'press-speed':
                    if (this._pressSpeedDropdown)
                        this._pressSpeedDropdown.selected_item = value;
                    break;
                case 'press-dur':
                    if (this._pressDurationDropdown)
                        this._pressDurationDropdown.selected_item = value;
                    break;
            }
        });

        this.connect('close-request', () => {
            this._toneWidget?.destroy();
            this._toneWidget = null;

            if (devInfoSignalId && devInfo)
                devInfo.disconnect(devInfoSignalId);

            devInfoSignalId = null;
            devInfo = null;

            return false;
        });
    }

    _updateCompactStatus() {
        this._longPressCycleWidget?.set_property('compact-mode', this._isCompactMode);
        this._toneWidget?.set_property('compact-mode', this._isCompactMode);
    }
});

