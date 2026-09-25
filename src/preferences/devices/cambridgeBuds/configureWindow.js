'use strict';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {
    supportedAudioSingleIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';
import {
    EqPresets, EqPresetCustom, VoicePrompt, TouchActionCustom
} from '../../../lib/devices/cambridgeBuds/cambridgeBudsConfig.js';

const SettingsKey = 'cambridge-buds-list';

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_CambridgeBudsConfigureWindow',
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

        this._settingsItems = this._readSettingsItems();
        if (!this._settingsItems)
            return;

        this.title = this._settingsItems.alias;

        const toolViewBar = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        const page = new Adw.PreferencesPage();

        toolViewBar.add_top_bar(headerBar);
        toolViewBar.set_content(page);
        this.set_content(toolViewBar);

        const iconSelector = new IconSelectorWidget({
            iconList: supportedAudioSingleIcons,
            initialIcon: this._settingsItems['icon'] || 'earbuds',
            caseIconList: supportedCaseIcons,
            initialCaseIcon: this._settingsItems['case'] || 'case-normal',
            mac,
            fw: this._settingsItems['fw-version'] || '',
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

        const soundGroup = new Adw.PreferencesGroup({title: _('Sound')});
        page.add(soundGroup);

        if ('eq-preset' in this._settingsItems) {
            this._eqPresetLabels = {
                flat: _('Flat'),
                blues: _('Blues'),
                electronic: _('Electronic'),
                natural: _('Natural'),
                rock: _('Rock'),
                voice: _('Voice'),
                [EqPresetCustom]: _('Custom'),
            };

            const values = [...EqPresets.map(p => p.id), EqPresetCustom];
            const options = values.map(v => this._eqPresetLabels[v]);
            this._eqDropdown = new DropDownRowWidget({
                title: _('Equalizer Preset'),
                subtitle: _('Change the sound signature'),
                options,
                values,
                initialValue: this._settingsItems['eq-preset'],
            });
            this._eqDropdown.connect('notify::selected-item', () => {
                const preset = this._eqDropdown.selected_item;
                if (preset === undefined || preset === EqPresetCustom ||
                        preset === this._settingsItems['eq-preset'])
                    return;

                this._updateGsettings('eq-preset', preset);
            });
            soundGroup.add(this._eqDropdown);
        }

        this._addSwitch(soundGroup, 'dynamic-eq', _('Dynamic EQ'),
            _('Adjusts the tonal balance at low volume'));
        this._addSwitch(soundGroup, 'mono', _('Mono Audio'),
            _('Play the same audio in both earbuds'));
        this._addSwitch(soundGroup, 'ldac', _('LDAC'),
            _('High resolution codec. The earbuds reconnect when this changes'));
        this._addSwitch(soundGroup, 'gaming-mode', _('Gaming Mode'),
            _('Reduces audio latency'));

        const settingsGroup = new Adw.PreferencesGroup({title: _('Settings')});
        page.add(settingsGroup);

        this._addSwitch(settingsGroup, 'wear-detection', _('Wear Detection'),
            _('Pause playback when an earbud is removed'));
        this._addSwitch(settingsGroup, 'sleep-mode', _('Sleep Mode'),
            _('Disable touch controls and prompts while sleeping'));

        this._addDropdown(settingsGroup, 'voice-prompt', _('Audible Feedback'),
            _('Voice prompt language'),
            [
                _('Off'), _('Tones'), _('English'), _('German'), _('French'), _('Spanish'),
                _('Italian'), _('Mandarin'), _('Cantonese'), _('Korean'), _('Southwark'),
            ],
            [
                VoicePrompt.OFF, VoicePrompt.TONES, VoicePrompt.ENGLISH, VoicePrompt.GERMAN,
                VoicePrompt.FRENCH, VoicePrompt.SPANISH, VoicePrompt.ITALIAN,
                VoicePrompt.MANDARIN, VoicePrompt.CANTONESE, VoicePrompt.KOREAN,
                VoicePrompt.SOUTHWARK,
            ]);

        this._addDropdown(settingsGroup, 'auto-power-off', _('Auto Power Off'),
            _('Turn off when not in use'),
            [_('Never'), _('30 minutes'), _('60 minutes')],
            [0, 30, 60]);

        const touchActionValues = [
            'play-pause', 'next', 'previous', 'volume-up', 'volume-down', 'ambient',
            'voice-assistant', 'none', TouchActionCustom,
        ];
        const touchActionLabels = [
            _('Play / Pause'), _('Next Track'), _('Previous Track'), _('Volume Up'),
            _('Volume Down'), _('Noise Control'), _('Voice Assistant'), _('Unassigned'),
            _('Custom'),
        ];
        const gestureRows = [
            ['single', _('Single Tap')],
            ['double', _('Double Tap')],
            ['triple', _('Triple Tap')],
            ['long', _('Press and Hold')],
        ];

        for (const [side, title] of [['left', _('Left Earbud')], ['right', _('Right Earbud')]]) {
            if (!(`gesture-single-${side}` in this._settingsItems))
                continue;

            const group = new Adw.PreferencesGroup({
                title,
                description: _('Touch controls'),
            });
            page.add(group);

            for (const [gesture, gestureTitle] of gestureRows) {
                this._addDropdown(group, `gesture-${gesture}-${side}`, gestureTitle, '',
                    touchActionLabels, touchActionValues);
            }
        }

        const settingSignalId = this._settings.connect(`changed::${SettingsKey}`, () => {
            this._settingsItems = this._readSettingsItems();
            if (!this._settingsItems)
                return;

            this.title = this._settingsItems.alias;

            for (const [key, row] of Object.entries(this._switches))
                row.active = this._settingsItems[key];

            for (const [key, row] of Object.entries(this._dropdowns))
                row.selected_item = this._settingsItems[key];

            if (this._eqDropdown)
                this._eqDropdown.selected_item = this._settingsItems['eq-preset'];
        });

        this.connect('close-request', () => {
            if (settingSignalId && this._settings)
                this._settings.disconnect(settingSignalId);

            this._settings = null;

            return false;
        });
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

    _readSettingsItems() {
        const list = this._settings.get_strv(SettingsKey).map(JSON.parse);
        return list.find(info => info.path === this._devicePath);
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
