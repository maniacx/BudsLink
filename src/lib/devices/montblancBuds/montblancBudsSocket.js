'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {SocketHandler} from '../socketByProfile.js';
import {
    GAIA_SOF, GAIA_VERSION_LEGACY, GAIA_VERSION_V4, GAIA_FLAG_CHECKSUM, GAIA_FLAG_LENGTH_16,
    GAIA_HEADER_LEN, Vendor, Feature, PacketType, gaiaCommand, CoreCmd, CoreRsp,
    AncId, AncNtfId
} from './montblancBudsConfig.js';

const TX_INTERVAL_MS = 100;

const ancCmd = id => gaiaCommand(Feature.ANC, PacketType.COMMAND, id);

export const MontblancBudsSocket = GObject.registerClass({
    GTypeName: 'BudsLink_MontblancBudsSocket',
}, class MontblancBudsSocket extends SocketHandler {
    constructor(devicePath, profileManager, profile, callbacks) {
        super(devicePath, profileManager, profile);
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`MontblancBudsSocket-${identifier}`);
        this._log.info('MontblancBudsSocket init');

        this._callbacks = callbacks;
        this._rxBuffer = [];
        this._txQueue = [];
        this._txTimeoutId = null;

        this.startSocket();
    }

    postConnectInitialization() {
        this._log.info('GAIA socket ready: initializing');

        this._queue(GAIA_VERSION_LEGACY, Vendor.CSR, 0x0300, []);
        this._qc(CoreCmd.SET_TRANSPORT_INFO, [0x07, 0x00, 0x00, 0x00, 0x04]);
        // Registering ANC notifications also makes the buds report current state and mode.
        this._qc(CoreCmd.REGISTER_NOTIFICATION, [Feature.ANC]);
        this._qc(CoreCmd.GET_APP_VERSION);
        this._qc(ancCmd(AncId.GET_STATE));
        this._qc(ancCmd(AncId.GET_MODE));
    }

    _queue(version, vendor, command, payload) {
        this._txQueue.push([
            GAIA_SOF, version, 0x00, payload.length,
            vendor >> 8 & 0xFF, vendor & 0xFF,
            command >> 8 & 0xFF, command & 0xFF,
            ...payload,
        ]);
        this._pumpTx();
    }

    _qc(command, payload = []) {
        this._queue(GAIA_VERSION_V4, Vendor.QUALCOMM, command, payload);
    }

    _pumpTx() {
        if (this._txTimeoutId || this._txQueue.length === 0)
            return;

        this.sendMessage(this._txQueue.shift());

        this._txTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TX_INTERVAL_MS, () => {
            this._txTimeoutId = null;
            this._pumpTx();
            return GLib.SOURCE_REMOVE;
        });
    }

    processData(bytes) {
        this._rxBuffer.push(...bytes);

        while (this._rxBuffer.length > 0) {
            const start = this._rxBuffer.indexOf(GAIA_SOF);
            if (start === -1) {
                this._rxBuffer = [];
                return;
            }
            if (start > 0)
                this._rxBuffer.splice(0, start);

            if (this._rxBuffer.length < 4)
                return;

            const flags = this._rxBuffer[2];
            const wideLength = (flags & GAIA_FLAG_LENGTH_16) !== 0;
            const headerLen = wideLength ? GAIA_HEADER_LEN + 1 : GAIA_HEADER_LEN;
            if (this._rxBuffer.length < headerLen)
                return;

            const len = wideLength
                ? this._rxBuffer[3] << 8 | this._rxBuffer[4]
                : this._rxBuffer[3];
            const frameLen = headerLen + len + (flags & GAIA_FLAG_CHECKSUM ? 1 : 0);
            if (this._rxBuffer.length < frameLen)
                return;

            const frame = this._rxBuffer.splice(0, frameLen);
            const o = headerLen - 4;
            const vendor = frame[o] << 8 | frame[o + 1];
            const command = frame[o + 2] << 8 | frame[o + 3];
            const payload = frame.slice(headerLen, headerLen + len);

            try {
                if (vendor === Vendor.QUALCOMM)
                    this._handleQualcomm(command, payload);
            } catch (e) {
                this._log.error(e, `Failed to handle frame ${hexBytes(frame)}`);
            }
        }
    }

    _handleQualcomm(command, payload) {
        if (command === CoreRsp.GET_APP_VERSION) {
            this._callbacks.updateFirmware(String.fromCharCode(...payload));
            return;
        }

        const feature = command >> 9;
        const type = command >> 7 & 0x03;
        const id = command & 0x7F;
        if (feature !== Feature.ANC || payload.length < 1)
            return;

        const value = payload[0];
        if (type === PacketType.NOTIFICATION) {
            if (id === AncNtfId.STATE)
                this._callbacks.updateAncState(value);
            else if (id === AncNtfId.MODE)
                this._callbacks.updateAncMode(value);
        } else if (type === PacketType.RESPONSE) {
            if (id === AncId.GET_STATE)
                this._callbacks.updateAncState(value);
            else if (id === AncId.GET_MODE)
                this._callbacks.updateAncMode(value);
        } else if (type === PacketType.ERROR) {
            this._log.info(`ANC command 0x${id.toString(16)} rejected: ${hexBytes(payload)}`);
        }
    }

    setAncState(state) {
        this._qc(ancCmd(AncId.SET_STATE), [state]);
    }

    setAncMode(mode) {
        this._qc(ancCmd(AncId.SET_MODE), [mode]);
    }

    destroy() {
        if (this._txTimeoutId)
            GLib.source_remove(this._txTimeoutId);
        this._txTimeoutId = null;
        this._txQueue = [];
        this._rxBuffer = [];
        super.destroy();
    }
});
