'use strict';

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function checkGtkVersion() {
    const major = Gtk.get_major_version();
    const minor = Gtk.get_minor_version();

    if (major < 4 || major === 4 && minor < 14) {
        printerr(`Unsupported GTK version ${major}.${minor}. GTK >= 4.14 required.`);
        return false;
    }
    return true;
}

function checkAdwVersion() {
    const major = Adw.get_major_version();
    const minor = Adw.get_minor_version();

    if (major < 1 || major === 1 && minor < 5) {
        printerr(`Unsupported Libadwaita version ${major}.${minor}. Libadwaita >= 1.5 required.`);
        return false;
    }
    return true;
}

function checkBlueZ() {
    try {
        const bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
        const result = bus.call_sync(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'NameHasOwner',
            new GLib.Variant('(s)', ['org.bluez']),
            new GLib.VariantType('(b)'),
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );

        const [hasOwner] = result.deep_unpack();
        if (!hasOwner) {
            printerr('BlueZ is not available (org.bluez not owned).');
            return false;
        }
    } catch {
        printerr('Unable to connect to system DBus.');
        return false;
    }
    return true;
}

function checkPactl() {
    if (!GLib.find_program_in_path('pactl')) {
        printerr('`pactl` not found in PATH.');
        return false;
    }
    return true;
}

export function runPrechecks() {
    const results = [
        checkGtkVersion(),
        checkAdwVersion(),
        checkBlueZ(),
        checkPactl(),
    ];

    return results.every(Boolean);
}


