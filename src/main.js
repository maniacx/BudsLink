'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import {gettext} from 'gettext';

import {runApp} from './app.js';
import {initContext} from './appLibs/utils.js';

const appId = 'io.github.maniacx.BudsLink';
const appDir = '/app';
const logDir = GLib.build_filenamev([GLib.get_user_state_dir(), 'log']);

GLib.mkdir_with_parents(logDir, 0o755);

function createAboutDialog() {
    const aboutDialog = Adw.AboutDialog.new_from_appdata(
        '/io/github/maniacx/BudsLink/io.github.maniacx.BudsLink.metainfo.xml',
        pkg.version    // eslint-disable-line no-undef
    );
    return aboutDialog;
}

function getCssPath(provider) {
    provider.load_from_resource('/io/github/maniacx/BudsLink/stylesheet.css');
}

export function main(argv) {
    const settings = new Gio.Settings({schema_id: appId});

    initContext({
        appId,
        appDir,
        logDir,
        settings,
        gettext,
        getCssPath,
        createAboutDialog,
    });

    runApp(argv);
}

