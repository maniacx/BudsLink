'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

const MODE_KEY = 'dark-mode';
const ACCENT_KEY = 'accent-color';

const MODE_SYSTEM = 'system';
const MODE_LIGHT = 'light';
const MODE_DARK = 'dark';
const ACCENT_SYSTEM = 'system';

export class ThemeManager {
    constructor(app, settings) {
        this._settings = settings;
        this._styleManager = app.get_style_manager();

        this._provider = new Gtk.CssProvider();
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            this._provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        this._connectSignals();
        this._applyAll();
    }

    _connectSignals() {
        this._modeId = this._settings.connect(`changed::${MODE_KEY}`, () => {
            this._applyDarkMode();
        });

        this._accentId = this._settings.connect(`changed::${ACCENT_KEY}`, () => {
            this._applyAccentColor();
        });

        this._styleManagerId = this._styleManager.connect('notify::accent-color', () => {
            if (this._settings.get_string(ACCENT_KEY) === ACCENT_SYSTEM)
                this._applyAccentColor();
        });
    }

    _applyAll() {
        this._applyDarkMode(true);
        this._applyAccentColor(true);
    }

    _applyDarkMode(init = false) {
        const mode = this._settings.get_string(MODE_KEY);

        switch (mode) {
            case MODE_LIGHT:
                this._styleManager.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
                break;
            case MODE_DARK:
                this._styleManager.color_scheme = Adw.ColorScheme.FORCE_DARK;
                break;
            case MODE_SYSTEM:
                if (init)
                    return;
            default:
                this._styleManager.color_scheme = Adw.ColorScheme.DEFAULT;
        }
    }

    _applyAccentColor(init = false) {
        const accent = this._settings.get_string(ACCENT_KEY);

        if (accent === ACCENT_SYSTEM && init)
            return;

        let accentVar;

        if (accent === ACCENT_SYSTEM) {
            const index = this._styleManager.get_accent_color();
            const table = [
                '--accent-blue',
                '--accent-teal',
                '--accent-green',
                '--accent-yellow',
                '--accent-orange',
                '--accent-red',
                '--accent-pink',
                '--accent-purple',
                '--accent-slate',
            ];
            accentVar = table[index];
        } else {
            accentVar = accent;
        }

        const css = `:root { --accent-bg-color: var(${accentVar}); }`;
        this._provider.load_from_data(css, -1);
    }

    destroy() {
        if (this._settings) {
            this._settings.disconnect?.(this._modeId);
            this._settings.disconnect?.(this._accentId);
        }

        if (this._styleManager && this._styleManagerId)
            this._styleManager.disconnect(this._styleManagerId);

        if (this._provider) {
            Gtk.StyleContext.remove_provider_for_display(
                Gdk.Display.get_default(),
                this._provider
            );
        }

        this._modeId = null;
        this._accentId = null;
        this._styleManagerId = null;
        this._provider = null;
        this._settings = null;
        this._styleManager = null;
    }
}

