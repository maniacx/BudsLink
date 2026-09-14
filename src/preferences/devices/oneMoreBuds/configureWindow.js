'use strict';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {
    supportedAudioSingleIcons
} from '../../../lib/widgets/iconGroups.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';
import {RingMyBudsRow} from './../../widgets/ringMyBudsRow.js';
import {
    OneMoreBudsModelList, EqPreset, ClickAction, SonoFlowPreset
} from '../../../lib/devices/oneMoreBuds/oneMoreBudsConfig.js';

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_OneMoreBudsConfigureWindow',
}, class ConfigureWindow extends Adw.Window {
    _init(settings, mac, devicePath, parentWindow, _, modal = false) {
        super._init({
            default_width: 650,
            default_height: 650,
            width_request: 320,
            height_request: 100,
            modal,
            transient_for: parentWindow ?? null,
        });

        const clickOptions = [
            _('Off'),
            _('Next Track'),
            _('Previous Track'),
            _('Volume Down'),
            _('Volume Up'),
            _('Play / Pause'),
            _('Voice Control'),
        ];

        const clickValues = [
            ClickAction.OFF,
            ClickAction.NEXT,
            ClickAction.PREV,
            ClickAction.VOL_DOWN,
            ClickAction.VOL_UP,
            ClickAction.PLAY_PAUSE,
            ClickAction.VOICE_CONTROL,
        ];

        this._settings = settings;
        this._devicePath = devicePath;

        const pathsString = this._settings.get_strv('one-more-buds-list').map(JSON.parse);
        this._settingsItems = pathsString.find(info => info.path === devicePath);
        if (!this._settingsItems)
            return;

        this.title = this._settingsItems.alias;

        const modelData = OneMoreBudsModelList.find(
            cfg => cfg.id.includes(this._settingsItems['modelId'])
        ) ?? OneMoreBudsModelList[0];

        const toolViewBar = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        const page = new Adw.PreferencesPage();

        toolViewBar.add_top_bar(headerBar);
        toolViewBar.set_content(page);
        this.set_content(toolViewBar);

        const iconSelector = new IconSelectorWidget({
            gtxt: _,
            grpTitle: _('Icon'),
            rowTitle: _('Select Icon'),
            rowSubtitle: _('Select the icon used for the indicator and quick menu'),
            iconList: supportedAudioSingleIcons,
            initialIcon: this._settingsItems['icon'] || 'headphone1',
            mac,
            fw: this._settingsItems['fw-version'] || '',
        });

        iconSelector.connect('notify::selected-icon', () => {
            this._updateGsettings('icon', iconSelector.selected_icon);
        });

        page.add(iconSelector);

        const settingsGroup = new Adw.PreferencesGroup({title: _('Settings')});
        page.add(settingsGroup);

        if (modelData.equalizer) {
            const isPresetSound = modelData.eqPresetModel === 'presetSound';

            this._eqDropdown = new DropDownRowWidget({
                title: _('Equalizer Preset'),
                subtitle: _('Change the sound signature'),
                options: isPresetSound ? SonoFlowPreset.names : [_('Music'), _('Sleep')],
                values: isPresetSound ? SonoFlowPreset.values : [EqPreset.MUSIC, EqPreset.SLEEP],
                initialValue: this._settingsItems['eq-preset'],
            });

            this._eqDropdown.connect('notify::selected-item', () => {
                this._updateGsettings('eq-preset', this._eqDropdown.selected_item);
            });

            settingsGroup.add(this._eqDropdown);
        }

        if (modelData.gestures) {
            this._doubleClickDropdown = new DropDownRowWidget({
                title: _('Double Click'),
                subtitle: _('Action performed on a double click'),
                options: clickOptions,
                values: clickValues,
                initialValue: this._settingsItems['double-click'],
            });

            this._doubleClickDropdown.connect('notify::selected-item', () => {
                this._updateGsettings('double-click', this._doubleClickDropdown.selected_item);
            });

            settingsGroup.add(this._doubleClickDropdown);

            this._tripleClickDropdown = new DropDownRowWidget({
                title: _('Triple Click'),
                subtitle: _('Action performed on a triple click'),
                options: clickOptions,
                values: clickValues,
                initialValue: this._settingsItems['triple-click'],
            });

            this._tripleClickDropdown.connect('notify::selected-item', () => {
                this._updateGsettings('triple-click', this._tripleClickDropdown.selected_item);
            });

            settingsGroup.add(this._tripleClickDropdown);
        }

        if (modelData.findMyBuds) {
            const miscGroup = new Adw.PreferencesGroup({title: _('Find My Earbuds')});
            page.add(miscGroup);

            this._ringBudsRow = new RingMyBudsRow(_, {dual: true});

            this._ringBudsRow.connect('notify::status', () => {
                this._updateGsettings('ring-state', this._ringBudsRow.status);
            });

            this._ringBudsRow.connect('notify::status-left', () => {
                this._updateGsettings('ring-state-left', this._ringBudsRow.statusLeft);
            });

            miscGroup.add(this._ringBudsRow);
        }

        const settingSignalId = this._settings.connect('changed::one-more-buds-list', () => {
            const updatedList =
                this._settings.get_strv('one-more-buds-list').map(JSON.parse);
            this._settingsItems = updatedList.find(info => info.path === devicePath);
            if (!this._settingsItems)
                return;

            this.title = this._settingsItems.alias;

            if (this._eqDropdown)
                this._eqDropdown.selected_item = this._settingsItems['eq-preset'];

            if (this._doubleClickDropdown)
                this._doubleClickDropdown.selected_item = this._settingsItems['double-click'];

            if (this._tripleClickDropdown)
                this._tripleClickDropdown.selected_item = this._settingsItems['triple-click'];

            if (this._ringBudsRow) {
                this._ringBudsRow.status = this._settingsItems['ring-state'];
                this._ringBudsRow.statusLeft = this._settingsItems['ring-state-left'];
            }
        });

        this.connect('close-request', () => {
            if (settingSignalId && this._settings)
                this._settings.disconnect(settingSignalId);

            this._settings = null;

            return false;
        });
    }

    _updateGsettings(key, value) {
        const pairedDevice = this._settings.get_strv('one-more-buds-list');
        const existingPathIndex =
                pairedDevice.findIndex(item => JSON.parse(item).path === this._devicePath);
        if (existingPathIndex !== -1) {
            const existingItem = JSON.parse(pairedDevice[existingPathIndex]);
            existingItem[key] = value;
            pairedDevice[existingPathIndex] = JSON.stringify(existingItem);
            this._settings.set_strv('one-more-buds-list', pairedDevice);
        }
    }
});