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
    OpoBudsModelList, safeJsonParse,
    buildPlaceholderGesturesHex, decodeGesturesHex, encodeGesturesHex,
    widgetMaskToProtocolMask, protocolMaskToWidgetMask
} from '../../../lib/devices/opoBuds/opoBudsConfig.js';

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_OpoBudsConfigureWindow',
}, class ConfigureWindow extends Adw.Window {
    _init(settings, mac, devicePath, parentWindow, modal = false) {
        super._init({
            default_width: 650,
            default_height: 650,
            width_request: 320,
            height_request: 100,
            modal,
            transient_for: parentWindow ?? null,
        });

        this._isCompactMode = false;
        this._gestureSlotMap = {};

        this._breakpointCompact = new Adw.Breakpoint({
            condition: Adw.BreakpointCondition.parse('max-width: 550px'),
        });

        this.add_breakpoint(this._breakpointCompact);

        this._breakpointCompact.connect('apply', () => {
            this._isCompactMode = true;
            this._updateCompactStatus();
        });

        this._breakpointCompact.connect('unapply', () => {
            this._isCompactMode = false;
            this._updateCompactStatus();
        });

        this._settings = settings;
        this._devicePath = devicePath;

        const pathsString = settings.get_strv('opo-buds-list').map(safeJsonParse).filter(Boolean);
        this._settingsItems = pathsString.find(info => info.path === devicePath);

        if (!this._settingsItems)
            return;

        this._lastCustomEqListJson = JSON.stringify(this._settingsItems['custom-eq-list'] ?? []);

        this.title = this._settingsItems.alias;

        this._modelData = OpoBudsModelList.find(m => m.modelId === this._settingsItems.modelid);

        if (!this._modelData)
            return;

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
            initialCaseIcon = this._settingsItems['case'];
        }

        const iconSelector = new IconSelectorWidget({
            iconList,
            initialIcon: this._settingsItems['icon'],
            caseIconList,
            initialCaseIcon,
            mac,
            fw: this._settingsItems['fw-version'],
        });

        iconSelector.connect('notify::selected-icon', () => {
            if (this._isUpdatingUI)
                return;
            this._updateGsettings('icon', iconSelector.selected_icon);
        });

        if (this._modelData.batteryCase) {
            iconSelector.connect('notify::selected-case-icon', () => {
                if (this._isUpdatingUI)
                    return;
                this._updateGsettings('case', iconSelector.selected_case_icon);
            });
        }

        this._page.add(iconSelector);

        this._addEq();
        this._addAudioEffects();
        this._addMiscSetting();
        this._addGestureControls();

        this._isUpdatingUI = false;

        this._settingsHandlerId = this._settings.connect('changed::opo-buds-list', () => {
            if (this._isUpdatingUI)
                return;

            const list = this._settings.get_strv('opo-buds-list')
                    .map(safeJsonParse).filter(Boolean);

            const item = list.find(d => d.path === this._devicePath);

            if (!item)
                return;

            this._isUpdatingUI = true;
            try {
                this._settingsItems = item;

                if (this._modelData.eqPreset && this._eqPresetDropdown) {
                    const currentCustomJson =
                             JSON.stringify(this._settingsItems['custom-eq-list'] ?? []);

                    if (this._lastCustomEqListJson !== currentCustomJson) {
                        this._lastCustomEqListJson = currentCustomJson;
                        this._syncEqDropdownOptions();
                    }

                    if (this._eqPresetDropdown.selected_item !== this._settingsItems['eq-preset'])
                        this._eqPresetDropdown.selected_item = this._settingsItems['eq-preset'];
                }

                if (this._modelData.dynamicBass && this._dynamicBassSwitch)
                    this._dynamicBassSwitch.active = this._settingsItems['dynamic-bass'];

                if (this._modelData.spatialAudio && this._spatialAudioSwitch)
                    this._spatialAudioSwitch.active = this._settingsItems['spatial'];

                if (this._modelData.volumeEnhancer && this._volumeEnhancerSwitch)
                    this._volumeEnhancerSwitch.active = this._settingsItems['volume-enhancer'];

                if (this._modelData.lowLatencyMode && this._lowLatencySwitch)
                    this._lowLatencySwitch.active = this._settingsItems['lowlatency'];

                if (this._modelData.inEarDetection && this._inEarSwitch)
                    this._inEarSwitch.active = this._settingsItems['inear-enable'];

                if (this._modelData.dualConnection && this._dualConnSwitch) {
                    this._dualConnSwitch.active = this._settingsItems['dual-connection'] ?? false;

                    const multiDevices = this._settingsItems['multi-devices'] ?? [];
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

                if (this._modelData.autoAnswer && this._autoAnswerSwitch)
                    this._autoAnswerSwitch.active = this._settingsItems['auto-answer'];

                if (this._modelData.findMyPhone && this._findPhoneSwitch)
                    this._findPhoneSwitch.active = this._settingsItems['find-phone'];

                if (this._lowFreq)
                    this._lowFreq.value = this._settingsItems['dynamic-audio-low'];

                if (this._midFreq)
                    this._midFreq.value = this._settingsItems['dynamic-audio-med'];

                if (this._highFreq)
                    this._highFreq.value = this._settingsItems['dynamic-audio-high'];

                if (this._modelData.gestureOptions && this._gestureDropdowns) {
                    const gesturesHex = this._settingsItems['gestures'] ||
                            buildPlaceholderGesturesHex(this._modelData.gestureOptions);

                    const slots = decodeGesturesHex(gesturesHex);
                    this._gestureSlotMap = {...slots};
                    Object.entries(this._gestureDropdowns).forEach(([slotKey, dropdown]) => {
                        if (slots[slotKey] !== undefined &&
                                dropdown.selected_item !== slots[slotKey])
                            dropdown.selected_item = slots[slotKey];
                    });
                }

                if (this._modelData.noiseControl && this._ncCycleWidget) {
                    const mask = this._settingsItems['nc-cycle-mask'] ?? 0x0B;
                    this._ncCycleWidget.toggled_value = protocolMaskToWidgetMask(mask);
                }

                if (this._fitTestRow) {
                    if (this._fitTestRow.isTestInProgress()) {
                        const res = this._settingsItems['fit-test-result'];

                        if (res)
                            this._onFitTestCompleted?.(res);
                    }

                    const deviceIcon = this._settingsItems['icon'];
                    this._fitTestRow.updateIcon(deviceIcon);
                }
            } finally {
                this._isUpdatingUI = false;
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

            if (this._isTestingFit) {
                this._updateGsettings('fit-test-op', {
                    action: 'stop',
                    ts: Date.now(),
                });
                this._isTestingFit = false;
            }

            if (this._modelData?.ring) {
                const ringState = this._settingsItems?.['ring-state'];
                if (ringState === 'playing' || ringState === 'started')
                    this._updateGsettings('ring-state', 'stopped');
            }

            if (this._modelData?.fitTest)
                this._updateGsettings('fit-test-result', null);

            if (this._settingsHandlerId) {
                this._settings.disconnect(this._settingsHandlerId);
                this._settingsHandlerId = null;
            }
        });
    }

    _updateGsettings(key, value) {
        const currentList = this._settings.get_strv('opo-buds-list')
                .map(safeJsonParse).filter(Boolean);

        const index = currentList.findIndex(d => d.path === this._devicePath);

        if (index !== -1) {
            currentList[index][key] = value;
            this._settingsItems[key] = value;
            this._settings.set_strv('opo-buds-list', currentList.map(JSON.stringify));
        }
    }

    _updateMultipleGsettings(obj) {
        const currentList = this._settings.get_strv('opo-buds-list')
                .map(safeJsonParse).filter(Boolean);

        const index = currentList.findIndex(d => d.path === this._devicePath);

        if (index !== -1) {
            for (const [key, value] of Object.entries(obj)) {
                currentList[index][key] = value;
                this._settingsItems[key] = value;
            }
            this._settings.set_strv('opo-buds-list', currentList.map(JSON.stringify));
        }
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
        const customIds = (this._settingsItems['custom-eq-list'] ?? []).map(e => e.eqId);

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
            initialValue: this._settingsItems['eq-preset'] ?? values[0],
            ...customEqButton,
        });

        this._eqPresetDropdown.connect('notify::selected-item', () => {
            if (this._isUpdatingUI)
                return;
            this._updateGsettings('eq-preset', this._eqPresetDropdown.selected_item);
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

        for (const entry of this._settingsItems['custom-eq-list'] ?? []) {
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
        const customIds = (this._settingsItems['custom-eq-list'] ?? []).map(e => e.eqId);
        const buttonVisibleFor = this._modelData.customEqSupport ? customIds : [];

        this._eqPresetDropdown.updateList(
            options, values, this._settingsItems['eq-preset'], buttonVisibleFor
        );

        if (this._modelData.customEqSupport)
            this._syncCustomEqRows();
    }

    _selectedCustomEntry() {
        const eqId = this._eqPresetDropdown.selected_item;
        return (this._settingsItems['custom-eq-list'] ?? []).find(e => e.eqId === eqId);
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
            if (this._isUpdatingUI)
                return;

            entry.dbs = values;
            this._updateGsettings('custom-eq-op', {
                action: 'modify',
                eqId: entry.eqId,
                name: entry.name ?? '',
                min: entry.min ?? -6,
                max: entry.max ?? 6,
                freqs: bandFreqs,
                dbs: values,
                ts: Date.now(),
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

        for (const entry of this._settingsItems['custom-eq-list'] ?? []) {
            if (entry.eqId === undefined)
                continue;

            const row = new Adw.ActionRow({
                title: entry.name || _('Custom'),
                subtitle: entry.selected ? _('Currently active') : '',
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
        const entries = this._settingsItems['custom-eq-list'] ?? [];
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

                this._updateGsettings('custom-eq-op', {
                    action: 'add',
                    eqId: newId,
                    name,
                    min: -6,
                    max: 6,
                    freqs: bandFreqs,
                    dbs: bandFreqs.map(() => 0),
                    ts: Date.now(),
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
                this._updateGsettings('custom-eq-op', {
                    action: 'modify',
                    eqId: entry.eqId,
                    name,
                    min: entry.min ?? -6,
                    max: entry.max ?? 6,
                    freqs: entry.freqs ?? this._modelData.eqBands?.frequencies ?? [],
                    dbs: entry.dbs ?? [],
                    ts: Date.now(),
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

            if (this._settingsItems['eq-preset'] === entry.eqId) {
                const defaultPreset = Object.values(this._modelData.eqPreset ?? {})[0] ?? 0;
                this._updateGsettings('eq-preset', defaultPreset);
            }

            this._updateGsettings('custom-eq-op', {
                action: 'delete',
                eqId: entry.eqId,
                name: entry.name ?? '',
                min: entry.min ?? -6,
                max: entry.max ?? 6,
                freqs: entry.freqs ?? [],
                dbs: entry.dbs ?? [],
                ts: Date.now(),
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

        if (this._modelData.dynamicBass) {
            const bassOpo = !!this._modelData.dynamicBassOpo;
            const isDynamicBassActive = this._settingsItems['dynamic-bass'] ?? false;
            const dynamicAudioExpander = new Adw.ExpanderRow({
                title: bassOpo ? _('Bass Enhancement') : _('Dynamic Audio'),
                subtitle: bassOpo ? _('Enhances bass in real time')
                    : _('Real-time dynamic bass and 3-band equalization'),

                show_enable_switch: true,
                enable_expansion: isDynamicBassActive,
                expanded: isDynamicBassActive,
            });

            dynamicAudioExpander.connect('notify::enable-expansion', () => {
                if (this._isUpdatingUI)
                    return;
                const enabled = dynamicAudioExpander.enable_expansion;
                dynamicAudioExpander.expanded = enabled;
                this._updateGsettings('dynamic-bass', enabled);
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
                rowTitle: bassOpo ? _('Bass Enhancement Level') : _('Low Frequency'),
                range,
                marks,
                snapOnStep: true,
                initialValue: this._settingsItems['dynamic-audio-low'],
            });

            this._lowFreq.compact_mode = this._isCompactMode;

            if (!bassOpo) {
                this._midFreq = new SliderRowWidget({
                    rowTitle: _('Mid Frequency'),
                    range,
                    marks,
                    snapOnStep: true,
                    initialValue: this._settingsItems['dynamic-audio-med'],
                });

                this._highFreq = new SliderRowWidget({
                    rowTitle: _('High Frequency'),
                    range,
                    marks,
                    snapOnStep: true,
                    initialValue: this._settingsItems['dynamic-audio-high'],
                });

                this._midFreq.compact_mode = this._isCompactMode;
                this._highFreq.compact_mode = this._isCompactMode;
            }

            const debounceEqUpdate = () => {
                if (this._isUpdatingUI)
                    return;

                if (this._eqDebounceId)
                    GLib.source_remove(this._eqDebounceId);

                this._eqDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                    this._eqDebounceId = null;
                    this._updateMultipleGsettings({
                        'dynamic-audio-low': this._lowFreq.value,
                        'dynamic-audio-med': this._midFreq?.value ?? 0,
                        'dynamic-audio-high': this._highFreq?.value ?? 0,
                    });
                    return GLib.SOURCE_REMOVE;
                });
            };

            this._lowFreq.connect('notify::value', debounceEqUpdate);
            dynamicAudioExpander.add_row(this._lowFreq);

            if (!bassOpo) {
                this._midFreq.connect('notify::value', debounceEqUpdate);
                this._highFreq.connect('notify::value', debounceEqUpdate);
                dynamicAudioExpander.add_row(this._midFreq);
                dynamicAudioExpander.add_row(this._highFreq);
            }
            effectsGroup.add(dynamicAudioExpander);
        }

        if (this._modelData.spatialAudio) {
            this._spatialAudioSwitch = new Adw.SwitchRow({
                title: _('Spatial Audio'),
                subtitle: _('Add depth for a more immersive experience'),
                active: this._settingsItems['spatial'],
            });

            this._spatialAudioSwitch.connect('notify::active', () => {
                if (this._isUpdatingUI)
                    return;
                this._updateGsettings('spatial', this._spatialAudioSwitch.active);
            });

            effectsGroup.add(this._spatialAudioSwitch);
        }

        if (this._modelData.volumeEnhancer) {
            this._volumeEnhancerSwitch = new Adw.SwitchRow({
                title: _('Volume Enhancer'),
                subtitle: _('Boost overall sound output for louder playback'),
                active: this._settingsItems['volume-enhancer'],
            });

            this._volumeEnhancerSwitch.connect('notify::active', () => {
                if (this._isUpdatingUI)
                    return;
                this._updateGsettings('volume-enhancer', this._volumeEnhancerSwitch.active);
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
                active: this._settingsItems['lowlatency'],
            });

            this._lowLatencySwitch.connect('notify::active', () => {
                if (this._isUpdatingUI)
                    return;
                this._updateGsettings('lowlatency', this._lowLatencySwitch.active);
            });

            miscGroup.add(this._lowLatencySwitch);
        }

        if (this._modelData.inEarDetection) {
            this._inEarSwitch = new Adw.SwitchRow({
                title: _('In-Ear Detection'),
                subtitle: _('Pause Media When Not Worn'),
                active: this._settingsItems['inear-enable'],
            });

            this._inEarSwitch.connect('notify::active', () => {
                if (this._isUpdatingUI)
                    return;
                this._updateGsettings('inear-enable', this._inEarSwitch.active);
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

            const multiDevices = this._settingsItems['multi-devices'] ?? [];
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

            this._dualConnSwitch.active = this._settingsItems['dual-connection'] ?? false;

            this._dualConnSwitch.connect('notify::active', () => {
                if (this._isUpdatingUI)
                    return;
                this._updateGsettings('dual-connection', this._dualConnSwitch.active);
            });

            this._dualConnSwitch.connect('device-action', (_row, action, id) => {
                const opMap = {
                    [DeviceManagementAction.Connect]: 0x02,
                    [DeviceManagementAction.Disconnect]: 0x01,
                    [DeviceManagementAction.Remove]: 0x03,
                };
                const op = opMap[action];
                if (op) {
                    this._updateGsettings('multi-device-op', {
                        op,
                        mac: id,
                        ts: Date.now(),
                    });
                }
            });

            miscGroup.add(this._dualConnSwitch);

            if (this._dualConnSwitch._button && this._dualConnSwitch._dialog) {
                this._dualConnSwitch._button.connect('clicked', () => {
                    this._updateGsettings('multi-device-op', {
                        op: 'refresh',
                        mac: '',
                        ts: Date.now(),
                    });

                    if (!this._multiDevicePollId) {
                        this._multiDevicePollId = GLib.timeout_add_seconds(
                            GLib.PRIORITY_DEFAULT, 3, () => {
                                this._updateGsettings('multi-device-op', {
                                    op: 'refresh',
                                    mac: '',
                                    ts: Date.now(),
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
                active: this._settingsItems['auto-answer'],
            });

            this._autoAnswerSwitch.connect('notify::active', () => {
                if (this._isUpdatingUI)
                    return;
                this._updateGsettings('auto-answer', this._autoAnswerSwitch.active);
            });

            miscGroup.add(this._autoAnswerSwitch);
        }

        if (this._modelData.findMyPhone) {
            this._findPhoneSwitch = new Adw.SwitchRow({
                title: _('Find My Phone'),
                subtitle: _('Allow triggering phone ringing from neckband controls'),
                active: this._settingsItems['find-phone'],
            });

            this._findPhoneSwitch.connect('notify::active', () => {
                if (this._isUpdatingUI)
                    return;
                this._updateGsettings('find-phone', this._findPhoneSwitch.active);
            });

            miscGroup.add(this._findPhoneSwitch);
        }

        if (this._modelData.fitTest) {
            const deviceIcon = this._settingsItems['icon'];

            this._fitTestRow = new EarTipFitTestRow(this, deviceIcon, true);

            this._fitTestRow.connect('start-test', () => {
                this._updateMultipleGsettings({
                    'fit-test-result': null,
                    'fit-test-op': {
                        action: 'start',
                        ts: Date.now(),
                    },
                });

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
                if (this._isUpdatingUI)
                    return;
                this._updateGsettings('ring-state', ringRow.status);
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
        };

        const gestureSlotNames = {
            'single': _('Single Tap'),
            'double': _('Double Tap'),
            'triple': _('Triple Tap'),
            'action-hold': _('Touch and Hold'),
            'anc-single': _('Single Tap'),
            'double-action-hold': _('Double Tap and Hold'),
        };

        const pressSlotNames = {
            'single': _('Single Press'),
            'double': _('Double Press'),
            'triple': _('Triple Press'),
            'action-hold': _('Press and Hold'),
            'double-action-hold': _('Double Press and Hold'),
        };

        const currentGesturesHex = this._settingsItems['gestures'] ||
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
                const rowTitle = isPress && pressSlotNames[slot.type]
                    ? pressSlotNames[slot.type]
                    : gestureSlotNames[slot.type] ?? slot.type;

                const dropdown = new DropDownRowWidget({
                    title: rowTitle,
                    options,
                    values,
                    initialValue: currentFuncCode,
                });

                this._gestureDropdowns[slotKey] = dropdown;
                dropdown.connect('notify::selected-item', () => {
                    if (this._isUpdatingUI)
                        return;

                    this._gestureSlotMap[slotKey] = dropdown.selected_item;
                    const newHex = encodeGesturesHex(this._gestureSlotMap, gesturesConfig);
                    this._updateGsettings('gestures', newHex);
                });

                groupExpander.add_row(dropdown);
            });

            gestureGroup.add(groupExpander);
        });

        this._page.add(gestureGroup);

        if (this._modelData.noiseControl) {
            const initialMask = this._settingsItems['nc-cycle-mask'] ?? 0x0B;

            const ncCycleGroup = new Adw.PreferencesGroup({
                title: _('Noise Control Button Cycling'),
            });

            const ncCycleItems = [
                {
                    name: _('Off'),
                    icon: 'bbm-anc-off-symbolic',
                },
                {
                    name: _('Transparency'),
                    icon: 'bbm-transperancy-symbolic',
                },
                {
                    name: _('Noise Cancellation'),
                    icon: 'bbm-anc-on-symbolic',
                },
            ];

            const initialWidgetMask = protocolMaskToWidgetMask(initialMask);

            this._ncCycleWidget = new CheckBoxesRowWidget({
                rowTitle: _('Select modes to cycle through'),
                items: ncCycleItems,
                applyBtnName: _('Apply'),
                initialValue: initialWidgetMask,
                minRequired: 2,
            });

            this._ncCycleWidget.compact_mode = this._isCompactMode;

            this._ncCycleWidget.connect('notify::toggled-value', () => {
                if (this._isUpdatingUI)
                    return;
                const toggled = this._ncCycleWidget.toggled_value;
                const mask = widgetMaskToProtocolMask(toggled);
                this._updateGsettings('nc-cycle-mask', mask);
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
        this._ncCycleWidget?.set_property('compact-mode', this._isCompactMode);
    }
});
