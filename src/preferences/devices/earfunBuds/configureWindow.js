'use strict';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {
    supportedAudioSingleIcons, supportedAudioDualIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';
import {EqualizerWidget} from './../../widgets/equalizerWidget.js';
import {SliderRowWidget} from './../../widgets/sliderRowWidget.js';
import {RingMyBudsRow} from './../../widgets/ringMyBudsRow.js';
import {
    EarfunModels, AmbientMode, TransparencyMode, Codec, MicMode, TouchMode, GestureActions,
    CallActions, EqPresets, EqFrequencies, EqRange, AdvancedAudio, FindDevice, DeviceNameMaxBytes,
    PlaybackDevice
} from '../../../lib/devices/earfunBuds/earfunBudsConfig.js';
import {checkFirmware, fetchVoicePacks, downloadVoicePack} from '../../../lib/devices/earfunBuds/earfunServer.js';

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

        this._buildLayout(mac);
        this._updateVisibility();

        const settingSignalId = this._settings.connect(`changed::${SettingsKey}`, () => {
            this._settingsItems = this._readSettingsItems();
            if (!this._settingsItems)
                return;

            this.title = this._settingsItems.alias;
            this._sidebarTitle.title = this._settingsItems.alias;

            for (const [key, row] of Object.entries(this._switches))
                row.active = this._settingsItems[key];

            for (const [key, row] of Object.entries(this._dropdowns))
                row.selected_item = this._settingsItems[key];

            for (const [key, row] of Object.entries(this._sliders))
                row.value = this._settingsItems[key];

            this._eq?.setValues(this._settingsItems['eq-custom']);
            this._syncRingRow();
            this._syncHero();
            this._syncInfo();
            this._updateVisibility();
            this._channelBanner.revealed = !!this._settingsItems['channel-busy'];
            this._syncDevices();
            this._syncUpgrade();
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

    // Navigation rail on the left (a list of the pages when the window is narrow) and the
    // pages on the right
    _buildLayout(mac) {
        this._mac = mac;
        this._split = new Adw.NavigationSplitView({
            min_sidebar_width: 64,
            max_sidebar_width: 64,
        });

        this._pages = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.NONE,
            hexpand: true,
            vexpand: true,
        });
        this._navList = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            css_classes: ['navigation-sidebar'],
        });
        this._navRows = [];

        const definitions = [
            ['home', _('Home'), 'go-home-symbolic', page => this._addHomePage(page)],
            ['noise', _('Noise Control'), 'bbm-anc-on-symbolic',
                page => this._addNoisePage(page)],
            ['equalizer', _('Equalizer'), 'bbm-eq-symbolic',
                page => this._addEqualizerPage(page)],
            ['find', _('Find My Earbuds'), 'bbm-bell-symbolic', page => this._addFindPage(page)],
            ['gestures', _('Gestures'), 'bbm-edit-symbolic',
                page => this._addGesturesPage(page)],
            ['advanced', _('Advanced Settings'), 'bbm-settings-symbolic',
                page => this._addAdvancedPage(page)],
            ['system', _('System'), 'bbm-device-mgmt-symbolic',
                page => this._addSystemPage(page)],
        ];
        this._pageDefinitions = definitions;

        for (const [id, title, icon, build] of definitions) {
            const page = new Adw.PreferencesPage();
            build(page);
            this._pages.add_named(page, id);

            const row = new Gtk.ListBoxRow({tooltip_text: title});
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                margin_top: 10,
                margin_bottom: 10,
                margin_start: 8,
                margin_end: 8,
            });
            box.append(new Gtk.Image({icon_name: icon, pixel_size: 20, halign: Gtk.Align.CENTER}));
            const label = new Gtk.Label({label: title, xalign: 0, hexpand: true, visible: false});
            box.append(label);
            row.set_child(box);
            row._id = id;
            row._title = title;
            row._label = label;
            this._navList.append(row);
            this._navRows.push(row);
        }

        this._sidebarTitle = new Adw.WindowTitle({title: this.title, subtitle: ''});
        this._sidebarTitle.visible = false;
        const sidebarToolbar = new Adw.ToolbarView();
        sidebarToolbar.add_top_bar(new Adw.HeaderBar({
            title_widget: this._sidebarTitle,
            show_end_title_buttons: false,
        }));
        sidebarToolbar.set_content(new Gtk.ScrolledWindow({
            child: this._navList,
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        }));
        this._split.sidebar = new Adw.NavigationPage({title: this.title, child: sidebarToolbar});

        this._contentTitle = new Adw.WindowTitle({title: definitions[0][1], subtitle: ''});
        const contentToolbar = new Adw.ToolbarView();
        contentToolbar.add_top_bar(new Adw.HeaderBar({
            title_widget: this._contentTitle,
            show_start_title_buttons: false,
        }));
        this._channelBanner = new Adw.Banner({
            title: _('The earbuds are in use by another app, for example the vendor app on a ' +
                     'phone. BudsLink keeps trying and applies the settings as soon as the ' +
                     'connection is free.'),
            revealed: !!this._settingsItems['channel-busy'],
        });
        contentToolbar.add_top_bar(this._channelBanner);
        contentToolbar.set_content(this._pages);
        this._split.content = new Adw.NavigationPage({title: this.title, child: contentToolbar});

        this._navList.connect('row-selected', (_list, row) => {
            if (!row)
                return;

            this._pages.set_visible_child_name(row._id);
            this._contentTitle.title = row._title;
        });
        this._navList.connect('row-activated', () => {
            if (this._split.collapsed)
                this._split.show_content = true;
        });
        this._navList.select_row(this._navRows[0]);

        // Narrow windows: the rail becomes a list of the pages with labels
        const breakpoint = new Adw.Breakpoint({
            condition: Adw.BreakpointCondition.parse('max-width: 560px'),
        });
        breakpoint.connect('apply', () => this._setCollapsed(true));
        breakpoint.connect('unapply', () => this._setCollapsed(false));
        this.add_breakpoint(breakpoint);

        this.set_content(this._split);
        this._syncHero();
    }

    _setCollapsed(collapsed) {
        this._split.collapsed = collapsed;
        this._split.min_sidebar_width = collapsed ? 200 : 64;
        this._split.max_sidebar_width = collapsed ? 400 : 64;
        this._sidebarTitle.visible = collapsed;
        for (const row of this._navRows)
            row._label.visible = collapsed;

        if (collapsed)
            this._split.show_content = false;
    }

    _showPage(id) {
        const row = this._navRows.find(r => r._id === id);
        if (!row)
            return;

        this._navList.select_row(row);
        if (this._split.collapsed)
            this._split.show_content = true;
    }

    _addHomePage(page) {
        const heroGroup = new Adw.PreferencesGroup();
        page.add(heroGroup);

        const hero = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 36,
            halign: Gtk.Align.CENTER,
            margin_top: 24,
            margin_bottom: 24,
        });
        this._hero = {};
        for (const [part, caption] of [['left', _('Left')], ['case', _('Case')],
            ['right', _('Right')]]) {
            const unit = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                halign: Gtk.Align.CENTER,
            });
            const icon = new Gtk.Image({pixel_size: 72, halign: Gtk.Align.CENTER});
            const level = new Gtk.Label({css_classes: ['title-2']});
            unit.append(icon);
            unit.append(level);
            unit.append(new Gtk.Label({label: caption, css_classes: ['dim-label']}));
            hero.append(unit);
            this._hero[part] = {icon, level};
        }
        heroGroup.add(hero);

        const navGroup = new Adw.PreferencesGroup();
        page.add(navGroup);
        for (const [id, title, icon] of this._pageDefinitions.slice(1)) {
            const row = new Adw.ActionRow({title, activatable: true});
            row.add_prefix(new Gtk.Image({icon_name: icon}));
            row.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
            row.connect('activated', () => this._showPage(id));
            navGroup.add(row);
        }

        const infoGroup = new Adw.PreferencesGroup();
        page.add(infoGroup);
        this._info = {};
        for (const [key, title] of [['fw', _('Firmware')],
            ['serial-left', _('Serial Number (Left)')],
            ['serial-right', _('Serial Number (Right)')]]) {
            const row = new Adw.ActionRow({title, subtitle_selectable: true});
            infoGroup.add(row);
            this._info[key] = row;
        }
        this._syncInfo();
    }

    // Firmware and serial numbers, shown only when the earbuds have reported them
    _syncInfo() {
        for (const [key, row] of Object.entries(this._info ?? {})) {
            const value = this._settingsItems[key] ?? '';
            row.subtitle = value;
            row.visible = value !== '';
        }
    }

    // Icons and battery levels of the three units on the home page
    _syncHero() {
        if (!this._hero)
            return;

        const items = this._settingsItems;
        const dual = supportedAudioDualIcons.includes(items['icon']) ? items['icon'] : 'earbuds';
        const icons = {
            left: `bbm-${dual}-left-symbolic`,
            right: `bbm-${dual}-right-symbolic`,
            case: `bbm-${items['case'] ?? this._modelData.case}-symbolic`,
        };
        for (const [part, widgets] of Object.entries(this._hero)) {
            widgets.icon.icon_name = icons[part];
            const level = items[`battery-${part}`] ?? 0;
            widgets.level.label = level > 0 ? `${level} %` : '–';
        }
    }

    _addNoisePage(page) {
        const ambientGroup = new Adw.PreferencesGroup({title: _('Ambient Sound')});
        page.add(ambientGroup);

        this._addDropdown(ambientGroup, 'ambient-mode', _('Mode'), '',
            [_('Off'), _('Noise Cancellation'), _('Transparency')],
            [AmbientMode.OFF, AmbientMode.ANC, AmbientMode.TRANSPARENCY]);
        this._addDescription(this._addDropdown(ambientGroup, 'anc-type',
            _('Noise Cancellation Type'), '',
            [_('Adaptive (Ear Canal)'), _('Adaptive (Environment)'), _('Manual'),
                _('Wind Noise Reduction')],
            ['ear', 'env', 'manual', 'wind']), ['ear', 'env', 'manual', 'wind'], [
            [_('Listens to the sound inside the ear canal and to whether the earbuds are ' +
               'worn, and adjusts the noise cancellation continuously.'),
                _('Technical: command 0x033A with value 0. The earbuds analyse the sound ' +
                  'measured in the ear canal and adjust the filter by themselves.')],
            [_('Listens to the noise around you and to whether the earbuds are worn, and ' +
               'adjusts the noise cancellation continuously.'),
                _('Technical: command 0x033A with value 4. The earbuds analyse the noise ' +
                  'measured outside and adjust the filter by themselves.')],
            [_('You choose the strength of the noise cancellation yourself, in four steps.'),
                _('Technical: command 0x033A with value 6, 5, 3 or 2 for the levels 1 to 4. ' +
                  'Level 4 (value 2) is the strongest.')],
            [_('For strong wind. It reduces wind noise, but the noise cancellation ' +
               'becomes less effective.'),
                _('Technical: command 0x033A with value 1. It replaces the other types, they ' +
                  'cannot be combined.')],
        ]);
        this._addSlider(ambientGroup, 'anc-level', _('Noise Cancellation Level'), '', [1, 4, 1]);
        this._addDropdown(ambientGroup, 'transparency-mode', _('Transparency Type'), '',
            [_('Standard'), _('Natural')],
            [TransparencyMode.STANDARD, TransparencyMode.NATURAL]);
    }

    _addEqualizerPage(page) {
        const effectsGroup = new Adw.PreferencesGroup({title: _('Audio Effects')});
        page.add(effectsGroup);
        this._addEqualizer(effectsGroup);
    }

    _addFindPage(page) {
        const findGroup = new Adw.PreferencesGroup({title: _('Find My Earbuds')});
        page.add(findGroup);
        this._addFindRow(findGroup);
    }

    _addGesturesPage(page) {
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

            // During a call only the triple tap and press and hold can be set. Single and double
            // tap keep the settings above
            this._addDropdown(group, `gesture-calltriple-${side}`, _('Triple Tap (Call)'), '',
                [_('Answer / Switch Between Calls'), _('Mute Microphone'), _('Noise Control'),
                    _('No Action')],
                [CallActions.ANSWER_SWAP, CallActions.MUTE, CallActions.NOISE_CONTROL,
                    CallActions.NONE]);

            this._addDropdown(group, `gesture-calllong-${side}`, _('Press and Hold (Call)'), '',
                [_('Answer / Hang Up'), _('Reject Call'), _('Mute Microphone'),
                    _('Noise Control'), _('No Action')],
                [CallActions.ANSWER_HANGUP, CallActions.REJECT, CallActions.MUTE,
                    CallActions.NOISE_CONTROL, CallActions.NONE]);
        }
    }

    _addAdvancedPage(page) {
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
        this._addDropdown(soundGroup, 'mic-mode', _('Microphone'),
            _('Use one earbud for calls or let the earbuds choose'),
            [_('Automatic'), _('Left earbud only'), _('Right earbud only')],
            [MicMode.AUTO, MicMode.LEFT, MicMode.RIGHT]);
    }

    _serialText() {
        const left = this._settingsItems['serial-left'] ?? '';
        const right = this._settingsItems['serial-right'] ?? '';
        return left === right ? left : [left, right].filter(Boolean).join(' / ');
    }

    _addSystemPage(page) {
        const iconSelector = new IconSelectorWidget({
            iconList: supportedAudioSingleIcons,
            initialIcon: this._settingsItems['icon'] || this._modelData.budsIcon,
            caseIconList: supportedCaseIcons,
            initialCaseIcon: this._settingsItems['case'] || this._modelData.case,
            mac: this._mac,
            fw: this._settingsItems['fw'] ?? '',
            lFw: '',
            rFw: '',
            serial: this._serialText(),
        });

        iconSelector.connect('notify::selected-icon', () => {
            this._updateGsettings('icon', iconSelector.selected_icon);
        });
        iconSelector.connect('notify::selected-case-icon', () => {
            this._updateGsettings('case', iconSelector.selected_case_icon);
        });
        page.add(iconSelector);

        const settingsGroup = new Adw.PreferencesGroup({title: _('Settings')});
        page.add(settingsGroup);

        this._addNameRow(settingsGroup);
        this._addSwitch(settingsGroup, 'multipoint', _('Multipoint Connection'),
            _('Connect to two devices at the same time. Turn it off to use LDAC'),
            on => {
                if (!on || this._settingsItems['codec'] !== Codec.LDAC)
                    return null;

                return {
                    heading: _('Multipoint is not possible with LDAC'),
                    body: _('Choose another audio quality first, then turn multipoint on.'),
                };
            });
        const codecValues = [Codec.STABLE, Codec.APTX, Codec.APTX_ADAPTIVE, Codec.APTX_LOSSLESS,
            Codec.LDAC];
        this._addDescription(this._addDropdown(settingsGroup, 'codec', _('Audio Quality'), '',
            [_('Stable connection'), 'aptX', 'aptX Adaptive', 'aptX Adaptive Lossless',
                'LDAC'], codecValues, value => this._codecQuestion(value)), codecValues, [
            [_('Favours a steady connection over sound quality. Choose it if the sound ' +
               'stutters or drops out.'),
                _('Technical: command 0x032E with value 0. The same value is sent when aptX ' +
                  'or LDAC is turned off, so none of the aptX or LDAC variants is selected.')],
            [_('A Qualcomm codec with a higher data rate than common Bluetooth codecs. It ' +
               'works best with devices that have a Qualcomm chip.'),
                _('Technical: command 0x032E with value 1. About 352 kbit/s.')],
            [_('Adjusts the bit rate and the delay by itself to what you are doing and to ' +
               'the radio conditions.'),
                _('Technical: command 0x032E with value 3. The bit rate is not fixed.')],
            [_('Transmits CD quality at a high data rate. It needs a recent Qualcomm ' +
               'Snapdragon device; stay close and use the 5 GHz Wi-Fi band or turn Wi-Fi ' +
               'off.'),
                _('Technical: command 0x032E with value 0x13. Up to about 1,200 kbit/s.')],
            [_('High quality audio. It can shorten the battery life and cause stutter, so ' +
               'stay close. It cannot be used together with multipoint.'),
                _('Technical: command 0x032E with value 8. Up to about 990 kbit/s. The ' +
                  'vendor app asks for multipoint to be turned off first.')],
        ], _('The earbuds restart when this changes. They only offer the codec: your ' +
             'computer chooses the one in use together with the earbuds and must support it.'));
        this._addDropdown(settingsGroup, 'advanced-audio', _('Connection Mode'),
            _('LE Audio also turns on Auracast. Game mode, aptX and LDAC may not work with ' +
              'LE Audio. The earbuds restart when this changes'),
            ['Google Fast Pair', 'LE Audio'],
            [AdvancedAudio.FAST_PAIR, AdvancedAudio.LE_AUDIO],
            () => ({
                heading: _('Restart the earbuds?'),
                body: _('The earbuds restart when the connection mode changes. Music and ' +
                        'calls are interrupted for a few seconds.'),
                accept: _('Change'),
            }));

        this._addDevicesGroup(page);
        this._addUpgradeGroup(page);
    }

    // The devices that are known to the earbuds (multipoint): a switch connects or disconnects a
    // device, two buttons choose the device that plays, and one row starts pairing a new device
    _addDevicesGroup(page) {
        this._devicesGroup = new Adw.PreferencesGroup({
            title: _('Devices'),
            description: _('Devices that are or were connected to the earbuds'),
        });
        page.add(this._devicesGroup);
        this._deviceRows = [];

        this._pairRow = new Adw.ActionRow({
            title: _('Pair a New Device'),
            subtitle: _('Start the pairing mode so that another device can connect to the earbuds'),
        });
        this._pairButton = new Gtk.Button({
            label: _('Start'),
            valign: Gtk.Align.CENTER,
        });
        this._pairButton.connect('clicked', () => this._askPairing());
        this._pairRow.add_suffix(this._pairButton);
        this._devicesGroup.add(this._pairRow);

        this._syncDevices();
    }

    // Voice pack: a file that the earbuds take with the upgrade protocol of the chip. Firmware: the
    // server is only asked whether there is a newer one, nothing is installed
    _addUpgradeGroup(page) {
        const group = new Adw.PreferencesGroup({
            title: _('Voice Pack and Firmware'),
            description: _('The voice prompts of the earbuds are a file that is sent to them. ' +
                           'Choose one the server of the vendor offers, or a file you have.'),
        });
        page.add(group);
        this._upgradeGroup = group;
        this._packRows = [];

        this._packsRow = new Adw.ActionRow({
            title: _('Voice Packs of the Vendor'),
            subtitle: _('Load the list of languages from the server'),
        });
        this._packsButton = new Gtk.Button({label: _('Load'), valign: Gtk.Align.CENTER});
        this._packsButton.connect('clicked', () => this._loadVoicePacks());
        this._packsRow.add_suffix(this._packsButton);
        group.add(this._packsRow);

        this._voiceRow = new Adw.ActionRow({
            title: _('Install a Voice Pack'),
            subtitle: _('Send a voice pack file (.bin) to the earbuds'),
        });
        this._voiceButton = new Gtk.Button({label: _('Choose File…'), valign: Gtk.Align.CENTER});
        this._voiceButton.connect('clicked', () => this._chooseVoiceFile());
        this._voiceRow.add_suffix(this._voiceButton);
        group.add(this._voiceRow);

        this._upgradeRow = new Adw.ActionRow({title: _('Transfer'), visible: false});
        this._upgradeBar = new Gtk.ProgressBar({valign: Gtk.Align.CENTER, width_request: 160});
        this._upgradeRow.add_suffix(this._upgradeBar);
        this._upgradeCancel = new Gtk.Button({label: _('Cancel'), valign: Gtk.Align.CENTER});
        this._upgradeCancel.connect('clicked', () => this._requestUpgrade('cancel'));
        this._upgradeRow.add_suffix(this._upgradeCancel);
        group.add(this._upgradeRow);

        this._firmwareRow = new Adw.ActionRow({
            title: _('Firmware Update'),
            subtitle: _('Ask the server of the vendor whether a newer firmware exists. BudsLink ' +
                        'does not install firmware.'),
        });
        this._firmwareButton = new Gtk.Button({label: _('Check'), valign: Gtk.Align.CENTER});
        this._firmwareButton.connect('clicked', () => this._checkFirmware());
        this._firmwareRow.add_suffix(this._firmwareButton);
        group.add(this._firmwareRow);

        this._syncUpgrade();
    }

    async _loadVoicePacks() {
        this._packsButton.sensitive = false;
        this._packsRow.subtitle = _('Asking the server…');
        const result = await fetchVoicePacks();
        this._packsButton.sensitive = true;

        for (const row of this._packRows)
            this._upgradeGroup.remove(row);
        this._packRows = [];

        if (result.status !== 'ok' || result.packs.length === 0) {
            this._packsRow.subtitle = result.status === 'nokey'
                ? _('Not available: the key of the server is missing (see the documentation).')
                : _('The server could not be asked.');
            return;
        }

        this._packsRow.subtitle = _('Choose a language to install it');
        for (const pack of result.packs) {
            const row = new Adw.ActionRow({
                title: pack.name,
                subtitle: `${pack.file}, ${(pack.size / 1024).toFixed(0)} KB`,
            });
            const button = new Gtk.Button({label: _('Install'), valign: Gtk.Align.CENTER});
            button.connect('clicked', () => this._installPack(pack, button));
            row.add_suffix(button);
            this._upgradeGroup.add(row);
            this._packRows.push(row);
        }
    }

    _installPack(pack, button) {
        this._askVoiceInstall(async () => {
            button.sensitive = false;
            const path = await downloadVoicePack(pack);
            button.sensitive = true;
            if (path)
                this._requestUpgrade('start', {path});
            else
                this._ask({heading: _('The download failed'), body: _('The file could not be loaded.')}, () => {}, () => {});
        });
    }

    _askVoiceInstall(onAccept) {
        this._ask({
            heading: _('Install this voice pack?'),
            body: _('The file is sent to the earbuds, which takes about a minute, and ' +
                    'they restart at the end. Keep them in their case or in your ears, ' +
                    'close to the computer and charged, and do not turn them off or ' +
                    'disconnect them meanwhile.'),
            accept: _('Install'),
        }, onAccept, () => {});
    }

    _requestUpgrade(action, extra = {}) {
        const seq = (this._settingsItems['upgrade-request']?.seq ?? 0) + 1;
        this._updateGsettings('upgrade-request', {seq, action, ...extra});
    }

    _chooseVoiceFile() {
        const filter = new Gtk.FileFilter({name: _('Voice pack (*.bin)')});
        filter.add_pattern('*.bin');
        const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
        filters.append(filter);
        const dialog = new Gtk.FileDialog({title: _('Choose a Voice Pack'), filters});
        dialog.open(this, null, (_dialog, result) => {
            let file;
            try {
                file = dialog.open_finish(result);
            } catch {
                return;
            }
            const path = file.get_path();
            this._askVoiceInstall(() => this._requestUpgrade('start', {path}));
        });
    }

    _syncUpgrade() {
        if (!this._upgradeRow)
            return;

        const upgrade = this._settingsItems['upgrade-state'] ?? {};
        const busy = ['setup', 'sync', 'upload', 'validate', 'transferred', 'reboot', 'commit']
            .includes(upgrade.state);
        const texts = {
            setup: _('Connecting…'),
            sync: _('Connecting…'),
            upload: _('Sending the file…'),
            validate: _('The earbuds check the file…'),
            transferred: _('The earbuds apply the file…'),
            reboot: _('The earbuds restart. Wait until they connect again…'),
            commit: _('Finishing…'),
            done: _('The transfer is finished.'),
        };
        const failed = upgrade.state === 'failed';
        this._upgradeRow.visible = busy || failed || upgrade.state === 'done';
        this._upgradeRow.subtitle = failed
            ? `${_('The transfer failed:')} ${upgrade.error ?? ''}`
            : texts[upgrade.state] ?? '';
        this._upgradeBar.visible = busy;
        this._upgradeBar.fraction = (upgrade.percent ?? 0) / 100;
        this._upgradeCancel.visible = busy && upgrade.state !== 'reboot';
        const free = !busy && !this._settingsItems['channel-busy'];
        this._voiceButton.sensitive = free;
        for (const row of this._packRows ?? [])
            row.sensitive = free;
    }

    async _checkFirmware() {
        this._firmwareButton.sensitive = false;
        this._firmwareRow.subtitle = _('Asking the server…');
        const result = await checkFirmware(this._settingsItems['fw'] ?? '');
        this._firmwareButton.sensitive = true;

        const texts = {
            current: _('The firmware is up to date.'),
            error: _('The server could not be asked.'),
            nokey: _('Not available: the key of the server is missing (see the documentation).'),
        };
        if (result.status === 'available') {
            const notes = (result.notes ?? []).join(' ');
            this._firmwareRow.subtitle =
                `${_('A newer firmware exists:')} ${result.version}. ` +
                `${_('Install it with the app of the vendor.')}${notes ? `\n${notes}` : ''}`;
        } else {
            this._firmwareRow.subtitle = texts[result.status] ?? texts.error;
        }
    }

    // One action on the list of devices. The counter lets the same action be asked again
    _requestDevice(action, extra = {}) {
        const seq = (this._settingsItems['device-request']?.seq ?? 0) + 1;
        this._updateGsettings('device-request', {seq, action, ...extra});
    }

    _askPairing() {
        this._ask({
            heading: _('Start the pairing mode?'),
            body: _('The earbuds wait for a new device for a while. Both places must not be ' +
                    'in use, so disconnect one of the devices first.'),
            accept: _('Start'),
        }, () => this._requestDevice('pair'), () => {});
    }

    _syncDevices() {
        if (!this._devicesGroup)
            return;

        for (const row of this._deviceRows)
            this._devicesGroup.remove(row);
        this._deviceRows = [];

        const devices = this._settingsItems['multipoint-devices'] ?? [];
        const connected = devices.filter(d => d.active).length;

        // New rows go in front of the pairing row. The group has no way to insert, so the
        // pairing row is taken out and put back last
        this._devicesGroup.remove(this._pairRow);
        for (const device of devices) {
            const row = new Adw.ActionRow({
                title: GLib.markup_escape_text(device.name, -1),
                subtitle: device.active ? _('Connected') : _('Not connected'),
            });

            const fixButton = new Gtk.Button({
                icon_name: 'starred-symbolic',
                tooltip_text: _('Always play on this device'),
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                sensitive: device.active,
            });
            fixButton.connect('clicked', () =>
                this._requestDevice('playback', {id: device.id, mode: PlaybackDevice.FIX}));
            row.add_suffix(fixButton);

            const playButton = new Gtk.Button({
                icon_name: 'media-playback-start-symbolic',
                tooltip_text: _('Play on this device'),
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                sensitive: device.active,
            });
            playButton.connect('clicked', () =>
                this._requestDevice('playback', {id: device.id, mode: PlaybackDevice.SWITCH}));
            row.add_suffix(playButton);

            const toggle = new Gtk.Switch({valign: Gtk.Align.CENTER, active: device.active});
            toggle.connect('notify::active', () => {
                if (toggle.active === device.active)
                    return;

                this._requestDevice(toggle.active ? 'connect' : 'disconnect',
                    {position: device.index});
            });
            row.add_suffix(toggle);
            row.activatable_widget = toggle;

            this._devicesGroup.add(row);
            this._deviceRows.push(row);
        }
        this._devicesGroup.add(this._pairRow);
        this._pairButton.sensitive = connected < 2;

        this._devicesGroup.visible = !!this._settingsItems['multipoint'];
    }

    // Changing the codec restarts the earbuds. LDAC needs multipoint to be off, so multipoint is
    // turned off first and the earbuds get a moment before the codec follows
    _codecQuestion(codec) {
        if (codec === Codec.LDAC && this._settingsItems['multipoint']) {
            return {
                heading: _('Turn off multipoint?'),
                body: _('LDAC cannot be used together with multipoint. Multipoint is turned ' +
                        'off first, then LDAC is selected. The earbuds restart.'),
                accept: _('Turn Off and Select'),
                onAccept: () => {
                    this._updateGsettings('multipoint', false);
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                        if (this._settings)
                            this._updateGsettings('codec', Codec.LDAC);
                        return GLib.SOURCE_REMOVE;
                    });
                },
            };
        }

        return {
            heading: _('Restart the earbuds?'),
            body: _('The earbuds restart when the audio quality changes. Music and calls are ' +
                    'interrupted for a few seconds.'),
            accept: _('Change'),
        };
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

    // A question before a change that has side effects. {heading, body, accept} asks for a
    // confirmation; without accept the dialog only informs and the change is dropped
    _ask(question, onAccept, onDecline) {
        const dialog = new Adw.AlertDialog({heading: question.heading, body: question.body});
        if (question.accept) {
            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('accept', question.accept);
            dialog.set_response_appearance('accept', Adw.ResponseAppearance.SUGGESTED);
        } else {
            dialog.add_response('cancel', _('OK'));
        }
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            if (response === 'accept')
                onAccept();
            else
                onDecline();
        });
        dialog.present(this);
    }

    _addSwitch(group, key, title, subtitle, guard = null) {
        if (!(key in this._settingsItems))
            return;

        const row = new Adw.SwitchRow({title, subtitle});
        row.active = this._settingsItems[key];
        row.connect('notify::active', () => {
            if (this._settingsItems[key] === row.active)
                return;

            const value = row.active;
            const question = guard?.(value);
            if (!question) {
                this._updateGsettings(key, value);
                return;
            }

            this._ask(question, () => this._updateGsettings(key, value),
                () => (row.active = this._settingsItems[key]));
        });
        group.add(row);
        this._switches[key] = row;
    }

    _addDropdown(group, key, title, subtitle, options, values, guard = null) {
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
            if (value === undefined || value === this._settingsItems[key])
                return;

            const question = guard?.(value);
            if (!question) {
                this._updateGsettings(key, value);
                return;
            }

            const accept = question.onAccept ?? (() => this._updateGsettings(key, value));
            this._ask(question, accept, () => (row.selected_item = this._settingsItems[key]));
        });
        group.add(row);
        this._dropdowns[key] = row;
        return row;
    }

    // The subtitle of a dropdown row explains the selected option in a few words, followed by a
    // line of technical details. entries[i] = [text, technical details] belongs to values[i]
    _addDescription(row, values, entries, note = '') {
        if (!row)
            return;

        const escape = text => GLib.markup_escape_text(text, -1);
        const update = () => {
            const entry = entries[values.indexOf(row.selected_item)] ?? entries[0];
            row.subtitle = [
                ...note ? [escape(note)] : [],
                escape(entry[0]),
                `<small>${escape(entry[1])}</small>`,
            ].join('\n');
        };
        row.connect('notify::selected-item', update);
        update();
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
