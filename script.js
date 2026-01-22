#!/usr/bin/env gjs -m
'use strict';

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gettext from 'gettext';
import {runApp} from './src/app.js';
import {initContext} from './src/appLibs/utils.js';
import {runPrechecks} from './src/scriptLibs/preChecks.js';
import {MockSettings} from './src/scriptLibs/mockGsettings/mockSettings.js';

if (!runPrechecks()) {
    printerr('\nDependency check failed. Aborting.');
    imports.system.exit(1);
}

const appId = 'io.github.maniacx.BudsLink.script';

const currentFile = Gio.File.new_for_uri(import.meta.url);
const appRootDir = currentFile.get_parent().get_path();
const appDir = GLib.build_filenamev([appRootDir, 'src']);

const localDataDir = GLib.build_filenamev([appRootDir, 'localdata']);
const logDir = GLib.build_filenamev([localDataDir, 'log']);
const configDir = GLib.build_filenamev([localDataDir, 'config']);

[localDataDir, logDir, configDir].forEach(dir => {
    try {
        GLib.mkdir_with_parents(dir, 0o755);
    } catch (e) {
        log(`Failed to create ${dir}: ${e}`);
    }
});

const localeDir = GLib.build_filenamev([appRootDir, 'locale']);
Gettext.bindtextdomain(appId, localeDir);
Gettext.textdomain(appId);
const gettext = Gettext.gettext;

const settings = new MockSettings(configDir);

function createAboutDialog() {
    const aboutDialog = new Adw.AboutDialog();
    aboutDialog.set_application_icon('io.github.maniacx.BudsLink');
    aboutDialog.application_name = gettext('BudsLink');
    aboutDialog.version = '0.1.0';
    return aboutDialog;
}

function getCssPath(provider) {
    provider.load_from_path(GLib.build_filenamev([appRootDir, 'data', 'stylesheet.css']));
}

initContext({
    appId,
    appDir,
    logDir,
    settings,
    gettext,
    getCssPath,
    createAboutDialog,
});

runApp(ARGV);

