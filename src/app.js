'use strict';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import GLibUnix from 'gi://GLibUnix';


import {registerDestroyableType, destroyAllSignals} from './appLibs/signalTracker.js';
import {createLogger} from './lib/devices/logger.js';
import {DeviceRowNavPage} from './appLibs/widgets/deviceRow.js';
import {SettingsButton} from './appLibs/widgets/settingsButton.js';
import {BluetoothClient} from './appLibs/bluetoothClient.js';
import {initConfigureWindowLauncher} from './appLibs/confirueWindowlauncher.js';
import {Gtxt as _, AppId, AppDir, Settings, getCssPath} from './appLibs/utils.js';
import {EnhancedDeviceSupportManager} from './lib/enhancedDeviceSupportManager.js';

Gio._promisify(Gio.DBusProxy, 'new');
Gio._promisify(Gio.DBusProxy, 'new_for_bus');
Gio._promisify(Gio.DBusProxy.prototype, 'call');
Gio._promisify(Gio.DBusConnection.prototype, 'call');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.OutputStream.prototype, 'write_all_async');
Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async');

const SIGINT = 2;
const SIGTERM = 15;

registerDestroyableType(Gtk.Widget);
Adw.init();

class BudsLinkApp {
    constructor() {
        this.application = new Adw.Application({
            application_id: AppId,
            flags: Gio.ApplicationFlags.FLAGS_NONE,
        });

        this._log = createLogger('Main');

        this.application.connect('activate', () => {
            try {
                this._onActivate();
            } catch (e) {
                this._log.error(e);
            }
        });

        this.application.connect('shutdown', () => {
            this.destroy();
        });

        this._sigtermId = GLibUnix.signal_add_full(
            GLib.PRIORITY_DEFAULT,
            SIGTERM,
            () => {
                this.application.quit();
                return GLib.SOURCE_REMOVE;
            }
        );

        this._sigintId = GLibUnix.signal_add_full(
            GLib.PRIORITY_DEFAULT,
            SIGINT,
            () => {
                this.application.quit();
                return GLib.SOURCE_REMOVE;
            }
        );

        this._compDevices = new Map();
    }

    run(argv) {
        this.application.run(argv);
    }

    _onActivate() {
        if (this._window) {
            this._window.present();
            return;
        }

        this._window = new Adw.ApplicationWindow({
            application: this.application,
            default_width: 350,
            default_height: 780,
        });

        this._window.connect('close-request', () => {
            this._log.info('window close requested');
            this.application.quit();
            return false;
        });


        this.airpodsEnabled = true;
        this.sonyEnabled = true;

        this.settings = Settings;

        const provider = new Gtk.CssProvider();
        getCssPath(provider);

        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        const iconsPath = GLib.build_filenamev([AppDir, 'icons']);
        const iconTheme = Gtk.IconTheme.get_for_display(this._window.get_display());
        iconTheme.add_search_path(iconsPath);

        initConfigureWindowLauncher(this.settings, _);

        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar({
            decoration_layout: ':minimize,close',
            show_end_title_buttons: true,
        });
        toolbarView.add_top_bar(headerBar);

        const navPage = new Adw.NavigationPage({
            title: _('BudsLink'),
            child: toolbarView,
        });

        const direction = navPage.get_direction();

        this._navView = new Adw.NavigationView();
        this._navView.add(navPage);

        const devicesPage = new Adw.PreferencesPage();
        this._devicesGrp = new Adw.PreferencesGroup({title: _('Devices')});
        devicesPage.add(this._devicesGrp);
        this._noDeviceRow = new Adw.ActionRow({title: _('No compatible device found')});
        this._devicesGrp.add(this._noDeviceRow);
        toolbarView.set_content(devicesPage);

        const settingsButton = new SettingsButton(this.settings, direction);
        this._devicesGrp.set_header_suffix(settingsButton);

        this._window.set_content(this._navView);
        this._window.present();

        this._client = new BluetoothClient();
        this._deviceManager = new EnhancedDeviceSupportManager(this);
        this._initialize();
    }

    async _initialize() {
        try {
            await this._client.initClient();
            this._sync();
            this._client.connect('devices-update', () => this._sync());
        } catch (e) {
            this._log.error(e);
        }
    }

    sync() {
        if (this._syncRunning) {
            this._syncPending = true;
            return;
        }

        this._syncRunning = true;

        do {
            this._syncPending = false;
            this._sync();
        } while (this._syncPending);

        this._syncRunning = false;
    }

    _sync() {
        for (const [path, dev] of this._client.devices) {
            try {
                const deviceProp =
                this._deviceManager.onDeviceSync(path, dev.connected, dev.icon, dev.alias);

                if (this._compDevices.has(path)) {
                    const props = this._compDevices.get(path);
                    if (!dev.connected) {
                        props.row.destroy();
                        props.row.get_parent()?.remove(props.row);
                        this._compDevices.delete(path);
                    } else if (dev.connected && !props.row &&
                            deviceProp.type && deviceProp.dataHandler) {
                        props.type = deviceProp.type;
                        props.dataHandler = deviceProp.dataHandler;
                        props.row = new DeviceRowNavPage(path, dev.alias, dev.icon, this._navView,
                            this._devicesGrp, AppDir, props.dataHandler);
                    }
                } else if (dev.connected) {
                    const props = {type: null, dataHandler: null, row: null};
                    if (deviceProp.type && deviceProp.dataHandler) {
                        props.type = deviceProp.type;
                        props.dataHandler = deviceProp.dataHandler;
                        props.row = new DeviceRowNavPage(path, dev.alias, dev.icon, this._navView,
                            this._devicesGrp, AppDir, props.dataHandler);
                    }
                    this._compDevices.set(path, props);
                }
            } catch (e) {
                this._log.error(e);
            }
        }

        const anyDeviceRows = Array.from(this._compDevices.values()).some(p => p.row !== null);
        this._noDeviceRow.visible = !anyDeviceRows;

        this._deviceManager?.updateEnhancedDevicesInstance();
    }

    destroy() {
        destroyAllSignals();

        if (this._sigintId) {
            GLib.Source.remove(this._sigintId);
            this._sigintId = 0;
        }

        if (this._sigtermId) {
            GLib.Source.remove(this._sigtermId);
            this._sigtermId = 0;
        }

        this._deviceManager?.destroy();
        this._deviceManager = null;

        for (const props of this._compDevices.values())
            props.row?.destroy();

        this._compDevices.clear();
    }
}

export function runApp(argv = []) {
    new BudsLinkApp().run(argv);
}

