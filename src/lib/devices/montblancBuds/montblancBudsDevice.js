'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {SppUUidType, SppUUid} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {getBluezDeviceProxy} from '../../bluezDeviceProxy.js';
import {MontblancBudsSocket} from './montblancBudsSocket.js';
import {
    MontblancBudsModelList, AncState, AncMode, AncSubModes, ancFamily
} from './montblancBudsConfig.js';

export const DeviceTypeMontblancBuds = 'montblancBuds';

const QualcommVendorUuids = [
    '0000eb04-d102-11e1-9b23-00025b00a5a5',
    '0000eb05-d102-11e1-9b23-00025b00a5a5',
];

// When ANC is turned on, the buds briefly report ANC mode and ~0.4 s later restore the last
// mode used while on; a mode sent during that window is overwritten, and a mode sent while
// off is ignored. So when turning on, wait this long after the "on" notification before
// applying the requested mode (verified to hold after ~1.2 s).
const MODE_SETTLE_DELAY_MS = 900;
// Give up waiting for the buds and show their real state after this long.
const PENDING_TIMEOUT_MS = 4000;

// Toggle buttons, in UI order (1-based index in toggle1State).
const Modes = ['off', 'anc', 'live'];

// Options box (radio row) shown under the toggle for each family.
const SubModeBox = {anc: 1, live: 2};

const BatteryInterface = `
<node>
  <interface name="org.bluez.Battery1">
    <property name="Percentage" type="y" access="read"/>
  </interface>
</node>`;
const BatteryProxy = Gio.DBusProxy.makeProxyWrapper(BatteryInterface);

function findModel(name) {
    if (!name)
        return null;

    return MontblancBudsModelList.find(m => m.namePattern.test(name)) ?? null;
}

export function isMontblancBuds(bluezDeviceProxy, uuids) {
    const bluezProps = ['Name'];
    let supported = 'no';

    const deviceUuids = uuids.map(u => u.toLowerCase());
    if (!deviceUuids.includes(SppUUid) ||
            !QualcommVendorUuids.every(u => deviceUuids.includes(u)))
        return {supported, bluezProps};

    const name = bluezDeviceProxy.Name;
    if (!name) {
        supported = 'pending';
        return {supported, bluezProps};
    }

    if (findModel(name))
        supported = 'yes';

    return {supported, bluezProps};
}

export const MontblancBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_MontblancBudsDevice',
}, class MontblancBudsDevice extends GObject.Object {
    constructor(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super();
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`MontblancBudsDevice-${identifier}`);
        this._log.info('------------------- MontblancBudsDevice init -------------------');
        this._devicePath = devicePath;
        this.updateDeviceMapCb = updateDeviceMapCb;

        this._config = createConfig();
        this._props = createProperties();
        this._ancState = null;
        this._ancMode = null;
        // Last sub-mode used in each family, so the toggle returns to it.
        this._lastSubMode = {anc: AncMode.TRAVEL, live: AncMode.ATTENTION};
        // Mode requested while turning ANC on; the toggle keeps showing it until applied.
        this._pendingMode = null;
        this._modeSettled = false;
        this._settleId = null;
        this._pendingTimeoutId = null;

        const name = getBluezDeviceProxy(devicePath).Name;
        this._modelData = findModel(name) ?? findModel(alias) ?? MontblancBudsModelList[0];
        this._log.info(`Model: ${this._modelData.name}`);

        this._setupConfig();
        this._watchBattery();
        // Defer: updateDeviceMapCb triggers a sync, which would create a second instance if
        // it ran before the manager has stored this one.
        this._startId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._startId = null;
            this._startConfiguration();
            return GLib.SOURCE_REMOVE;
        });

        const callbacks = {
            updateFirmware: this.updateFirmware.bind(this),
            updateAncState: this.updateAncState.bind(this),
            updateAncMode: this.updateAncMode.bind(this),
        };
        const profile = {type: SppUUidType, uuid: SppUUid};
        this._socket = new MontblancBudsSocket(this._devicePath, profileManager, profile,
            callbacks);
    }

    _setupConfig() {
        const icon = this._modelData.budsIcon;
        this._config.commonIcon = icon;
        this._config.albumArtIcon = icon;
        this._config.battery1Icon = icon;
        this._config.battery1ShowOnDisconnect = true;
        this._config.showSettingsButton = false;

        const labels = {off: _('Off'), anc: _('Noise Cancellation'), live: _('Live Mode')};
        const icons = {
            off: 'bbm-anc-off-symbolic',
            anc: 'bbm-anc-on-symbolic',
            live: 'bbm-transperancy-symbolic',
        };
        this._config.toggle1Title = _('Noise Control');
        Modes.forEach((mode, index) => {
            this._config[`toggle1Button${index + 1}Name`] = labels[mode];
            this._config[`toggle1Button${index + 1}Icon`] = icons[mode];
        });
        this._props.toggle1Visible = true;

        const subModeLabels = {
            [AncMode.TRAVEL]: _('Travel'),
            [AncMode.OFFICE]: _('Office'),
            [AncMode.SPORTS]: _('Sports'),
            [AncMode.ATTENTION]: _('Attention'),
            [AncMode.VOICE_FOCUS]: _('Voice Focus'),
            [AncMode.ENVIRONMENT]: _('Environment'),
        };
        for (const [family, box] of Object.entries(SubModeBox)) {
            this._config[`optionsBox${box}`].push('radio-button');
            this._config[`box${box}RadioTitle`] = labels[family];
            this._config[`box${box}RadioButton`] = AncSubModes[family].map(m => subModeLabels[m]);
        }
    }

    _startConfiguration() {
        this.dataHandler = new DataHandler(this._config, this._props);
        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect('ui-action', (_o, command, value) => {
            if (command === 'toggle1State')
                this._toggle1ButtonClicked(value);

            for (const [family, box] of Object.entries(SubModeBox)) {
                if (command === `box${box}RadioButtonState`)
                    this._subModeClicked(family, value);
            }
        });
    }

    _watchBattery() {
        try {
            this._battery = new BatteryProxy(Gio.DBus.system, 'org.bluez', this._devicePath);
            this._batteryId = this._battery.connect('g-properties-changed',
                () => this._updateBattery());
            this._updateBattery();
        } catch (e) {
            this._log.error(e, 'BlueZ Battery1 not available');
            this._battery = null;
        }
    }

    _updateBattery() {
        const level = this._battery?.Percentage;
        if (level === null || level === undefined)
            return;

        this._props.battery1Level = level;
        this._props.battery1Status = 'discharging';
        this._props.computedBatteryLevel = level;
        this.dataHandler?.setProps(this._props);
    }

    _toggle1ButtonClicked(index) {
        const mode = Modes[index - 1];
        if (!mode)
            return;

        this._clearPending();

        if (mode === 'off') {
            this._showUi(AncState.OFF, null);
            this._socket?.setAncState(AncState.OFF);
            return;
        }

        this._requestMode(this._lastSubMode[mode]);
    }

    _subModeClicked(family, index) {
        const target = AncSubModes[family]?.[index - 1];
        if (target === undefined)
            return;

        this._clearPending();
        this._lastSubMode[family] = target;
        this._requestMode(target);
    }

    _requestMode(target) {
        this._showUi(AncState.ON, target);

        if (this._ancState === AncState.ON) {
            this._socket?.setAncMode(target);
            return;
        }

        // Off -> on: switch on now, apply the mode once the buds have restored theirs.
        this._pendingMode = target;
        this._pendingTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PENDING_TIMEOUT_MS,
            () => {
                this._pendingTimeoutId = null;
                this._log.info('Timed out waiting for ANC mode to apply');
                this._clearPending();
                this._syncToggle();
                return GLib.SOURCE_REMOVE;
            });
        this._socket?.setAncState(AncState.ON);
    }

    _onAncTurnedOn() {
        if (this._pendingMode === null || this._settleId)
            return;

        this._settleId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MODE_SETTLE_DELAY_MS, () => {
            this._settleId = null;
            this._modeSettled = true;
            if (this._ancMode === this._pendingMode) {
                this._clearPending();
                this._syncToggle();
            } else {
                this._socket?.setAncMode(this._pendingMode);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearPending() {
        if (this._settleId)
            GLib.source_remove(this._settleId);
        this._settleId = null;

        if (this._pendingTimeoutId)
            GLib.source_remove(this._pendingTimeoutId);
        this._pendingTimeoutId = null;

        this._pendingMode = null;
        this._modeSettled = false;
    }

    _syncToggle() {
        // While a requested mode is being applied, keep showing it instead of the
        // transient modes the buds report during start-up.
        if (this._pendingMode !== null)
            return;

        if (this._ancState === AncState.OFF)
            this._showUi(AncState.OFF, null);
        else if (this._ancState === AncState.ON && ancFamily(this._ancMode))
            this._showUi(AncState.ON, this._ancMode);
    }

    // Show the toggle, the sub-mode radio row for the active family and the remembered
    // sub-mode of each family.
    _showUi(state, mode) {
        const family = state === AncState.ON ? ancFamily(mode) : null;
        const props = {
            toggle1State: Modes.indexOf(family ?? 'off') + 1,
            optionsBoxVisible: family ? SubModeBox[family] : 0,
        };
        for (const [f, box] of Object.entries(SubModeBox)) {
            props[`box${box}RadioButtonState`] =
                AncSubModes[f].indexOf(f === family ? mode : this._lastSubMode[f]) + 1;
        }

        if (Object.entries(props).every(([k, v]) => this._props[k] === v))
            return;

        Object.assign(this._props, props);
        this.dataHandler?.setProps(this._props);
    }

    updateFirmware(version) {
        this._log.info(`Firmware: ${version}`);
    }

    updateAncState(value) {
        if (value !== AncState.OFF && value !== AncState.ON) {
            this._log.info(`Unknown ANC state ${hexBytes(value)}`);
            return;
        }
        this._ancState = value;
        if (value === AncState.ON)
            this._onAncTurnedOn();
        else
            this._clearPending(); // e.g. turned off on the earbud meanwhile
        this._syncToggle();
    }

    updateAncMode(value) {
        const family = ancFamily(value);
        if (!family) {
            this._log.info(`Unknown ANC mode ${hexBytes(value)}`);
            return;
        }
        this._ancMode = value;
        // Remember sub-modes chosen elsewhere (app, earbud), but not the transient mode the
        // buds report while switching on for one of our own requests.
        if (this._pendingMode === null)
            this._lastSubMode[family] = value;
        if (this._modeSettled && value === this._pendingMode)
            this._clearPending();
        this._syncToggle();
    }

    destroy() {
        if (this._startId)
            GLib.source_remove(this._startId);
        this._startId = null;
        this._clearPending();

        this._socket?.destroy();
        this._socket = null;

        if (this._batteryId)
            this._battery?.disconnect(this._batteryId);
        this._batteryId = null;
        this._battery = null;

        if (this._dataHandlerId)
            this.dataHandler?.disconnect(this._dataHandlerId);
        this._dataHandlerId = null;
        this.dataHandler = null;
    }
});
