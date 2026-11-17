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
import {SliderRowWidget} from './../../widgets/sliderRowWidget.js';
import {RingMyBudsRow} from './../../widgets/ringMyBudsRow.js';
import {
    EarfunModels, AmbientMode, TransparencyMode, Codec, MicMode, TouchMode, GestureActions,
    CallActions, EqPresets, EqFrequencies, EqRange, AdvancedAudio, FindDevice, DeviceNameMaxBytes
} from '../../../lib/devices/earfunBuds/earfunBudsConfig.js';

const SettingsKey = 'earfun-buds-list';

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_EarfunBudsConfigureWindow',
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

        this._modelData = EarfunModels.find(m => m.name === this._settingsItems.modelId) ??
            EarfunModels[0];

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

        const soundPage = new Adw.PreferencesPage();
        const controlsPage = new Adw.PreferencesPage();
        const devicePage = new Adw.PreferencesPage();
        stack.add_titled_with_icon(soundPage, 'sound', _('Sound Settings'), 'bbm-eq-symbolic');
        stack.add_titled_with_icon(controlsPage, 'controls', _('Gesture Controls'),
            'bbm-edit-symbolic');
        stack.add_titled_with_icon(devicePage, 'device', _('Device'), 'bbm-settings-symbolic');

        this._addSoundPage(soundPage);
        this._addControlsPage(controlsPage);
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

            this._eq?.setValues(this._settingsItems['eq-custom']);
            this._syncRingRow();
            this._updateVisibility();
        });

        this.connect('close-request', () => {
            // Never leave the tone playing
            if (this._settingsItems?.['find-device'])
                this._updateGsettings('find-device', FindDevice.OFF);

            for (const row of Object.values(this._sliders))
                row.destroy();

            this._eq?.destroy();
            this._eq = null;

            if (settingSignalId && this._settings)
                this._settings.disconnect(settingSignalId);

            this._settings = null;

            return false;
        });
    }

    _addSoundPage(page) {
        const ambientGroup = new Adw.PreferencesGroup({title: _('Ambient Sound')});
        page.add(ambientGroup);

        this._addDropdown(ambientGroup, 'ambient-mode', _('Mode'), '',
            [_('Off'), _('Noise Cancellation'), _('Transparency')],
            [AmbientMode.OFF, AmbientMode.ANC, AmbientMode.TRANSPARENCY]);
        this._addDropdown(ambientGroup, 'anc-type', _('Noise Cancellation Type'), '',
            [_('Adaptive (Ear Canal)'), _('Adaptive (Environment)'), _('Manual'),
                _('Wind Noise Reduction')],
            ['ear', 'env', 'manual', 'wind']);
        this._addSlider(ambientGroup, 'anc-level', _('Noise Cancellation Level'), '', [1, 4, 1]);
        this._addDropdown(ambientGroup, 'transparency-mode', _('Transparency Type'), '',
            [_('Standard'), _('Natural')],
            [TransparencyMode.STANDARD, TransparencyMode.NATURAL]);

        const effectsGroup = new Adw.PreferencesGroup({title: _('Audio Effects')});
        page.add(effectsGroup);
        this._addEqualizer(effectsGroup);

        const soundGroup = new Adw.PreferencesGroup({title: _('Sound Settings')});
        page.add(soundGroup);
        this._addSwitch(soundGroup, 'game-mode', _('Game Mode'),
            _('Reduces audio latency, but may affect the connection stability'));
        this._addDropdown(soundGroup, 'volume-limit', _('Volume Limit'),
            _('Limits the maximum volume of the earbuds'),
            [_('No limit'), '90 %', '80 %', '70 %', '60 %', '50 %'],
            [0, 1, 2, 3, 4, 5]);
        this._addSlider(soundGroup, 'balance', _('Balance'),
            _('Volume balance between the left and the right earbud'), [0, 100, 1], [
                {mark: 0, label: _('L')},
                {mark: 50, label: '0'},
                {mark: 100, label: _('R')},
            ]);
        this._addDropdown(soundGroup, 'voice-prompt', _('Voice Prompt Volume'), '',
            [_('Loudest'), _('Loud'), _('Medium'), _('Quiet'), _('Quietest')],
            [0, 1, 2, 3, 4]);
    }

    _addEqualizer(group) {
        const presetLabels = {
            standard: _('Standard'), rock: _('Rock'), pop: _('Pop'), country: _('Country'),
            rnb: _('R&B'), classical: _('Classical'), jazz: _('Jazz'),
            electronic: _('Electronic'), dance: _('Dance'), hiphop: _('Hip-Hop'),
            metal: _('Metal'), blues: _('Blues'), soul: _('Soul'), hits: _('Hits'),
            latin: _('Latin'), natural: _('Natural'), 'voice-boost': _('Voice Boost'),
            'voice-reduce': _('Voice Reduction'), 'bass-boost-1': _('Bass Boost 1'),
            'bass-boost-2': _('Bass Boost 2'), 'bass-boost-3': _('Bass Boost 3'),
            'bass-cut-1': _('Bass Reduction 1'), 'bass-cut-2': _('Bass Reduction 2'),
            'bass-cut-3': _('Bass Reduction 3'), 'treble-boost-1': _('Treble Boost 1'),
            'treble-boost-2': _('Treble Boost 2'), 'treble-boost-3': _('Treble Boost 3'),
            'treble-cut-1': _('Treble Reduction 1'), 'treble-cut-2': _('Treble Reduction 2'),
            'treble-cut-3': _('Treble Reduction 3'), original: _('Original Sound'),
        };

        const freqs = EqFrequencies.map(f => f >= 1000 ? `${f / 1000}k` : `${f}`);
        this._eq = new EqualizerWidget({
            freqs,
            initialValues: this._settingsItems['eq-custom'],
            range: EqRange,
            step: 0.5,
            digits: 1,
            topBarTitle: _('Frequency (Hz)'),
            bottomBarTitle: _('Gain (dB)'),
        });
        this._eq.setValues(this._settingsItems['eq-custom']);
        this._eq.connect('eq-changed', (_w, arr) => {
            this._eqModeRow.selected_item = 'custom';
            this._updateGsettings('eq-custom', arr);
        });

        this._eqModeRow = new DropDownRowWidget({
            title: _('Equalizer'),
            subtitle: _('Choose a preset or your own curve'),
            options: [_('Preset'), _('Custom Equalizer')],
            values: ['preset', 'custom'],
            initialValue: this._settingsItems['eq-mode'],
            hasButton: true,
            buttonIcon: 'bbm-eq-symbolic',
            buttonTooltip: _('Custom Equalizer'),
            buttonVisibleFor: ['custom'],
        });
        this._eqModeRow.connect('button-clicked', () => this._eq.present(this));
        this._eqModeRow.connect('notify::selected-item', () => {
            const mode = this._eqModeRow.selected_item;
            if (mode !== undefined && mode !== this._settingsItems['eq-mode'])
                this._updateGsettings('eq-mode', mode);
            this._updateVisibility();
        });
        group.add(this._eqModeRow);
        this._dropdowns['eq-mode'] = this._eqModeRow;

        this._addDropdown(group, 'eq-preset', _('Equalizer Preset'), '',
            EqPresets.map(([key]) => presetLabels[key]),
            EqPresets.map((_p, index) => index));
    }

    _addControlsPage(page) {
        const touchGroup = new Adw.PreferencesGroup({title: _('Touch Control')});
        page.add(touchGroup);
        this._addDropdown(touchGroup, 'touch-mode', _('Touch Control'),
            _('Turns off touch control of one or both earbuds'),
            [_('Both earbuds'), _('Disabled'), _('Right earbud only'), _('Left earbud only')],
            [TouchMode.BOTH, TouchMode.NONE, TouchMode.RIGHT_ONLY, TouchMode.LEFT_ONLY]);

        const shortLabels = [
            _('Volume Up'), _('Volume Down'), _('Next Track'), _('Previous Track'),
            _('Play / Pause'), _('Voice Assistant'), _('Noise Control'), _('No Action'),
        ];
        const shortValues = [
            GestureActions.VOLUME_UP, GestureActions.VOLUME_DOWN, GestureActions.NEXT,
            GestureActions.PREVIOUS, GestureActions.PLAY_PAUSE, GestureActions.VOICE_ASSISTANT,
            GestureActions.NOISE_CONTROL, GestureActions.NONE,
        ];
        const longLabels = [...shortLabels.slice(0, 6), _('Game Mode'), _('Noise Control'),
            _('Redial'), _('No Action')];
        const longValues = [...shortValues.slice(0, 6), GestureActions.GAME_MODE,
            GestureActions.NOISE_CONTROL, GestureActions.REDIAL, GestureActions.NONE];

        const presses = [
            ['single', _('Single Tap'), shortLabels, shortValues],
            ['double', _('Double Tap'), shortLabels, shortValues],
            ['triple', _('Triple Tap'), shortLabels, shortValues],
            ['long', _('Press and Hold'), longLabels, longValues],
        ];

        for (const [side, title] of [['left', _('Left Earbud')], ['right', _('Right Earbud')]]) {
            const group = new Adw.PreferencesGroup({title, description: _('Button Controls')});
            page.add(group);

            for (const [press, pressTitle, labels, values] of presses) {
                this._addDropdown(group, `gesture-${press}-${side}`, pressTitle, '', labels,
                    values);
            }

            this._addDropdown(group, `gesture-calllong-${side}`, _('Press and Hold (Call)'), '',
                [_('Reject Call'), _('Mute Microphone')],
                [CallActions.REJECT, CallActions.MUTE]);
        }

        const inEarGroup = new Adw.PreferencesGroup({title: _('In-Ear Detection')});
        page.add(inEarGroup);
        this._addSwitch(inEarGroup, 'in-ear', _('In-Ear Detection'),
            _('Detects whether the earbuds are worn'));
        this._addSwitch(inEarGroup, 'auto-play-pause', _('Auto Play/Pause'),
            _('Pause when taken off, resume when put in'));
        this._addSwitch(inEarGroup, 'auto-answer', _('Automatic Call Answering'),
            _('Answer incoming calls when the earbuds are worn'));
        this._addSwitch(inEarGroup, 'high-sensitivity', _('Higher Sensitivity'),
            _('Improves detection with different ear shapes, but may trigger by mistake'));
    }

    _addDevicePage(page, mac) {
        const iconSelector = new IconSelectorWidget({
            iconList: supportedAudioSingleIcons,
            initialIcon: this._settingsItems['icon'] || this._modelData.budsIcon,
            caseIconList: supportedCaseIcons,
            initialCaseIcon: this._settingsItems['case'] || this._modelData.case,
            mac,
            fw: this._settingsItems['fw'] ?? '',
            lFw: '',
            rFw: '',
            serial: '',
        });

        iconSelector.connect('notify::selected-icon', () => {
            this._updateGsettings('icon', iconSelector.selected_icon);
        });
        iconSelector.connect('notify::selected-case-icon', () => {
            this._updateGsettings('case', iconSelector.selected_case_icon);
        });
        page.add(iconSelector);

        const findGroup = new Adw.PreferencesGroup({title: _('Find My Earbuds')});
        page.add(findGroup);
        this._addFindRow(findGroup);

        const settingsGroup = new Adw.PreferencesGroup({title: _('Settings')});
        page.add(settingsGroup);

        this._addNameRow(settingsGroup);
        this._addDropdown(settingsGroup, 'mic-mode', _('Microphone'),
            _('Use one earbud for calls or let the earbuds choose'),
            [_('Automatic'), _('Left earbud only'), _('Right earbud only')],
            [MicMode.AUTO, MicMode.LEFT, MicMode.RIGHT]);
        this._addSwitch(settingsGroup, 'multipoint', _('Multipoint Connection'),
            _('Connect to two devices at the same time. The earbuds restart when this ' +
              'changes. Turn it off to use LDAC'));
        this._addDropdown(settingsGroup, 'codec', _('Audio Quality'),
            _('Bluetooth codec. The earbuds restart and reconnect when this changes'),
            [_('Stable connection'), 'aptX', 'aptX Adaptive', 'aptX Adaptive Lossless',
                'LDAC'],
            [Codec.STABLE, Codec.APTX, Codec.APTX_ADAPTIVE, Codec.APTX_LOSSLESS, Codec.LDAC]);
        this._addDropdown(settingsGroup, 'advanced-audio', _('Connection Mode'),
            _('LE Audio also turns on Auracast. Game mode, aptX and LDAC may not work with ' +
              'LE Audio. The earbuds restart when this changes'),
            ['Google Fast Pair', 'LE Audio'],
            [AdvancedAudio.FAST_PAIR, AdvancedAudio.LE_AUDIO]);
    }

    // Both earbuds can play the tone on their own: the left button is the left earbud
    _addFindRow(group) {
        if (!('find-device' in this._settingsItems))
            return;

        this._ringRow = new RingMyBudsRow({dual: true});
        const apply = () => {
            const mode = (this._ringRow.statusLeft === 'playing' ? FindDevice.LEFT : 0) |
                (this._ringRow.status === 'playing' ? FindDevice.RIGHT : 0);
            this._updateGsettings('find-device', mode);
        };
        this._ringRow.connect('notify::status', apply);
        this._ringRow.connect('notify::status-left', apply);
        group.add(this._ringRow);
        this._syncRingRow();
    }

    _syncRingRow() {
        if (!this._ringRow)
            return;

        const mode = this._settingsItems['find-device'] ?? FindDevice.OFF;
        this._ringRow.statusLeft = mode & FindDevice.LEFT ? 'playing' : 'stopped';
        this._ringRow.status = mode & FindDevice.RIGHT ? 'playing' : 'stopped';
    }

    // The name is used by the earbuds only after they are paired again
    _addNameRow(group) {
        if (!('name-request' in this._settingsItems))
            return;

        const row = new Adw.EntryRow({
            title: _('Name of the earbuds'),
            text: this._settingsItems['alias'] ?? '',
            show_apply_button: true,
        });
        row.connect('apply', () => {
            const name = row.text.trim();
            if (name === '' || new TextEncoder().encode(name).length > DeviceNameMaxBytes)
                return;

            const dialog = new Adw.AlertDialog({
                heading: _('Change name?'),
                body: _('After changing the name, put the earbuds in the charging case and ' +
                        'close the lid for about 10 seconds. Remove the earbuds from the ' +
                        'Bluetooth devices of this computer and pair them again to use the ' +
                        'new name.'),
            });
            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('change', _('Change'));
            dialog.set_response_appearance('change', Adw.ResponseAppearance.SUGGESTED);
            dialog.set_default_response('cancel');
            dialog.set_close_response('cancel');
            dialog.connect('response', (_dialog, response) => {
                if (response !== 'change')
                    return;

                const seq = (this._settingsItems['name-request']?.seq ?? 0) + 1;
                this._updateGsettings('name-request', {seq, name});
            });
            dialog.present(this);
        });
        group.add(row);
    }

    // Shows only the rows that apply to the current modes
    _updateVisibility() {
        const items = this._settingsItems;
        const ambient = items['ambient-mode'];
        const isAnc = ambient === AmbientMode.ANC;

        const visible = {
            'anc-type': isAnc,
            'anc-level': isAnc && items['anc-type'] === 'manual',
            'transparency-mode': ambient === AmbientMode.TRANSPARENCY,
            'eq-preset': items['eq-mode'] === 'preset',
        };

        for (const [key, show] of Object.entries(visible)) {
            const row = this._switches[key] ?? this._dropdowns[key] ?? this._sliders[key];
            if (row)
                row.visible = show;
        }
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
            if (value !== undefined && value !== this._settingsItems[key])
                this._updateGsettings(key, value);
        });
        group.add(row);
        this._dropdowns[key] = row;
    }

    _addSlider(group, key, rowTitle, rowSubtitle, range, customMarks = null) {
        if (!(key in this._settingsItems))
            return;

        const marks = customMarks ?? [];
        if (!customMarks) {
            for (let i = range[0]; i <= range[1]; i += range[2])
                marks.push({mark: i, label: `${i}`});
        }

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
