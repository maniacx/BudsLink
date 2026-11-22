'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger, sanitizeDevPath} from './logger.js';

const SERVICE_PATH = '/io/github/maniacx/BudsLink/Profile';

export const ProfileManager = GObject.registerClass({
    GTypeName: 'BudsLink_ProfileManager',
    Signals: {
        'new-connection': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_INT],
        },
    },
}, class ProfileManager extends GObject.Object {
    constructor(notifyCb) {
        super();
        this._log = createLogger('ProfileManager');
        this._systemBus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
        this._interface = this._buildInterfaceInfo();
        this._profiles = new Map();
        this._fdByDevice = new Map();
        this._notifyCb = notifyCb;
    }

    _buildInterfaceInfo() {
        const xml = `
        <node>
          <interface name="org.bluez.Profile1">
            <method name="Release"/>
            <method name="NewConnection">
              <arg type="o" name="device" direction="in"/>
              <arg type="h" name="fd" direction="in"/>
              <arg type="a{sv}" name="props" direction="in"/>
            </method>
            <method name="RequestDisconnection">
              <arg type="o" name="device" direction="in"/>
            </method>
          </interface>
        </node>`;
        return Gio.DBusNodeInfo.new_for_xml(xml).interfaces[0];
    }

    async _registerProfile(deviceType, uuid) {
        let registrationId = 0;
        let proxy = null;
        const objectPath = `${SERVICE_PATH}/${deviceType}`;

        this._log.info(`Registering profile ${deviceType}`);

        try {
            registrationId = this._systemBus.register_object(
                objectPath,
                this._interface,
                this._onMethodCall.bind(this, deviceType),
                null,
                null
            );
        } catch (e) {
            this._log.error(e, `Failed to register object for ${deviceType}`);
            return null;
        }

        try {
            proxy = await Gio.DBusProxy.new(
                this._systemBus,
                Gio.DBusProxyFlags.NONE,
                null,
                'org.bluez',
                '/org/bluez',
                'org.bluez.ProfileManager1',
                null
            );
        } catch (e) {
            this._log.error(e, 'Failed to create ProfileManager1 proxy');
            this._systemBus.unregister_object(registrationId);
            return null;
        }

        const opts = {
            Name: new GLib.Variant('s', `CustomProfile-${deviceType}`),
            Role: new GLib.Variant('s', 'client'),
            AutoConnect: new GLib.Variant('b', true),
        };

        try {
            await proxy.call(
                'RegisterProfile',
                GLib.Variant.new_tuple([
                    new GLib.Variant('o', objectPath),
                    new GLib.Variant('s', uuid),
                    new GLib.Variant('a{sv}', opts),
                ]),
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
        } catch (e) {
            const name = Gio.DBusError.get_remote_error(e);

            if (name === 'org.bluez.Error.NotPermitted' ||
                        name === 'org.bluez.Error.AlreadyExists')
                this._notifyCb(deviceType);

            this._log.error(e, `RegisterProfile failed for ${deviceType}`);
            this._systemBus.unregister_object(registrationId);
            return null;
        }

        return {proxy, objectPath, registrationId};
    }

    _unregisterProfile(deviceType, profile) {
        if (!profile.proxy || !profile.objectPath || !profile.registrationId)
            return;

        this._log.info(`Unregistering profile ${deviceType}`);

        try {
            profile.proxy.call_sync(
                'UnregisterProfile',
                GLib.Variant.new_tuple([
                    new GLib.Variant('o', profile.objectPath),
                ]),
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
        } catch (e) {
            this._log.error(e, `Error while unregistering profile for ${deviceType}`);
        }

        try {
            this._systemBus.unregister_object(profile.registrationId);
        } catch {
            // do nothing
        }

        this._profiles.delete(deviceType);
    }

    _onMethodCall(deviceType, conn, sender, path, iface, method, params, invocation) {
        if (method === 'Release') {
            this._log.info(`Profile Release ${deviceType}`);
            invocation.return_value(null);
            return;
        }

        if (method === 'NewConnection') {
            this._log.info(`Profile NewConnection ${deviceType}`);
            const [devicePath, fdIndex] = params.deep_unpack();
            const fdList = invocation.get_message().get_unix_fd_list();
            const fd = fdList.get(fdIndex);

            let entry = this._fdByDevice.get(devicePath);
            if (!entry) {
                entry = {
                    deviceType,
                    fd,
                    timeoutId: null,
                    signalId: null,
                    resolve: null,
                };
                this._fdByDevice.set(devicePath, entry);
            } else {
                entry.fd = fd;
            }

            this.emit('new-connection', devicePath, fd);
            invocation.return_value(null);
            return;
        }

        if (method === 'RequestDisconnection') {
            const [devicePath] = params.deep_unpack();
            this._log.info(`RequestDisconnection ${devicePath}`);
            this.releaseFd(devicePath, false);
            invocation.return_value(null);
        }
    }

    async _getDeviceProxy(devicePath) {
        try {
            const deviceProxy = await Gio.DBusProxy.new(
                this._systemBus,
                Gio.DBusProxyFlags.NONE,
                null,
                'org.bluez',
                devicePath,
                'org.bluez.Device1',
                null
            );
            return deviceProxy;
        } catch (e) {
            this._log.error(e, `Failed to create Device1 proxy for ${devicePath}`);
            return null;
        }
    }

    async connectProfile(devicePath) {
        const entry = this._fdByDevice.get(devicePath);
        if (!entry)
            return;

        const profile = this._profiles.get(entry.deviceType);
        if (!profile)
            return;


        try {
            entry.connecting = true;

            const deviceProxy = await this._getDeviceProxy(devicePath);
            if (!deviceProxy)
                return;

            await deviceProxy.call(
                'ConnectProfile',
                GLib.Variant.new_tuple([new GLib.Variant('s', profile.uuid)]),
                Gio.DBusCallFlags.NONE,
                5000,
                null
            );

            this._log.info(
                `ConnectProfile OK for ${profile.uuid} on ${sanitizeDevPath(devicePath)}`
            );
        } catch (e) {
            this._log.info(
                `ConnectProfile Failed for ${profile.uuid} on ${sanitizeDevPath(devicePath)}. ${e}`
            );
        } finally {
            entry.connecting = false;
        }
    }

    async disconnectProfile(devicePath) {
        const entry = this._fdByDevice.get(devicePath);
        if (!entry)
            return;

        const profile = this._profiles.get(entry.deviceType);
        if (!profile)
            return;

        const deviceProxy = await this._getDeviceProxy(devicePath);
        if (!deviceProxy)
            return;

        try {
            await deviceProxy.call(
                'DisconnectProfile',
                GLib.Variant.new_tuple([
                    new GLib.Variant('s', profile.uuid),
                ]),
                Gio.DBusCallFlags.NONE,
                5000,
                null
            );

            this._log.info(
                `DisconnectProfile OK for ${profile.uuid} on ${sanitizeDevPath(devicePath)}`
            );
        } catch (e) {
            this._log.info(`DisconnectProfile Failed for ${profile.uuid} on ` +
                `${sanitizeDevPath(devicePath)}. ${e}`);
        }
    }

    // retrySeconds: how long to keep asking BlueZ to connect the profile. The default (0) gives up
    // after about 12 seconds. A larger value keeps trying (every 4 seconds for the first 90
    // seconds, every 30 seconds after that). Another program, for example the app of the
    // vendor, may hold the only connection to the device for a long time
    async acquireFd(deviceType, uuid, devicePath, retrySeconds = 0) {
        if (!this._profiles.has(deviceType)) {
            const iniEntry = {
                uuid,
                proxy: null,
                objectPath: null,
                registrationId: null,
            };
            this._profiles.set(deviceType, iniEntry);

            const info = await this._registerProfile(deviceType, uuid);
            if (!info) {
                this._profiles.delete(deviceType);
                return -1;
            }

            iniEntry.proxy = info.proxy;
            iniEntry.objectPath = info.objectPath;
            iniEntry.registrationId = info.registrationId;
        }

        let entry = this._fdByDevice.get(devicePath);
        if (!entry) {
            entry = {
                deviceType,
                fd: null,
                timeoutId: null,
                signalId: null,
                resolve: null,
            };
            this._fdByDevice.set(devicePath, entry);
        } else if (entry.fd !== null) {
            return entry.fd;
        }

        return new Promise(resolve => {
            entry.resolve = resolve;
            let attempt = 0;

            entry.signalId = this.connect('new-connection', (_o, path, fd) => {
                if (path !== devicePath)
                    return;

                entry.fd = fd;

                if (entry.timeoutId)
                    GLib.source_remove(entry.timeoutId);
                entry.timeoutId = null;

                this.disconnect(entry.signalId);
                entry.signalId = null;

                resolve(fd);
            });

            entry.timeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                700,
                () => {
                    if (!this._fdByDevice.has(devicePath))
                        return GLib.SOURCE_REMOVE;

                    attempt++;

                    // Retry with backoff (0.5, 1, 2, 4, 8 s) and wait up to 12 s.
                    // While a second device's audio link is still being set up,
                    // BlueZ answers br-connection-busy for several seconds; the
                    // connection then often arrives just after a 4.5 s cut-off.
                    if (attempt > (retrySeconds > 0 ? retrySeconds * 1.4 : 8)) {
                        this.releaseFd(devicePath, false);
                        return GLib.SOURCE_REMOVE;
                    }

                    // With retrySeconds the retries slow down after 8 ticks: every 4 s,
                    // every 30 s after 90 s
                    const slow = retrySeconds > 0 && attempt > 8 &&
                        attempt % (attempt <= 130 ? 6 : 43) !== 0;
                    if (!slow && !entry.connecting)
                        this.connectProfile(devicePath);

                    return GLib.SOURCE_CONTINUE;
                }
            );

            this.connectProfile(devicePath);
        });
    }


    async releaseFd(devicePath, disconnect = true) {
        const entry = this._fdByDevice.get(devicePath);
        if (!entry)
            return;

        if (entry.signalId)
            this.disconnect(entry.signalId);

        if (entry.timeoutId)
            GLib.source_remove(entry.timeoutId);

        if (entry.resolve) {
            entry.resolve(-1);
            entry.resolve = null;
        }

        if (disconnect)
            await this.disconnectProfile(devicePath);

        this._fdByDevice.delete(devicePath);

        const deviceType = entry.deviceType;

        const hasOtherDevices =
            Array.from(this._fdByDevice.values()).some(e => e.deviceType === deviceType);

        if (!hasOtherDevices) {
            const profile = this._profiles.get(deviceType);
            if (profile)
                this._unregisterProfile(deviceType, profile);
        }
    }
});

