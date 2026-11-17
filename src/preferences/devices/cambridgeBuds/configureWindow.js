'use strict';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {
    supportedAudioSingleIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';
import {EqualizerWidget} from './../../widgets/equalizerWidget.js';
import {
    VoicePrompt, TouchActionCustom, CambridgeBudsModelList
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

        this._modelData = CambridgeBudsModelList.find(m =>
            m.name === this._settingsItems.modelId) ?? null;

        if (!this._modelData)
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

        const soundGroup = new Adw.PreferencesGroup({title: _('Sound Settings')});
        page.add(soundGroup);

        if ('eq-preset' in this._settingsItems) {
            this._eqPresetLabels = {
                flat: _('Flat'),
                blues: _('Blues'),
                electronic: _('Electronic'),
                natural: _('Natural'),
                rock: _('Rock'),
                voice: _('Voice'),
                custom: _('Custom'),
            };

            let customEqButton = {};
            const values = [...Object.keys(this._modelData.eq.presets)];

            if (this._modelData.eq?.custom) {
                values.push('custom');

                customEqButton = {
                    hasButton: true,
                    buttonIcon: 'bbm-eq-symbolic',
                    buttonTooltip: _('Custom Equalizer'),
                    buttonVisibleFor: ['custom'],
                };
            }

            const options = values.map(v => this._eqPresetLabels[v]);
            this._eqDropdown = new DropDownRowWidget({
                title: _('Equalizer Preset'),
                subtitle: _('Change the sound signature'),
                options,
                values,
                initialValue: this._settingsItems['eq-preset'],
                ...customEqButton,
            });

            soundGroup.add(this._eqDropdown);

            if (this._modelData.eq?.custom) {
                const freqLabels = {
                    60: _('60'),
                    120: _('120'),
                    500: _('500'),
                    1000: _('1k'),
                    2000: _('2k'),
                    4000: _('4k'),
                    10000: _('10k'),
                };

                const freqs = this._modelData.eq.freq.map(
                    freq => freqLabels[freq] ?? `${freq}`
                );

                const range = this._modelData.eq.range;

                const initialValues = this._settingsItems['eq-custom'];

                this._eq = new EqualizerWidget({
                    freqs,
                    initialValues,
                    range,
                    step: 0.1,
                    digits: 1,
                    topBarTitle: _('Frequency (Hz)'),
                    bottomBarTitle: _('Gain (dB)'),
                });

                this._eq.connect('eq-changed', (_w, arr) => {
                    this._eqDropdown.selected_item = 'custom';
                    this._updateGsettings('eq-custom', arr);
                });

                this._eqDropdown.connect('button-clicked', () => {
                    this._eq.present(this);
                });
            }

            this._eqDropdown.connect('notify::selected-item', () => {
                const preset = this._eqDropdown.selected_item;
                if (preset === undefined || preset === this._settingsItems['eq-preset'])
                    return;

                this._updateGsettings('eq-preset', preset);

                if (preset === 'custom')
                    return;

                const eqValues = this._modelData.eq?.presets?.[preset];
                if (eqValues && this._eq) {
                    this._updateGsettings('eq-custom', eqValues);
                    this._eq.setValues(eqValues);
                }
            });
        }

        this._addSwitch(soundGroup, 'dynamic-eq', _('Dynamic EQ'),
            _('Adjusts the tonal balance at low volume'));
        this._addSwitch(soundGroup, 'mono', _('Mono Audio'),
            _('Play the same audio in both earbuds'));
        this._addSwitch(soundGroup, 'ldac', _('LDAC'),
            _('High resolution codec. The earbuds reconnect when this changes'));
        this._addSwitch(soundGroup, 'gaming-mode', _('Gaming Mode'),
            _('Reduces latency and enhances in-game audio'));

        const settingsGroup = new Adw.PreferencesGroup({title: _('Settings')});
        page.add(settingsGroup);

        this._addSwitch(settingsGroup, 'wear-detection', _('Wear Detection'),
            _('Pause Media When Not Worn'));
        this._addSwitch(settingsGroup, 'sleep-mode', _('Sleep Mode'),
            _('Disable touch controls and prompts while sleeping'));

        this._addDropdown(settingsGroup, 'voice-prompt', _('Audible Feedback'),
            _('Select the language for voice prompts'),
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
            _('Automatically power off when not worn'),
            [_('Never'), _('30 minutes'), _('60 minutes')],
            [0, 30, 60]);

        const touchActionValues = [
            'play-pause', 'next', 'previous', 'volume-up', 'volume-down', 'ambient',
            'voice-assistant', 'none', TouchActionCustom,
        ];
        const touchActionLabels = [
            _('Play / Pause'), _('Next Track'), _('Previous Track'), _('Volume Up'),
            _('Volume Down'), _('Noise Control'), _('Voice Assistant'), _('No Action'),
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

            if (this._eq && this._settingsItems['eq-custom'])
                this._eq.setValues(this._settingsItems['eq-custom']);
        });

        this.connect('close-request', () => {
            this._eq?.destroy();
            this._eq = null;

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
