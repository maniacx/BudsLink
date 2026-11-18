'use strict';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'gettext';

import {DropDownRowWidget} from '../../widgets/dropDownRowWidget.js';
import {EqualizerWidget} from '../../widgets/equalizerWidget.js';
import {IconSelectorWidget} from '../../widgets/iconSelectorWidget.js';
import {RingMyBudsRow} from '../../widgets/ringMyBudsRow.js';
import {SliderRowWidget} from '../../widgets/sliderRowWidget.js';
import {CheckBoxesRowWidget} from '../../widgets/checkBoxesRowWidget.js';
import {DeviceManagementRow} from '../../widgets/deviceMgmtRowWidget.js';
import {EarTipStatus, EarTipFitTestRow} from '../../widgets/earTipFitTestRow.js';
import {BtDeviceState, DeviceManagementAction} from '../../../lib/devices/commonEmuns.js';
import {
    supportedAudioDualIcons, supportedAudioSingleIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {
    buildPlaceholderGesturesHex, decodeGesturesHex, encodeGesturesHex
} from '../../../lib/devices/opoBuds/opoBudsConfig.js';

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_OpoBudsConfigureWindow',
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
        this._gestureSlotMap = {};

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

        this._addEq();
        this._addAudioEffects();
        this._addMiscSetting();
        this._addGestureControls();

        this._devInfoSignalId = this._devInfo.connect('update-ui', (info, feature) => {
            const value = info.getValue(feature);

            switch (feature) {
                case 'alias':
                    this.title = value;
                    break;

                case 'custom-eq-list':
                    if (this._eqPresetDropdown)
                        this._syncEqDropdownOptions();
                    break;

                case 'eq-preset':
                    if (this._eqPresetDropdown) {
                        this._eqPresetDropdown.selected_item = value;
                        if (this._modelData.customEqSupport)
                            this._syncCustomEqRows();
                    }
                    break;

                case 'dynamic-bass':
                    if (this._dynamicAudioExpander) {
                        this._dynamicAudioExpander.enable_expansion = value;
                        this._dynamicAudioExpander.expanded = value;
                    }
                    break;

                case 'spatial':
                    if (this._spatialAudioSwitch)
                        this._spatialAudioSwitch.active = value;
                    break;

                case 'volume-enhancer':
                    if (this._volumeEnhancerSwitch)
                        this._volumeEnhancerSwitch.active = value;
                    break;

                case 'lowlatency':
                    if (this._lowLatencySwitch)
                        this._lowLatencySwitch.active = value;
                    break;

                case 'inear-enable':
                    if (this._modelData.inEarDetection && this._inEarSwitch)
                        this._inEarSwitch.active = value;
                    break;

                case 'dual-connection':
                    if (this._dualConnSwitch) {
                        this._dualConnSwitch.active = value ?? false;

                        const multiDevices = info.getValue('multi-devices') ?? [];
                        const devArr = multiDevices.map(dev => ({
                            id: dev.mac,
                            name: dev.name,
                            connected: dev.isConnected,
                            state: BtDeviceState.Ready,
                        }));
                        this._dualConnSwitch.updateDevices(devArr);

                        const ownDev = multiDevices.find(d => d.isCurrent)?.mac ?? '';
                        this._dualConnSwitch.updateOwnDevice(ownDev);
                    }
                    break;

                case 'auto-answer':
                    if (this._autoAnswerSwitch)
                        this._autoAnswerSwitch.active = value;
                    break;

                case 'find-phone':
                    if (this._findPhoneSwitch)
                        this._findPhoneSwitch.active = value;
                    break;

                case 'dynamic-audio-low':
                    if (this._lowFreq)
                        this._lowFreq.value = value;
                    break;

                case 'dynamic-audio-med':
                    if (this._midFreq)
                        this._midFreq.value = value;
                    break;

                case 'dynamic-audio-high':
                    if (this._highFreq)
                        this._highFreq.value = value;
                    break;

                case 'bass-level':
                    if (this._bassLevel)
                        this._bassLevel.value = value;
                    break;

                case 'gestures':
                    if (this._gestureDropdowns) {
                        const gesturesHex = value ||
                            buildPlaceholderGesturesHex(this._modelData.gestureOptions);

                        const slots = decodeGesturesHex(gesturesHex);
                        this._gestureSlotMap = {...slots};
                        Object.entries(this._gestureDropdowns).forEach(([slotKey, dropdown]) => {
                            if (slots[slotKey] !== undefined &&
                                    dropdown.selected_item !== slots[slotKey])
                                dropdown.selected_item = slots[slotKey];
                        });
                    }
                    break;

                case 'nc-cycle-mask':
                    if (this._ncCycleWidget && this._ncCycleProtocolMasks) {
                        const mask = value ?? 0;

                        let widgetMask = 0;

                        for (let i = 0; i < this._ncCycleProtocolMasks.length; i++) {
                            if (mask & this._ncCycleProtocolMasks[i])
                                widgetMask |= 1 << i;
                        }

                        this._ncCycleWidget.toggled_value = widgetMask;
                    }
                    break;

                case 'fit-test-result':
                    if (this._fitTestRow) {
                        if (this._fitTestRow.isTestInProgress()) {
                            const res = value;

                            if (res)
                                this._onFitTestCompleted?.(res);
                        }

                        const deviceIcon = info.getValue('icon');
                        this._fitTestRow.updateIcon(deviceIcon);
                    }
                    break;
            }
        });

        this.connect('close-request', () => {
            this._lowFreq?.destroy();
            this._lowFreq = null;
            this._midFreq?.destroy();
            this._midFreq = null;
            this._highFreq?.destroy();
            this._highFreq = null;

            this._eqEditor?.destroy();
            this._eqEditor = null;

            if (this._eqDebounceId) {
                const id = this._eqDebounceId;
                this._eqDebounceId = null;
                GLib.source_remove(id);
            }

            if (this._multiDevicePollId) {
                const id = this._multiDevicePollId;
                this._multiDevicePollId = null;
                GLib.source_remove(id);
            }

            if (this._fitTestTimeoutId) {
                const id = this._fitTestTimeoutId;
                this._fitTestTimeoutId = null;
                GLib.source_remove(id);
            }

            if (this._modelData?.fitTest && this._fitTestRow) {
                if (this._fitTestRow?.isTestInProgress())
                    this._devInfo.updateDevice('fit-test-op', 'stop');


                if (this._fitTestRowCancelId)
                    this._fitTestRow.disconnect(this._fitTestRowCancelId);
                this._fitTestRowCancelId = null;

                if (this._fitTestRowStartId)
                    this._fitTestRow.disconnect(this._fitTestRowStartId);
                this._fitTestRowStartId = null;
            }

            if (this._modelData?.ring) {
                const ringState = this._devInfo.getValue('ring-state');
                if (ringState === 'playing' || ringState === 'started')
                    this._devInfo.updateDevice('ring-state', 'stopped');
            }

            if (this._modelData?.fitTest)
                this._devInfo.updateDevice('fit-test-result', null);

            this._settingsHandlerId = null;
        });
    }

    _addEq() {
        if (!this._modelData.eqPreset)
            return;

        const eqGroup = new Adw.PreferencesGroup({
            title: _('Equalizer'),
        });

        const presetLabels = {
            originalSound: _('Balanced'),
            bass: _('Bass'),
            deepBass: _('Deep Bass'),
            serenade: _('Vocal'),
            clearBass: _('Clear Bass'),
            vocal: _('Vocal'),
            rock: _('Rock'),
            pop: _('Pop'),
            electronic: _('Electronic'),
            classic: _('Classic'),
            custom: _('Custom'),
        };

        const formatLabel = key => {
            if (presetLabels[key])
                return presetLabels[key];
            const formatted = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
            return formatted.charAt(0).toUpperCase() + formatted.slice(1);
        };

        this._eqPresetLabels = presetLabels;
        this._formatEqLabel = formatLabel;

        const {options, values} = this._buildEqOptions();
        const customIds = (this._devInfo.getValue('custom-eq-list') ?? []).map(e => e.eqId);

        const customEqButton = this._modelData.customEqSupport && customIds.length > 0 ? {
            hasButton: true,
            buttonIcon: 'bbm-eq-symbolic',
            buttonTooltip: _('Custom Equalizer'),
            buttonVisibleFor: customIds,
        } : {};

        this._eqPresetDropdown = new DropDownRowWidget({
            title: _('Equalizer Preset'),
            subtitle: _('Change the sound signature'),
            options,
            values,
            initialValue: this._devInfo.getValue('eq-preset') ?? values[0],
            ...customEqButton,
        });

        this._eqPresetDropdown.connect('notify::selected-item', () => {
            this._devInfo.updateDevice('eq-preset', this._eqPresetDropdown.selected_item);

            if (this._modelData.customEqSupport)
                this._syncCustomEqRows();
        });

        if (this._modelData.customEqSupport) {
            this._eqPresetDropdown.connect('button-clicked', () => {
                const entry = this._selectedCustomEntry();
                if (entry)
                    this._presentEqEditor(entry);
            });
        }

        eqGroup.add(this._eqPresetDropdown);
        this._page.add(eqGroup);

        if (this._modelData.customEqSupport) {
            this._customEqGroup = eqGroup;
            this._customEqRows = [];
            this._addCustomEqManagement();
        }
    }

    _buildEqOptions() {
        const options = [];
        const values = [];

        Object.entries(this._modelData.eqPreset).forEach(([key, val]) => {
            options.push(this._formatEqLabel(key));
            values.push(val);
        });

        for (const entry of this._devInfo.getValue('custom-eq-list') ?? []) {
            if (entry.eqId === undefined)
                continue;
            options.push(entry.name || _('Custom'));
            values.push(entry.eqId);
        }

        return {options, values};
    }

    _syncEqDropdownOptions() {
        if (!this._eqPresetDropdown)
            return;

        const {options, values} = this._buildEqOptions();
        const customIds = (this._devInfo.getValue('custom-eq-list') ?? []).map(e => e.eqId);
        const buttonVisibleFor = this._modelData.customEqSupport ? customIds : [];

        this._eqPresetDropdown.updateList(
            options, values, this._devInfo.getValue('eq-preset'), buttonVisibleFor
        );

        if (this._modelData.customEqSupport)
            this._syncCustomEqRows();
    }

    _selectedCustomEntry() {
        const eqId = this._eqPresetDropdown.selected_item;
        return (this._devInfo.getValue('custom-eq-list') ?? []).find(e => e.eqId === eqId);
    }

    _presentEqEditor(entry) {
        const bandFreqs = this._modelData.eqBands?.frequencies ?? entry.freqs ?? [];
        const labels = bandFreqs.map(freq =>
            freq >= 1000 ? `${(freq / 1000).toFixed(0)}k` : `${freq}`
        );

        if (this._eqEditor)
            this._eqEditor.destroy();

        this._eqEditor = new EqualizerWidget({
            freqs: labels,
            initialValues: entry.dbs ?? [],
            range: Math.max(this._modelData.eqBands?.range ?? 6, Math.abs(entry.min ?? 6),
                Math.abs(entry.max ?? 6)),

            topBarTitle: entry.name || _('Custom'),
            bottomBarTitle: _('Gain (dB)'),
        });

        this._eqEditor.connect('eq-changed', (_widget, values) => {
            entry.dbs = values;
            this._devInfo.updateDevice('custom-eq-op', {
                action: 'modify',
                eqId: entry.eqId,
                name: entry.name ?? '',
                min: entry.min ?? -6,
                max: entry.max ?? 6,
                freqs: bandFreqs,
                dbs: values,
            });
        });

        this._eqEditor.present(this);
    }

    _addCustomEqManagement() {
        const addRow = new Adw.ActionRow({
            title: _('Add Custom Preset'),
            subtitle: _('Create a new custom equalizer profile'),
        });

        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['circular'],
            tooltip_text: _('Add Custom Preset'),
        });

        addButton.connect('clicked', () => this._promptForNewPreset());
        addRow.add_suffix(addButton);
        addRow.activatable_widget = addButton;
        this._customEqGroup.add(addRow);

        this._syncCustomEqRows();
    }

    _syncCustomEqRows() {
        if (!this._customEqGroup)
            return;

        for (const row of this._customEqRows ?? [])
            this._customEqGroup.remove(row);

        this._customEqRows = [];

        for (const entry of this._devInfo.getValue('custom-eq-list') ?? []) {
            if (entry.eqId === undefined)
                continue;

            const row = new Adw.ActionRow({
                title: entry.name || _('Custom'),
                subtitle: this._devInfo.getValue('eq-preset') === entry.eqId ? _('Currently active')
                    : '',
            });

            const editButton = new Gtk.Button({
                icon_name: 'bbm-eq-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['circular'],
                tooltip_text: _('Adjust Equalizer'),
            });
            editButton.connect('clicked', () => this._presentEqEditor(entry));
            row.add_suffix(editButton);
            row.activatable_widget = editButton;

            const renameButton = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['circular'],
                tooltip_text: _('Rename Preset'),
            });
            renameButton.connect('clicked', () => this._promptRenamePreset(entry));
            row.add_suffix(renameButton);

            const deleteButton = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['circular', 'destructive-action'],
                tooltip_text: _('Delete Preset'),
            });
            deleteButton.connect('clicked', () => this._confirmDeletePreset(entry));
            row.add_suffix(deleteButton);

            this._customEqGroup.add(row);
            this._customEqRows.push(row);
        }
    }

    _nextCustomEqId() {
        const entries = this._devInfo.getValue('custom-eq-list') ?? [];
        const baseOffset = this._modelData.eqPreset
            ? Object.values(this._modelData.eqPreset).length : 4;

        let next = baseOffset;
        for (const entry of entries) {
            if (entry.eqId >= next)
                next = entry.eqId + 1;
        }
        return next;
    }

    _promptForNewPreset() {
        const dialog = new Adw.AlertDialog({
            heading: _('Add Custom Preset'),
            body: _('Enter a name for the new custom equalizer profile'),
        });

        const entry = new Gtk.Entry({placeholder_text: _('Custom')});
        dialog.set_extra_child(entry);

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('add', _('Add'));
        dialog.set_default_response('add');
        dialog.set_close_response('cancel');
        dialog.set_response_appearance('add', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (_dialog, response) => {
            const name = entry.text.trim();
            if (response === 'add' && name) {
                const bandFreqs = this._modelData.eqBands?.frequencies ?? [];
                const newId = this._nextCustomEqId();
                const newEntry = {
                    eqId: newId,
                    name,
                    min: -6,
                    max: 6,
                    freqs: bandFreqs,
                    dbs: bandFreqs.map(() => 0),
                    selected: true,
                };

                this._devInfo.updateDevice('custom-eq-op', {
                    action: 'add',
                    eqId: newId,
                    name,
                    min: -6,
                    max: 6,
                    freqs: bandFreqs,
                    dbs: bandFreqs.map(() => 0),
                });

                this._presentEqEditor(newEntry);
            }
        });

        dialog.present(this);
    }

    _promptRenamePreset(entry) {
        const dialog = new Adw.AlertDialog({
            heading: _('Rename Custom Preset'),
            body: _('Enter a new name for "%s"').replace('%s', entry.name || _('Custom')),
        });

        const textEntry = new Gtk.Entry({text: entry.name ?? ''});
        dialog.set_extra_child(textEntry);

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('rename', _('Rename'));
        dialog.set_default_response('rename');
        dialog.set_close_response('cancel');
        dialog.set_response_appearance('rename', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (_dialog, response) => {
            const name = textEntry.text.trim();
            if (response === 'rename' && name) {
                this._devInfo.updateDevice('custom-eq-op', {
                    action: 'modify',
                    eqId: entry.eqId,
                    name,
                    min: entry.min ?? -6,
                    max: entry.max ?? 6,
                    freqs: entry.freqs ?? this._modelData.eqBands?.frequencies ?? [],
                    dbs: entry.dbs ?? [],
                });
            }
        });

        dialog.present(this);
    }

    _confirmDeletePreset(entry) {
        const dialog = new Adw.AlertDialog({
            heading: _('Delete Custom Preset?'),
            body: _('"%s" will be removed from the device')
                    .replace('%s', entry.name || _('Custom')),
        });

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

        dialog.connect('response', (_d, response) => {
            if (response !== 'delete')
                return;

            if (this._devInfo.getValue('eq-preset') === entry.eqId) {
                const defaultPreset = Object.values(this._modelData.eqPreset ?? {})[0] ?? 0;
                this._devInfo.updateDevice('eq-preset', defaultPreset);
            }

            this._devInfo.updateDevice('custom-eq-op', {
                action: 'delete',
                eqId: entry.eqId,
                name: entry.name ?? '',
                min: entry.min ?? -6,
                max: entry.max ?? 6,
                freqs: entry.freqs ?? [],
                dbs: entry.dbs ?? [],
            });
        });

        dialog.present(this);
    }

    _addAudioEffects() {
        const hasEffects = this._modelData.dynamicBass || this._modelData.spatialAudio ||
            this._modelData.volumeEnhancer;

        if (!hasEffects)
            return;

        const effectsGroup = new Adw.PreferencesGroup({
            title: _('Audio Effects'),
        });

        if (this._modelData.dynamicBass && !this._modelData.dynamicBassOpo) {
            const isDynamicBassActive = this._devInfo.getValue('dynamic-bass') ?? false;

            this._dynamicAudioExpander = new Adw.ExpanderRow({
                title: _('Dynamic Audio'),
                subtitle: _('Real-time dynamic bass and 3-band equalization'),
                show_enable_switch: true,
                enable_expansion: isDynamicBassActive,
                expanded: isDynamicBassActive,
            });

            this._dynamicAudioExpander.connect('notify::enable-expansion', () => {
                const enabled = this._dynamicAudioExpander.enable_expansion;
                this._dynamicAudioExpander.expanded = enabled;
                this._devInfo.updateDevice('dynamic-bass', enabled);
            });

            const range = [-5, 5, 1];

            const marks = Array.from({length: 11}, (_o, i) => {
                const value = i - 5;
                const obj = {
                    mark: value,
                };

                if (value === -5)
                    obj.label = _('-5');
                else if (value === 0)
                    obj.label = _('0');
                else if (value === 5)
                    obj.label = _('5');

                return obj;
            });

            this._lowFreq = new SliderRowWidget({
                rowTitle: _('Low Frequency'),
                range,
                marks,
                snapOnStep: true,
                initialValue: this._devInfo.getValue('dynamic-audio-low'),
            });

            this._midFreq = new SliderRowWidget({
                rowTitle: _('Mid Frequency'),
                range,
                marks,
                snapOnStep: true,
                initialValue: this._devInfo.getValue('dynamic-audio-med'),
            });

            this._highFreq = new SliderRowWidget({
                rowTitle: _('High Frequency'),
                range,
                marks,
                snapOnStep: true,
                initialValue: this._devInfo.getValue('dynamic-audio-high'),
            });

            this._lowFreq.compact_mode = this._isCompactMode;
            this._midFreq.compact_mode = this._isCompactMode;
            this._highFreq.compact_mode = this._isCompactMode;

            const debounceEqUpdate = () => {
                if (this._eqDebounceId)
                    GLib.source_remove(this._eqDebounceId);

                this._eqDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                    this._eqDebounceId = null;
                    this._devInfo.updateDevice('dynamic-audio-low', this._lowFreq.value);
                    this._devInfo.updateDevice('dynamic-audio-med', this._midFreq.value);
                    this._devInfo.updateDevice('dynamic-audio-high', this._highFreq.value);

                    return GLib.SOURCE_REMOVE;
                });
            };

            this._lowFreq.connect('notify::value', debounceEqUpdate);
            this._midFreq.connect('notify::value', debounceEqUpdate);
            this._highFreq.connect('notify::value', debounceEqUpdate);

            this._dynamicAudioExpander.add_row(this._lowFreq);
            this._dynamicAudioExpander.add_row(this._midFreq);
            this._dynamicAudioExpander.add_row(this._highFreq);

            effectsGroup.add(this._dynamicAudioExpander);
        } else if (this._modelData.dynamicBass && this._modelData.dynamicBassOpo) {
            const isBassActive = this._devInfo.getValue('dynamic-bass') ?? false;

            this._dynamicAudioExpander = new Adw.ExpanderRow({
                title: _('Bass Enhancement'),
                subtitle: _('Enhances bass in real time'),
                show_enable_switch: true,
                enable_expansion: isBassActive,
                expanded: isBassActive,
            });

            this._dynamicAudioExpander.connect('notify::enable-expansion', () => {
                const enabled = this._dynamicAudioExpander.enable_expansion;
                this._dynamicAudioExpander.expanded = enabled;
                this._devInfo.updateDevice('dynamic-bass', enabled);
            });

            const range = [-5, 5, 1];

            const marks = Array.from({length: 11}, (_o, i) => {
                const value = i - 5;
                const mark = {mark: value};

                if (value === -5 || value === 0 || value === 5)
                    mark.label = _(String(value));

                return mark;
            });

            this._bassLevel = new SliderRowWidget({
                rowTitle: _('Bass Enhancement Level'),
                range,
                marks,
                snapOnStep: true,
                initialValue: this._devInfo.getValue('bass-level'),
            });

            this._bassLevel.compact_mode = this._isCompactMode;

            const debounceBassUpdate = () => {
                if (this._eqDebounceId)
                    GLib.source_remove(this._eqDebounceId);

                this._eqDebounceId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT, 350, () => {
                        this._eqDebounceId = null;
                        this._devInfo.updateDevice('bass-level', this._bassLevel.value);
                        return GLib.SOURCE_REMOVE;
                    }
                );
            };

            this._bassLevel.connect('notify::value', debounceBassUpdate);
            this._dynamicAudioExpander.add_row(this._bassLevel);

            effectsGroup.add(this._dynamicAudioExpander);
        }

        if (this._modelData.spatialAudio) {
            this._spatialAudioSwitch = new Adw.SwitchRow({
                title: _('Spatial Audio'),
                subtitle: _('Add depth for a more immersive experience'),
                active: this._devInfo.getValue('spatial'),
            });

            this._spatialAudioSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('spatial', this._spatialAudioSwitch.active);
            });

            effectsGroup.add(this._spatialAudioSwitch);
        }

        if (this._modelData.volumeEnhancer) {
            this._volumeEnhancerSwitch = new Adw.SwitchRow({
                title: _('Volume Enhancer'),
                subtitle: _('Boost overall sound output for louder playback'),
                active: this._devInfo.getValue('volume-enhancer'),
            });

            this._volumeEnhancerSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('volume-enhancer', this._volumeEnhancerSwitch.active);
            });

            effectsGroup.add(this._volumeEnhancerSwitch);
        }

        this._page.add(effectsGroup);
    }

    _addMiscSetting() {
        const hasMisc = this._modelData.lowLatencyMode || this._modelData.inEarDetection ||
            this._modelData.dualConnection || this._modelData.autoAnswer ||
            this._modelData.fitTest || this._modelData.findMyPhone || this._modelData.ring;

        if (!hasMisc)
            return;

        const miscGroup = new Adw.PreferencesGroup({
            title: _('Additional Settings'),
        });

        if (this._modelData.lowLatencyMode) {
            this._lowLatencySwitch = new Adw.SwitchRow({
                title: _('Game Mode'),
                subtitle: _('Reduces latency and enhances in-game audio'),
                active: this._devInfo.getValue('lowlatency'),
            });

            this._lowLatencySwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('lowlatency', this._lowLatencySwitch.active);
            });

            miscGroup.add(this._lowLatencySwitch);
        }

        if (this._modelData.inEarDetection) {
            this._inEarSwitch = new Adw.SwitchRow({
                title: _('In-Ear Detection'),
                subtitle: _('Pause Media When Not Worn'),
                active: this._devInfo.getValue('inear-enable'),
            });

            this._inEarSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('inear-enable', this._inEarSwitch.active);
            });

            miscGroup.add(this._inEarSwitch);
        }

        if (this._modelData.dualConnection) {
            const deviceManagementConfig = {
                maxConnected: 2,
                hasMultipointSwitch: true,
                hasPairMode: false,
                hasRoutingIndicator: false,
                hasRoutingControl: false,
                hasActiveFix: false,
                showMac: true,
            };

            const multiDevices = this._devInfo.getValue('multi-devices') ?? [];
            const devArr = multiDevices.map(dev => ({
                id: dev.mac,
                name: dev.name,
                connected: dev.isConnected,
                state: BtDeviceState.Ready,
            }));

            const ownDevice = multiDevices.find(d => d.isCurrent)?.mac ?? '';

            this._dualConnSwitch = new DeviceManagementRow(
                this,
                devArr,
                ownDevice,
                '',
                deviceManagementConfig
            );

            this._dualConnSwitch.active = this._devInfo.getValue('dual-connection') ?? false;

            this._dualConnSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('dual-connection', this._dualConnSwitch.active);
            });

            this._dualConnSwitch.connect('device-action', (_row, action, id) => {
                const opMap = {
                    [DeviceManagementAction.Connect]: 0x02,
                    [DeviceManagementAction.Disconnect]: 0x01,
                    [DeviceManagementAction.Remove]: 0x03,
                };
                const op = opMap[action];
                if (op) {
                    this._devInfo.updateDevice('multi-device-op', {
                        op,
                        mac: id,
                    });
                }
            });

            miscGroup.add(this._dualConnSwitch);

            if (this._dualConnSwitch._button && this._dualConnSwitch._dialog) {
                this._dualConnSwitch._button.connect('clicked', () => {
                    this._devInfo.updateDevice('multi-device-op', {
                        op: 'refresh',
                        mac: '',
                    });

                    if (!this._multiDevicePollId) {
                        this._multiDevicePollId = GLib.timeout_add_seconds(
                            GLib.PRIORITY_DEFAULT, 3, () => {
                                this._devInfo.updateDevice('multi-device-op', {
                                    op: 'refresh',
                                    mac: '',
                                }
                                );
                                return GLib.SOURCE_CONTINUE;
                            });
                    }
                });

                this._dualConnSwitch._dialog.connect('closed', () => {
                    if (this._multiDevicePollId) {
                        const id = this._multiDevicePollId;
                        this._multiDevicePollId = null;
                        GLib.source_remove(id);
                    }
                });
            }
        }

        if (this._modelData.autoAnswer) {
            this._autoAnswerSwitch = new Adw.SwitchRow({
                title: _('Answer Calls Automatically'),
                subtitle: _('Answer calls when the earbuds are worn'),
                active: this._devInfo.getValue('auto-answer'),
            });

            this._autoAnswerSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('auto-answer', this._autoAnswerSwitch.active);
            });

            miscGroup.add(this._autoAnswerSwitch);
        }

        if (this._modelData.findMyPhone) {
            this._findPhoneSwitch = new Adw.SwitchRow({
                title: _('Find My Phone'),
                subtitle: _('Allow triggering phone ringing from neckband controls'),
                active: this._devInfo.getValue('find-phone'),
            });

            this._findPhoneSwitch.connect('notify::active', () => {
                this._devInfo.updateDevice('find-phone', this._findPhoneSwitch.active);
            });

            miscGroup.add(this._findPhoneSwitch);
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

                this._fitTestTimeoutId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    10,
                    () => {
                        this._fitTestTimeoutId = null;

                        this._fitTestRow.updateStatus(
                            EarTipStatus.Error,
                            EarTipStatus.Error
                        );

                        return GLib.SOURCE_REMOVE;
                    }
                );
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
                if (!this._fitTestRow)
                    return;

                if (this._fitTestTimeoutId) {
                    GLib.source_remove(this._fitTestTimeoutId);
                    this._fitTestTimeoutId = null;
                }

                this._fitTestRow.updateStatus(
                    res.left === 1 ? EarTipStatus.GoodSeal : EarTipStatus.BadSeal,
                    res.right === 1 ? EarTipStatus.GoodSeal : EarTipStatus.BadSeal
                );
            };
        }

        if (this._modelData.ring) {
            const ringRow = new RingMyBudsRow({dual: false});

            ringRow.connect('notify::status', () => {
                this._devInfo.updateDevice('ring-state', ringRow.status);
            });

            miscGroup.add(ringRow);
        }

        this._page.add(miscGroup);
    }

    _addGestureControls() {
        if (!this._modelData.gestureOptions)
            return;

        const gesturesConfig = this._modelData.gestureOptions;
        this._gestureDropdowns = {};
        this._ncCycleSwitches = null;

        const gestureGroup = new Adw.PreferencesGroup({
            title: _('Gesture and Button Controls'),
            description: _('Customize actions for buttons and touch gestures'),
        });

        const gestureActionNames = {
            'none': _('No Action'),
            'play-pause': _('Play / Pause'),
            'skip-forward': _('Next Track'),
            'skip-back': _('Previous Track'),
            'volume-up': _('Volume Up'),
            'volume-down': _('Volume Down'),
            'voice-assistant': _('Voice Assistant'),
            'noise-control': _('Noise Control'),
            'game-mode': _('Game Mode'),
            'device-switch': _('Switch Devices'),
            'change-volume': _('Volume Control'),
            'switch-track': _('Switch Track'),
            'answer-end-call': _('Answer Call or End Call'),
            'decline-call': _('Decline Call'),
        };

        const gestureSlotNames = {
            'single': _('Single Tap'),
            'double': _('Double Tap'),
            'triple': _('Triple Tap'),
            'action-hold': _('Touch and Hold'),
            'anc-single': _('Single Tap'),
            'double-action-hold': _('Double Tap and Hold'),
            'double-call': _('Double Tap'),
            'long-action-hold-call': _('Long Touch and Hold'),
        };

        const pressSlotNames = {
            'single': _('Single Press'),
            'double': _('Double Press'),
            'triple': _('Triple Press'),
            'action-hold': _('Press and Hold'),
            'double-action-hold': _('Double Press and Hold'),
            'double-call': _('Double Press'),
            'long-action-hold-call': _('Long Press and Hold'),
        };

        const swipeSlotNames = {
            'swipe': _('Swipe'),
        };

        const currentGesturesHex = this._devInfo.getValue('gestures') ||
            buildPlaceholderGesturesHex(gesturesConfig);
        this._gestureSlotMap = decodeGesturesHex(currentGesturesHex);

        const groups = [...new Set(gesturesConfig.slots.map(s => s.group))];

        groups.forEach(groupKey => {
            const groupExpander = new Adw.ExpanderRow({
                title: this._getGroupTitle(groupKey),
                subtitle: _('Configure controls'),
            });

            gesturesConfig.slots.filter(s => s.group === groupKey).forEach(slot => {
                const gestureDef = gesturesConfig.gestures[slot.type];
                if (!gestureDef)
                    return;

                const allowedActions = slot.actions ?? gestureDef.actions;
                const options = [];
                const values = [];

                allowedActions.forEach(actionKey => {
                    options.push(gestureActionNames[actionKey] ?? actionKey);
                    values.push(gesturesConfig.mapping.actions[actionKey]?.[0] ?? 0);
                });

                const btnId = slot.buttonId ?? 0x01;
                const slotKey =
                    `${slot.device}_${btnId}_${gesturesConfig.mapping.gestureTypes[slot.type]}`;

                const currentFuncCode = this._gestureSlotMap[slotKey] !== undefined
                    ? this._gestureSlotMap[slotKey] : values[0];

                const isPress = slot.group === 'mfb' || gestureDef?.type === 'press';
                let rowTitle;

                if (gestureDef?.type === 'swipe')
                    rowTitle = swipeSlotNames[slot.type] ?? slot.type;
                else if (isPress)
                    rowTitle = pressSlotNames[slot.type] ?? slot.type;
                else
                    rowTitle = gestureSlotNames[slot.type] ?? slot.type;


                const dropdown = new DropDownRowWidget({
                    title: rowTitle,
                    options,
                    values,
                    initialValue: currentFuncCode,
                });

                this._gestureDropdowns[slotKey] = dropdown;
                dropdown.connect('notify::selected-item', () => {
                    this._gestureSlotMap[slotKey] = dropdown.selected_item;
                    const newHex = encodeGesturesHex(this._gestureSlotMap, gesturesConfig);
                    this._devInfo.updateDevice('gestures', newHex);
                });

                groupExpander.add_row(dropdown);
            });

            gestureGroup.add(groupExpander);
        });

        this._page.add(gestureGroup);

        if (this._modelData.gestureOptions?.noiseControlModes) {
            const initialMask = this._devInfo.getValue('nc-cycle-mask') ?? 0;

            const ncCycleGroup = new Adw.PreferencesGroup({
                title: _('Noise Control Button Cycling'),
            });

            const modeInfo = {
                'off': {
                    name: _('Off'),
                    icon: 'bbm-anc-off-symbolic',
                },
                'transparency': {
                    name: _('Transparency'),
                    icon: 'bbm-transperancy-symbolic',
                },
                'noise-cancellation': {
                    name: _('Noise Cancellation'),
                    icon: 'bbm-anc-on-symbolic',
                },
                'adaptive': {
                    name: _('Adaptive'),
                    icon: 'bbm-adaptive-symbolic',
                },
            };

            const ncCycleItems = [];
            this._ncCycleProtocolMasks = [];

            for (const [mode, protocolMask] of Object.entries(
                this._modelData.gestureOptions.noiseControlModes
            )) {
                const info = modeInfo[mode];

                if (!info)
                    continue;

                ncCycleItems.push({
                    name: info.name,
                    icon: info.icon,
                });

                this._ncCycleProtocolMasks.push(protocolMask);
            }

            let initialWidgetMask = 0;

            for (let i = 0; i < this._ncCycleProtocolMasks.length; i++) {
                if (initialMask & this._ncCycleProtocolMasks[i])
                    initialWidgetMask |= 1 << i;
            }

            this._ncCycleWidget = new CheckBoxesRowWidget({
                rowTitle: _('Select modes to cycle through'),
                items: ncCycleItems,
                applyBtnName: _('Apply'),
                initialValue: initialWidgetMask,
                minRequired: this._modelData.gestureOptions.minimumNoiseControlModes ?? 2,
            });

            this._ncCycleWidget.compact_mode = this._isCompactMode;

            this._ncCycleWidget.connect('notify::toggled-value', () => {
                const toggled = this._ncCycleWidget.toggled_value;

                let mask = 0;

                for (let i = 0; i < this._ncCycleProtocolMasks.length; i++) {
                    if (toggled & 1 << i)
                        mask |= this._ncCycleProtocolMasks[i];
                }

                this._devInfo.updateDevice('nc-cycle-mask', mask);
            });

            ncCycleGroup.add(this._ncCycleWidget);
            this._page.add(ncCycleGroup);
        }
    }

    _getGroupTitle(group) {
        switch (group) {
            case 'left':
                return _('Left Earbud');
            case 'right':
                return _('Right Earbud');
            case 'left-call':
                return _('Left Earbud Call Controls');
            case 'right-call':
                return _('Right Earbud Call Controls');
            case 'single':
                return _('Button Controls');
            case 'mfb':
                return _('Multi-Function Button');
            case 'anc':
                return _('Noise Control Button');
            default:
                return _('Gesture and Button Controls');
        }
    }

    _updateCompactStatus() {
        this._lowFreq?.set_property('compact-mode', this._isCompactMode);
        this._midFreq?.set_property('compact-mode', this._isCompactMode);
        this._highFreq?.set_property('compact-mode', this._isCompactMode);
        this._bassLevel?.set_property('compact-mode', this._isCompactMode);
        this._ncCycleWidget?.set_property('compact-mode', this._isCompactMode);
    }
});
