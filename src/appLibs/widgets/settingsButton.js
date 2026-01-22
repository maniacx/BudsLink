'use strict';

import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';

import {openLogWindow} from './logWindow.js';
import {Gtxt as _, createAboutDialog} from '../utils.js';

const MODE_KEY = 'dark-mode';
const ACCENT_KEY = 'accent-color';

const MODE_SYSTEM = 'system';
const MODE_LIGHT = 'light';
const MODE_DARK = 'dark';

const ACCENT_SYSTEM = 'system';

export const SettingsButton = GObject.registerClass(
class SettingsButton extends Gtk.MenuButton {
    _init(settings, direction) {
        super._init({
            icon_name: 'bbm-open-menu-symbolic',
            tooltip_text: _('Application Settings'),
            margin_top: 6,
            margin_bottom: 6,
            css_classes: ['circular'],
        });

        this._settings = settings;

        this._accentTable = [
            ['system', '--window-bg-color', _('System Default')],
            ['accent-blue', '--accent-blue', _('Blue')],
            ['accent-teal', '--accent-teal', _('Teal')],
            ['accent-green', '--accent-green', _('Green')],
            ['accent-yellow', '--accent-yellow', _('Yellow')],
            ['accent-orange', '--accent-orange', _('Orange')],
            ['accent-red', '--accent-red', _('Red')],
            ['accent-pink', '--accent-pink', _('Pink')],
            ['accent-purple', '--accent-purple', _('Purple')],
            ['accent-slate', '--accent-slate', _('Slate')],
        ];

        this._styleManager = Adw.StyleManager.get_default();
        this._isMinAdw1_6 = Adw.get_major_version() > 1 || Adw.get_major_version() === 1 &&
                Adw.get_minor_version() >= 6;

        this._popPosition = direction === Gtk.TextDirection.RTL
            ? Gtk.PositionType.LEFT : Gtk.PositionType.RIGHT;

        this._mainPopover = new Gtk.Popover({
            has_arrow: true,
            cascade_popdown: true,
            position: this._popPosition,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
        });

        box.append(this._createRow(
            'bbm-logs-symbolic',
            _('Realtime Logs'),
            false,
            () => {
                openLogWindow(_);
                this._mainPopover.popdown();
            }
        ));

        box.append(this._createRow(
            'bbm-dark-mode-symbolic',
            _('Dark Mode'),
            true,
            btn => this._openSubPopover(() => this._createDarkModePopover(), btn)
        ));

        if (this._isMinAdw1_6) {
            box.append(this._createRow(
                'bbm-color-symbolic',
                _('Accent Color'),
                true,
                btn => this._openSubPopover(() => this._createAccentColorPopover(), btn)
            ));
        }

        try {
            box.append(this._createRow(
                'bbm-help-about-symbolic',
                _('About BudsLink'),
                false,
                () => {
                    const parent = this.get_root();
                    const aboutDialog = createAboutDialog();
                    aboutDialog.developers = ['maniacx@github.com'];
                    aboutDialog.copyright = _('Copyright © 2026 maniacx@github.com');
                    aboutDialog.website = 'https://github.com/maniacx/BudsLink/';
                    aboutDialog.issue_url = 'https://github.com/maniacx/BudsLink/issues';
                    aboutDialog.add_link(
                        '_Translation',
                        'https://github.com/maniacx/BudsLink/issues'
                    );

                    aboutDialog.present(parent);
                    this._mainPopover.popdown();
                }
            ));
        } catch (e) {
            log(e);
        };

        this._mainPopover.set_child(box);
        this.set_popover(this._mainPopover);
        this._applyDarkMode(this._getDarkMode());

        if (this._isMinAdw1_6) {
            this._accentColor = this._styleManager.get_accent_color();
            this._applyAccentColor(this._getAccentColor());

            this._styleManager.connect('notify::accent-color', () => {
                this._accentColor = this._styleManager.get_accent_color();
                this._applyAccentColor(this._getAccentColor());
            });
        }
    }

    _getDarkMode() {
        const v = this._settings.get_string(MODE_KEY);
        return v || MODE_SYSTEM;
    }

    _getAccentColor() {
        const v = this._settings.get_string(ACCENT_KEY);
        return v || ACCENT_SYSTEM;
    }

    _applyDarkMode(mode) {
        if (mode === MODE_LIGHT)
            this._styleManager.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
        else if (mode === MODE_DARK)
            this._styleManager.color_scheme = Adw.ColorScheme.FORCE_DARK;
        else
            this._styleManager.color_scheme = Adw.ColorScheme.DEFAULT;
    }

    _applyAccentColor(accent) {
        const accentVar = accent === ACCENT_SYSTEM
            ? this._accentTable[this._accentColor + 1][1] : accent;

        const css = `:root { --accent-bg-color: var(${accentVar}); }`;

        const provider = new Gtk.CssProvider();
        provider.load_from_data(css, css.length);

        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }

    _openSubPopover(factory, relativeTo) {
        const popover = factory();
        popover.set_parent(relativeTo);

        popover.connect('hide', () => {
            if (popover.get_parent())
                popover.unparent();
        });

        popover.popup();
    }

    _createRow(iconName, labelText, hasSubmenu, callback) {
        const button = new Gtk.Button({css_classes: ['flat']});

        const row = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        row.append(new Gtk.Image({icon_name: iconName}));
        row.append(new Gtk.Label({label: labelText, xalign: 0, hexpand: true}));

        if (hasSubmenu)
            row.append(new Gtk.Image({icon_name: 'pan-end-symbolic'}));

        button.set_child(row);
        button.connect('clicked', () => callback(button));
        return button;
    }

    _createDarkModePopover() {
        const current = this._getDarkMode();
        const popover = new Gtk.Popover({
            has_arrow: true,
            position: this._popPosition,
            cascade_popdown: true,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        const add = (label, mode) => {
            const row = this._createCheckRow(label, current === mode);
            row.connect('clicked', () => {
                this._settings.set_string(MODE_KEY, mode);
                this._applyDarkMode(mode);
                popover.popdown();
                this._mainPopover.popdown();
            });
            box.append(row);
        };

        add(_('System Default'), MODE_SYSTEM);
        add(_('Light'), MODE_LIGHT);
        add(_('Dark'), MODE_DARK);

        popover.set_child(box);
        return popover;
    }

    _createAccentColorPopover() {
        const current = this._getAccentColor();

        const popover = new Gtk.Popover({
            has_arrow: true,
            position: this._popPosition,
            cascade_popdown: true,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        for (const [value, cssVar, label] of this._accentTable) {
            const row = this._createColorRow(cssVar, label, current === cssVar ||
                value === ACCENT_SYSTEM && current === ACCENT_SYSTEM);

            row.connect('clicked', () => {
                const store = value === ACCENT_SYSTEM ? ACCENT_SYSTEM : cssVar;
                this._settings.set_string(ACCENT_KEY, store);
                this._applyAccentColor(store);
                popover.popdown();
                this._mainPopover.popdown();
            });
            box.append(row);
        }

        popover.set_child(box);
        return popover;
    }

    _createCheckRow(labelText, checked) {
        const button = new Gtk.Button({css_classes: ['flat']});
        const row = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12});

        row.append(new Gtk.Label({label: labelText, xalign: 0, hexpand: true}));

        if (checked)
            row.append(new Gtk.Image({icon_name: 'object-select-symbolic'}));

        button.set_child(row);
        return button;
    }

    _createColorRow(cssVar, labelText, checked) {
        const button = new Gtk.Button({css_classes: ['flat']});
        const row = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12});

        const swatch = new Gtk.Box({
            width_request: 14,
            height_request: 14,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
        });

        const provider = new Gtk.CssProvider();
        provider.load_from_data(
            `box { background-color: var(${cssVar}); border-radius: 9999px; }`,
            -1
        );

        swatch.get_style_context().add_provider(
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        row.append(swatch);
        row.append(new Gtk.Label({label: labelText, xalign: 0, hexpand: true}));

        if (checked)
            row.append(new Gtk.Image({icon_name: 'object-select-symbolic'}));

        button.set_child(row);
        return button;
    }
});

