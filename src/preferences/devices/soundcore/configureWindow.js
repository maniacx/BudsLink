'use strict';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {
    supportedAudioSingleIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';
import {EqualizerWidget} from './../../widgets/equalizerWidget.js';
import {DeviceManagementRow} from './../../widgets/deviceMgmtRowWidget.js';
import {SliderRowWidget} from './../../widgets/sliderRowWidget.js';
import {
    SoundcoreConfiguration, AmbientMode, NcMode, TransparencyMode, TransportMode, TouchActionCustom, EqPresets
} from '../../../lib/devices/soundcore/soundcoreConfig.js';

const SettingsKey = 'soundcore-list';

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_SoundcoreConfigureWindow',
}, class ConfigureWindow extends Adw.Window {
    _init(settings, mac, devicePath, parentWindow, modal = false) {
        super._init({
            default_width: 650,
            default_height: 700,
            width_request: 320,
            height_request: 100,
            modal,
            transient_for: parentWindow ?? null,
        });

        this._settings = settings;
        this._devicePath = devicePath;
        this._switches = {};
        this._dropdowns = {};
        this._sliders = {};

        this._settingsItems = this._readSettingsItems();
        if (!this._settingsItems)
            return;

        this._modelData = SoundcoreConfiguration.find(m =>
            m.name === this._settingsItems.modelId) ?? null;
        if (!this._modelData)
            return;

        this.title = this._settingsItems.alias;

        const stack = new Adw.ViewStack();
        const toolViewBar = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        const switcherTitle = new Adw.WindowTitle({title: this.title, subtitle: ''});
        headerBar.set_title_widget(switcherTitle);
        const switcherBar = new Adw.ViewSwitcherBar({stack, reveal: true});

        toolViewBar.add_top_bar(headerBar);
        toolViewBar.add_bottom_bar(switcherBar);
        toolViewBar.set_content(stack);
        this.set_content(toolViewBar);
        this._switcherTitle = switcherTitle;
        this._stack = stack;

        const soundPage = new Adw.PreferencesPage();
        const controlsPage = new Adw.PreferencesPage();
        const devicePage = new Adw.PreferencesPage();
        stack.add_titled_with_icon(soundPage, 'sound', _('Sound Settings'), 'bbm-eq-symbolic');
        stack.add_titled_with_icon(controlsPage, 'controls', _('Gesture Controls'),
            'bbm-edit-symbolic');
        stack.add_titled_with_icon(devicePage, 'device', _('Device'), 'bbm-settings-symbolic');

        this._addSoundPage(soundPage);
        this._addTouchControls(controlsPage);
        this._addDevicePage(devicePage, mac);
        this._updateVisibility();

        const settingSignalId = this._settings.connect(`changed::${SettingsKey}`, () => {
            this._settingsItems = this._readSettingsItems();
            if (!this._settingsItems)
                return;

            this.title = this._settingsItems.alias;
            this._switcherTitle.title = this._settingsItems.alias;

            for (const [key, row] of Object.entries(this._switches))
                row.active = this._settingsItems[key];

            for (const [key, row] of Object.entries(this._dropdowns))
                row.selected_item = this._settingsItems[key];

            for (const [key, row] of Object.entries(this._sliders))
                row.value = this._settingsItems[key];

            if (this._eqDropdown) {
                this._eqDropdown.selected_item = this._settingsItems['eq-mode'];
                this._presetRow.selected_item = this._settingsItems['eq-preset'];
                this._hearTypeRow.selected_item = this._settingsItems['hearid-type'];
                this._genreRow.selected_item = this._settingsItems['hearid-genre'];
                this._eq?.setValues(this._settingsItems['eq-custom']);
                this._hearEq?.setValues(this._settingsItems['hearid-custom']);
                this._updateEqualizerRows();
            }

            this._updateVisibility();
            this._devMgmtRow?.updateDevices(this._settingsItems['dev-mgmt']);
            if (this._devMgmtRow) {
                this._devMgmtRow.active = this._settingsItems['dual-conn'];
                this._devMgmtRow.sensitive = !this._settingsItems['ldac'];
            }
        });

        this.connect('close-request', () => {
            for (const row of Object.values(this._sliders))
                row.destroy();

            this._eq?.destroy();
            this._eq = null;
            this._hearEq?.destroy();
            this._hearEq = null;

            if (settingSignalId && this._settings)
                this._settings.disconnect(settingSignalId);

            this._settings = null;

            return false;
        });
    }

    // Ambient sound and sound effects; the rows shown depend on the selected modes
    _addSoundPage(page) {
        const ambientGroup = new Adw.PreferencesGroup({title: _('Ambient Sound')});
        page.add(ambientGroup);

        this._addDropdown(ambientGroup, 'ambient-mode', _('Mode'), '',
            [_('Off'), _('Noise Cancellation'), _('Transparency')],
            [AmbientMode.NORMAL, AmbientMode.NOISE_CANCELING, AmbientMode.TRANSPARENCY]);

        // Noise cancellation
        this._addDropdown(ambientGroup, 'nc-mode', _('ANC Type'), '',
            [_('Adaptive'), _('Manual'), _('Transportation')],
            [NcMode.ADAPTIVE, NcMode.MANUAL, NcMode.TRANSPORTATION]);
        this._addSwitch(ambientGroup, 'environment-detection', _('Environment Detection'),
            '');
        this._addSlider(ambientGroup, 'nc-level', _('Noise Cancellation Level'), '', [1, 5, 1]);
        this._addDropdown(ambientGroup, 'transport-mode', _('Transportation'), '',
            [_('Plane'), _('Train'), _('Bus'), _('Car')],
            [TransportMode.PLANE, TransportMode.TRAIN, TransportMode.BUS, TransportMode.CAR]);

        // Transparency
        this._addDropdown(ambientGroup, 'transparency-mode', _('Transparency Type'), '',
            [_('Fully Transparent'), _('Vocal Mode')],
            [TransparencyMode.FULLY, TransparencyMode.VOCAL]);

        this._addSwitch(ambientGroup, 'wind-noise', _('Wind Noise Reduction'),
            '');

        const effectsGroup = new Adw.PreferencesGroup({title: _('Audio Effects')});
        page.add(effectsGroup);
        this._addEqualizer(effectsGroup);

        const soundGroup = new Adw.PreferencesGroup({title: _('Sound Settings')});
        page.add(soundGroup);
        this._addSwitch(soundGroup, 'sound-leak-compensation', _('Sound Leak Compensation'),
            '');
        this._addSwitch(soundGroup, 'gaming-mode', _('Game Mode'),
            _('Reduces latency and enhances in-game audio'));
        this._addSwitch(soundGroup, 'limit-volume', _('Limit High Volume'),
            '');
        this._addDropdown(soundGroup, 'limit-volume-db', _('Volume Limit'), '',
            ['75 dB', '80 dB', '85 dB', '90 dB', '95 dB', '100 dB'],
            [75, 80, 85, 90, 95, 100]);
        this._addDropdown(soundGroup, 'limit-volume-refresh', _('Decibel Reading Refresh Rate'), '',
            [_('Real time'), _('10 seconds'), _('1 minute')],
            [0, 1, 2]);
    }

    _addDevicePage(page, mac) {
        const iconSelector = new IconSelectorWidget({
            iconList: supportedAudioSingleIcons,
            initialIcon: this._settingsItems['icon'] || this._modelData.budsIcon,
            caseIconList: supportedCaseIcons,
            initialCaseIcon: this._settingsItems['case'] || this._modelData.case,
            mac,
            fw: '',
        });

        iconSelector.connect('notify::selected-icon', () => {
            this._updateGsettings('icon', iconSelector.selected_icon);
        });

        if ('case' in this._settingsItems) {
            iconSelector.connect('notify::selected-case-icon', () => {
                this._updateGsettings('case', iconSelector.selected_case_icon);
            });
        }

        page.add(iconSelector);

        this._addDevMgmtSetting(page);

        const settingsGroup = new Adw.PreferencesGroup({title: _('Settings')});
        page.add(settingsGroup);

        this._addSwitch(settingsGroup, 'ldac', _('LDAC'),
            _('High resolution codec. Turns off connections to multiple devices and the ' +
              'earbuds reconnect when this changes'));
        this._addSwitch(settingsGroup, 'auto-play-pause', _('Auto Play/Pause'),
            _('Pause when taken off'));
        this._addSwitch(settingsGroup, 'wearing-tone', _('Wearing Tone'),
            '');
        this._addSwitch(settingsGroup, 'touch-tone', _('Touch Tone'),
            '');
        this._addSwitch(settingsGroup, 'touch-lock', _('Touch Lock'),
            '');
        this._addSwitch(settingsGroup, 'low-battery-prompt', _('Low Battery Prompt'),
            '');
        this._addDropdown(settingsGroup, 'auto-power-off', _('Automatic Power Off'), '',
            [_('Never'), _('After 10 minutes'), _('After 20 minutes'), _('After 30 minutes'),
                _('After 1 hour')],
            [0, 10, 20, 30, 60]);
    }

    // Shows only the rows that apply to the current modes
    _updateVisibility() {
        const items = this._settingsItems;
        const ambient = items['ambient-mode'];
        const nc = items['nc-mode'];
        const isNc = ambient === AmbientMode.NOISE_CANCELING;
        const isTransparency = ambient === AmbientMode.TRANSPARENCY;

        const visible = {
            'nc-mode': isNc,
            'environment-detection': isNc && nc === NcMode.ADAPTIVE,
            'nc-level': isNc && nc === NcMode.MANUAL,
            'transport-mode': isNc && nc === NcMode.TRANSPORTATION,
            'transparency-mode': isTransparency,
            'wind-noise': isNc || isTransparency,
            'limit-volume-db': items['limit-volume'],
            'limit-volume-refresh': items['limit-volume'],
        };

        for (const [key, show] of Object.entries(visible)) {
            const row = this._switches[key] ?? this._dropdowns[key] ?? this._sliders[key];
            if (row)
                row.visible = show;
        }

        if (this._eqDropdown)
            this._updateEqualizerRows();
    }

    _addSwitch(group, key, title, subtitle) {
        if (!(key in this._settingsItems))
            return;

        const row = new Adw.SwitchRow({title, subtitle});
        row.active = this._settingsItems[key];
        row.connect('notify::active', () => {
            if (this._settingsItems[key] !== row.active)
                this._updateGsettings(key, row.active);
        });
        group.add(row);
        this._switches[key] = row;
    }

    _addDropdown(group, key, title, subtitle, options, values) {
        if (!(key in this._settingsItems))
            return;

        const row = new DropDownRowWidget({
            title,
            subtitle,
            options,
            values,
            initialValue: this._settingsItems[key],
        });
        row.connect('notify::selected-item', () => {
            const value = row.selected_item;
            if (value !== undefined && value !== TouchActionCustom &&
                    value !== this._settingsItems[key])
                this._updateGsettings(key, value);
        });
        group.add(row);
        this._dropdowns[key] = row;
    }

    _addSlider(group, key, rowTitle, rowSubtitle, range) {
        if (!(key in this._settingsItems))
            return;

        const marks = [];
        for (let i = range[0]; i <= range[1]; i += range[2])
            marks.push({mark: i, label: `${i}`});

        const row = new SliderRowWidget({
            rowTitle,
            rowSubtitle,
            range,
            marks,
            snapOnStep: true,
            initialValue: this._settingsItems[key],
        });
        row.connect('notify::value', () => {
            if (this._settingsItems[key] !== row.value)
                this._updateGsettings(key, row.value);
        });
        group.add(row);
        this._sliders[key] = row;
    }

    _addEqualizer(group) {
        const eqInfo = this._modelData.equalizer;
        if (!eqInfo || !('eq-mode' in this._settingsItems))
            return;

        const freqs = eqInfo.freqs.map(f => f >= 1000 ? `${f / 1000}k` : `${f}`);
        const createEqualizer = key => {
            const eq = new EqualizerWidget({
                freqs,
                initialValues: this._settingsItems[key],
                range: eqInfo.range,
                step: 0.1,
                digits: 1,
                topBarTitle: _('Frequency (Hz)'),
                bottomBarTitle: _('Gain (dB)'),
            });
            return eq;
        };

        this._addSwitch(group, 'surround-sound', _('Spatial Audio'), '');

        this._eqDropdown = new DropDownRowWidget({
            title: _('Mode'),
            subtitle: _('Change the sound signature'),
            options: [_('HearID Sound'), _('Default'), _('Custom Equalizer')],
            values: ['hearid', 'default', 'custom'],
            initialValue: this._settingsItems['eq-mode'],
            hasButton: true,
            buttonIcon: 'bbm-eq-symbolic',
            buttonTooltip: _('Custom Equalizer'),
            buttonVisibleFor: ['custom'],
        });
        group.add(this._eqDropdown);

        this._eq = createEqualizer('eq-custom');
        this._eq.connect('eq-changed', (_w, arr) => {
            this._eqDropdown.selected_item = 'custom';
            this._updateGsettings('eq-custom', arr);
        });
        this._eqDropdown.connect('button-clicked', () => this._eq.present(this));
        this._eqDropdown.connect('notify::selected-item', () => {
            const mode = this._eqDropdown.selected_item;
            if (mode !== undefined && mode !== this._settingsItems['eq-mode'])
                this._updateGsettings('eq-mode', mode);
            this._updateEqualizerRows();
        });

        // Saved custom equalizers; the one shown as selected is the one matching the bands
        this._profileRow = new DropDownRowWidget({
            title: _('Saved Equalizers'),
            options: [_('Not saved')],
            values: [''],
            initialValue: '',
        });
        this._profileRow.connect('notify::selected-item', () => {
            const name = this._profileRow.selected_item;
            const profile = this._profiles().find(p => p.name === name);
            if (profile && this._bandsKey(profile.bands) !==
                    this._bandsKey(this._settingsItems['eq-custom'])) {
                this._updateGsettingsMany({'eq-mode': 'custom', 'eq-custom': profile.bands});
                this._eq.setValues(profile.bands);
            }
        });
        group.add(this._profileRow);

        this._saveProfileRow = new Adw.ActionRow({
            title: _('Save Equalizer'),
        });
        const saveButton = new Gtk.Button({
            label: _('Save'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        saveButton.connect('clicked', () => this._askProfileName());
        this._saveProfileRow.add_suffix(saveButton);
        group.add(this._saveProfileRow);

        this._deleteProfileRow = new Adw.ActionRow({
            title: _('Delete Saved Equalizer'),
        });
        const deleteButton = new Gtk.Button({
            label: _('Delete'),
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        deleteButton.connect('clicked', () => this._deleteSelectedProfile());
        this._deleteProfileRow.add_suffix(deleteButton);
        group.add(this._deleteProfileRow);

        const presetLabels = this._presetLabels();
        const presetValues = EqPresets.map(p => p.id);

        // Default: one of the presets of the earbuds
        this._presetRow = new DropDownRowWidget({
            title: _('Equalizer Preset'),
            options: presetLabels,
            values: presetValues,
            initialValue: this._settingsItems['eq-preset'],
        });
        this._presetRow.connect('notify::selected-item', () => {
            const value = this._presetRow.selected_item;
            if (value !== undefined && value !== this._settingsItems['eq-preset'])
                this._updateGsettings('eq-preset', value);
        });
        group.add(this._presetRow);

        // HearID: initial curve, custom curve or the curve of a favourite music genre
        this._hearTypeRow = new DropDownRowWidget({
            title: _('HearID'),
            options: [_('Initial Curve'), _('Custom HearID'), _('Favorite Music Genre')],
            values: ['initial', 'custom', 'genre'],
            initialValue: this._settingsItems['hearid-type'],
            hasButton: true,
            buttonIcon: 'bbm-eq-symbolic',
            buttonTooltip: _('Custom Equalizer'),
            buttonVisibleFor: ['custom'],
        });
        this._hearEq = createEqualizer('hearid-custom');
        this._hearEq.connect('eq-changed', (_w, arr) => {
            this._hearTypeRow.selected_item = 'custom';
            this._updateGsettings('hearid-custom', arr);
        });
        this._hearTypeRow.connect('button-clicked', () => this._hearEq.present(this));
        this._hearTypeRow.connect('notify::selected-item', () => {
            const value = this._hearTypeRow.selected_item;
            if (value !== undefined && value !== this._settingsItems['hearid-type'])
                this._updateGsettings('hearid-type', value);
            this._updateEqualizerRows();
        });
        group.add(this._hearTypeRow);

        this._genreRow = new DropDownRowWidget({
            title: _('Favorite Music Genre'),
            options: presetLabels,
            values: presetValues,
            initialValue: this._settingsItems['hearid-genre'],
        });
        this._genreRow.connect('notify::selected-item', () => {
            const value = this._genreRow.selected_item;
            if (value !== undefined && value !== this._settingsItems['hearid-genre'])
                this._updateGsettings('hearid-genre', value);
        });
        group.add(this._genreRow);

        this._updateEqualizerRows();
    }

    _presetLabels() {
        const labels = {
            SoundcoreSignature: _('Anker Signature'),
            Acoustic: _('Acoustic'),
            BassBooster: _('Bass Boost'),
            BassReducer: _('Bass Reducer'),
            Classical: _('Classical'),
            Podcast: _('Podcast'),
            Dance: _('Dance'),
            Deep: _('Deep'),
            Electronic: _('Electronic'),
            Flat: _('Flat'),
            HipHop: _('Hip Hop'),
            Jazz: _('Jazz'),
            Latin: _('Latin'),
            Lounge: _('Lounge'),
            Piano: _('Piano'),
            Pop: _('Pop'),
            RnB: _('R&B'),
            Rock: _('Rock'),
            SmallSpeakers: _('Small Speaker(s)'),
            SpokenWord: _('Spoken Word'),
            TrebleBooster: _('Treble Boost'),
            TrebleReducer: _('Treble Reducer'),
        };
        return EqPresets.map(p => labels[p.key]);
    }

    _profiles() {
        return this._settingsItems['eq-profiles'] ?? [];
    }

    _bandsKey(bands) {
        return bands.map(v => Math.round(v * 10)).join(',');
    }

    _selectedProfile() {
        const key = this._bandsKey(this._settingsItems['eq-custom']);
        return this._profiles().find(p => this._bandsKey(p.bands) === key) ?? null;
    }

    _refreshProfileRow() {
        const profiles = this._profiles();
        const selected = this._selectedProfile();
        this._profileRow.updateList(
            [_('Not saved'), ...profiles.map(p => p.name)],
            ['', ...profiles.map(p => p.name)],
            selected?.name ?? '');
        this._deleteProfileRow.visible = selected !== null &&
            this._settingsItems['eq-mode'] === 'custom';
    }

    _askProfileName() {
        const entry = new Gtk.Entry({
            placeholder_text: _('Name'),
            text: this._selectedProfile()?.name ?? '',
            max_length: 32,
            activates_default: true,
        });
        const dialog = new Adw.AlertDialog({
            heading: _('Save Equalizer'),
            body: _('Enter a name for the new custom equalizer profile'),
        });
        dialog.set_extra_child(entry);
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', _('Save'));
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('save');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            const name = entry.text.trim();
            if (response !== 'save' || name === '')
                return;

            const bands = [...this._settingsItems['eq-custom']];
            const profiles = this._profiles().filter(p => p.name !== name);
            profiles.push({name, bands});
            this._updateGsettingsMany({'eq-profiles': profiles});
        });
        dialog.present(this);
    }

    _deleteSelectedProfile() {
        const selected = this._selectedProfile();
        if (!selected)
            return;

        this._updateGsettingsMany({
            'eq-profiles': this._profiles().filter(p => p.name !== selected.name),
        });
    }

    // Only the rows that belong to the selected sound effect are shown
    _updateEqualizerRows() {
        const mode = this._settingsItems['eq-mode'];
        this._profileRow.visible = mode === 'custom';
        this._saveProfileRow.visible = mode === 'custom';
        this._refreshProfileRow();
        this._presetRow.visible = mode === 'default';
        this._hearTypeRow.visible = mode === 'hearid';
        this._genreRow.visible = mode === 'hearid' && this._settingsItems['hearid-type'] === 'genre';
    }

    _addTouchControls(page) {
        if (!this._modelData.buttons)
            return;

        const actionValues = [
            'play-pause', 'next', 'previous', 'volume-up', 'volume-down', 'ambient',
            'voice-assistant', 'none', TouchActionCustom,
        ];
        const actionLabels = [
            _('Play / Pause'), _('Next Track'), _('Previous Track'), _('Volume Up'),
            _('Volume Down'), _('Noise Control'), _('Voice Assistant'), _('No Action'),
            _('Custom'),
        ];
        const presses = [
            ['single', _('Single Tap')],
            ['double', _('Double Tap')],
            ['triple', _('Triple Tap')],
            ['long', _('Press and Hold')],
        ];

        for (const [side, title] of [['left', _('Left Earbud')], ['right', _('Right Earbud')]]) {
            const group = new Adw.PreferencesGroup({title, description: _('Button Controls')});
            page.add(group);

            for (const [press, pressTitle] of presses) {
                this._addDropdown(group, `gesture-${press}-${side}`, pressTitle, '',
                    actionLabels, actionValues);
            }
        }

        if ('cycle-nc' in this._settingsItems) {
            const cycleGroup = new Adw.PreferencesGroup({
                title: _('Cycle Through Modes'),
                description: _('Select modes to cycle through'),
            });
            page.add(cycleGroup);

            this._addSwitch(cycleGroup, 'cycle-nc', _('Noise Cancellation'), '');
            this._addSwitch(cycleGroup, 'cycle-normal', _('Off'), '');
            this._addSwitch(cycleGroup, 'cycle-transparency', _('Transparency'), '');
        }
    }

    _addDevMgmtSetting(page) {
        if (!this._modelData.dualConnection)
            return;

        const group = new Adw.PreferencesGroup({title: _('Connection Management')});
        page.add(group);

        this._devMgmtRow = new DeviceManagementRow(this, this._settingsItems['dev-mgmt'] ?? [],
            '', '', {
                maxConnected: this._modelData.maxConnected ?? 2,
                hasMultipointSwitch: true,
                showMac: true,
                refreshOnWindowOpen: true,
            });

        this._seq = this._settingsItems['dev-mgmt-action']?.seq ?? 0;
        this._devMgmtRow.connect('device-action', (_row, action, id) => {
            this._updateGsettings('dev-mgmt-action', {seq: this._seq ^= 1, action, id});
        });

        this._devMgmtRow.active = this._settingsItems['dual-conn'] ?? true;
        this._devMgmtRow.connect('notify::active', () => {
            if (this._settingsItems['dual-conn'] !== this._devMgmtRow.active)
                this._updateGsettings('dual-conn', this._devMgmtRow.active);
        });
        this._devMgmtRow.sensitive = !this._settingsItems['ldac'];

        group.add(this._devMgmtRow);
    }

    _readSettingsItems() {
        const list = this._settings.get_strv(SettingsKey).map(JSON.parse);
        return list.find(info => info.path === this._devicePath);
    }

    _updateGsettingsMany(values) {
        const pairedDevice = this._settings.get_strv(SettingsKey);
        const index = pairedDevice.findIndex(item => JSON.parse(item).path === this._devicePath);
        if (index === -1)
            return;

        pairedDevice[index] = JSON.stringify({...JSON.parse(pairedDevice[index]), ...values});
        this._settings.set_strv(SettingsKey, pairedDevice);
    }

    _updateGsettings(key, value) {
        const pairedDevice = this._settings.get_strv(SettingsKey);
        const existingPathIndex =
                pairedDevice.findIndex(item => JSON.parse(item).path === this._devicePath);
        if (existingPathIndex !== -1) {
            const existingItem = JSON.parse(pairedDevice[existingPathIndex]);
            existingItem[key] = value;
            pairedDevice[existingPathIndex] = JSON.stringify(existingItem);
            this._settings.set_strv(SettingsKey, pairedDevice);
        }
    }
});
