'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {SocketHandler} from '../socketByProfile.js';
import {
    GAIA_SOF, GAIA_VERSION_LEGACY, GAIA_VERSION_V3, GAIA_VERSION_V4,
    GAIA_FLAG_CHECKSUM, GAIA_FLAG_LENGTH_16, GAIA_HEADER_LEN,
    Vendor, QcCmd, QcRsp, QcNtf, QcNotificationFeatures, QcBatteryId, QcUserEqPreset,
    QcEqBandCount, CaCmd, CaRsp, CodecListLdacOn, CodecListLdacOff, LdacCodecId,
    Gesture, autoPowerOffToBytes, bytesToAutoPowerOff
} from './cambridgeBudsConfig.js';

const TX_INTERVAL_MS = 100;

const BATTERY_UNAVAILABLE = 0xFF;

export const CambridgeBudsSocket = GObject.registerClass({
    GTypeName: 'BudsLink_CambridgeBudsSocket',
}, class CambridgeBudsSocket extends SocketHandler {
    _init(devicePath, profileManager, profile, callbacks) {
        super._init(devicePath, profileManager, profile);
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`CambridgeBudsSocket-${identifier}`);
        this._log.info('CambridgeBudsSocket init');

        this._callbacks = callbacks;
        this._rxBuffer = [];
        this._txQueue = [];
        this._txTimeoutId = null;

        this.startSocket();
    }

    postConnectInitialization() {
        this._log.info('GAIA socket ready: initializing');

        this._queue(GAIA_VERSION_LEGACY, Vendor.CSR, 0x0300, []);
        this._queue(GAIA_VERSION_V3, Vendor.QUALCOMM, QcCmd.SET_TRANSPORT_INFO,
            [0x07, 0x00, 0x00, 0x00, 0x04]);
        for (const feature of QcNotificationFeatures) {
            this._queue(GAIA_VERSION_V3, Vendor.QUALCOMM, QcCmd.REGISTER_NOTIFICATION,
                [feature]);
        }

        this._qc(QcCmd.GET_APP_VERSION);
        this.requestBattery();
        this._qc(QcCmd.GET_SELECTED_EQ_PRESET);
        this._qc(QcCmd.GET_USER_EQ_BANDS, [0x00, QcEqBandCount - 1]);
        for (const gesture of Object.values(Gesture))
            this.requestGesture(gesture);

        for (const cmd of [
            CaCmd.GET_NOISE_CONTROL, CaCmd.GET_VOICE_PROMPT, CaCmd.GET_AUTO_POWER_OFF,
            CaCmd.GET_DYNAMIC_EQ, CaCmd.GET_GAMING_MODE, CaCmd.GET_WEAR_DETECTION,
            CaCmd.GET_MONO, CaCmd.GET_SLEEP, CaCmd.GET_CODECS,
        ])
            this._ca(cmd);
    }

    _buildFrame(version, vendor, command, payload) {
        return [
            GAIA_SOF, version, 0x00, payload.length,
            vendor >> 8 & 0xFF, vendor & 0xFF,
            command >> 8 & 0xFF, command & 0xFF,
            ...payload,
        ];
    }

    _queue(version, vendor, command, payload) {
        this._txQueue.push(this._buildFrame(version, vendor, command, payload));
        this._pumpTx();
    }

    _qc(command, payload = []) {
        this._queue(GAIA_VERSION_V4, Vendor.QUALCOMM, command, payload);
    }

    _ca(command, payload = []) {
        this._queue(GAIA_VERSION_V4, Vendor.CAMBRIDGE, command, payload);
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
            const checksumLen = flags & GAIA_FLAG_CHECKSUM ? 1 : 0;
            const frameLen = headerLen + len + checksumLen;
            if (this._rxBuffer.length < frameLen)
                return;

            const frame = this._rxBuffer.splice(0, frameLen);
            const o = headerLen - 4;
            const vendor = frame[o] << 8 | frame[o + 1];
            const command = frame[o + 2] << 8 | frame[o + 3];
            const payload = frame.slice(headerLen, headerLen + len);

            try {
                this._handleFrame(vendor, command, payload);
            } catch (e) {
                this._log.error(e, `Failed to handle frame ${hexBytes(frame)}`);
            }
        }
    }

    _handleFrame(vendor, command, payload) {
        if (vendor === Vendor.QUALCOMM)
            this._handleQualcomm(command, payload);
        else if (vendor === Vendor.CAMBRIDGE)
            this._handleCambridge(command, payload);
    }

    _handleQualcomm(command, payload) {
        switch (command) {
            case QcRsp.GET_APP_VERSION:
                this._callbacks.updateFirmware(String.fromCharCode(...payload));
                break;

            case QcRsp.GET_BATTERY_LEVELS: {
                const levels = {};
                for (let i = 0; i + 1 < payload.length; i += 2)
                    levels[payload[i]] = payload[i + 1];

                this._emitBattery(levels[QcBatteryId.LEFT], levels[QcBatteryId.RIGHT],
                    levels[QcBatteryId.CASE]);
                break;
            }

            case QcRsp.GET_SELECTED_EQ_PRESET:
                if (payload[0] !== QcUserEqPreset) {
                    this._log.info(`EQ preset is ${hexBytes(payload[0])}; selecting user EQ`);
                    this._qc(QcCmd.SET_SELECTED_EQ_PRESET, [QcUserEqPreset]);
                }
                break;

            case QcNtf.GESTURE_CHANGED:
                if (payload.length > 0)
                    this.requestGesture(payload[0]);
                break;

            case QcRsp.GET_GESTURE_CONFIG: {
                if (payload.length < 1 || (payload.length - 1) % 2 !== 0)
                    break;

                const entries = [];
                for (let i = 1; i < payload.length; i += 2)
                    entries.push(payload[i] << 8 | payload[i + 1]);
                this._callbacks.updateGesture(payload[0], entries);
                break;
            }

            case QcNtf.USER_EQ_BANDS_CHANGED:
                this._qc(QcCmd.GET_USER_EQ_BANDS, [0x00, QcEqBandCount - 1]);
                break;

            case QcRsp.GET_USER_EQ_BANDS: {
                const gains = [];
                for (let i = 2; i + 6 < payload.length; i += 7) {
                    const raw = payload[i + 5] << 8 | payload[i + 6];
                    gains.push(raw > 0x7FFF ? raw - 0x10000 : raw);
                }
                if (gains.length === QcEqBandCount)
                    this._callbacks.updateEqGains(gains);
                break;
            }
        }
    }

    _handleCambridge(command, payload) {
        const value = payload[0];

        if (command === CaRsp.STATUS) {
            if (payload.length >= 7)
                this._emitBattery(payload[4], payload[5], payload[6]);
            return;
        }

        if (command === CaRsp.CODECS) {
            this._callbacks.updateLdac(payload.includes(LdacCodecId));
            return;
        }

        if (CaRsp.NOISE_CONTROL.includes(command)) {
            this._callbacks.updateNoiseControl(value);
        } else if (CaRsp.VOICE_PROMPT.includes(command)) {
            this._callbacks.updateVoicePrompt(value);
        } else if (CaRsp.AUTO_POWER_OFF.includes(command)) {
            const minutes = bytesToAutoPowerOff(payload);
            if (minutes !== null)
                this._callbacks.updateAutoPowerOff(minutes);
        } else {
            const toggles = [
                [CaRsp.DYNAMIC_EQ, 'dynamic-eq'],
                [CaRsp.GAMING_MODE, 'gaming-mode'],
                [CaRsp.WEAR_DETECTION, 'wear-detection'],
                [CaRsp.MONO, 'mono'],
                [CaRsp.SLEEP, 'sleep-mode'],
            ];
            const toggle = toggles.find(([cmds]) => cmds.includes(command));
            if (toggle && (value === 0x00 || value === 0x01))
                this._callbacks.updateToggle(toggle[1], value === 0x01);
        }
    }

    _emitBattery(left, right, caseLevel) {
        const component = level => {
            if (level === undefined || level === BATTERY_UNAVAILABLE || level > 100)
                return {level: 0, status: 'disconnected'};

            return {level, status: 'discharging'};
        };

        const l = component(left);
        const r = component(right);
        const c = component(caseLevel);

        this._callbacks.updateBatteryProps({
            battery1Level: l.level,
            battery1Status: l.status,
            battery2Level: r.level,
            battery2Status: r.status,
            battery3Level: c.level,
            battery3Status: c.status,
        });
    }

    requestBattery() {
        this._qc(QcCmd.GET_BATTERY_LEVELS,
            [QcBatteryId.CASE, QcBatteryId.LEFT, QcBatteryId.RIGHT, QcBatteryId.SINGLE]);
    }

    setNoiseControl(mode) {
        this._ca(CaCmd.SET_NOISE_CONTROL, [mode]);
    }

    setToggle(key, enabled) {
        const commands = {
            'dynamic-eq': CaCmd.SET_DYNAMIC_EQ,
            'gaming-mode': CaCmd.SET_GAMING_MODE,
            'wear-detection': CaCmd.SET_WEAR_DETECTION,
            'mono': CaCmd.SET_MONO,
            'sleep-mode': CaCmd.SET_SLEEP,
        };
        if (key in commands)
            this._ca(commands[key], [enabled ? 0x01 : 0x00]);
    }

    setVoicePrompt(value) {
        this._ca(CaCmd.SET_VOICE_PROMPT, [value]);
    }

    setAutoPowerOff(minutes) {
        this._ca(CaCmd.SET_AUTO_POWER_OFF, autoPowerOffToBytes(minutes));
    }

    setLdac(enabled) {
        this._ca(CaCmd.SET_CODECS, enabled ? CodecListLdacOn : CodecListLdacOff);
    }

    requestGesture(gesture) {
        this._qc(QcCmd.GET_GESTURE_CONFIG, [gesture, 0x00]);
    }

    setGesture(gesture, entries) {
        const payload = [gesture, 0x00];
        for (const entry of entries)
            payload.push(entry >> 8 & 0xFF, entry & 0xFF);
        this._qc(QcCmd.SET_GESTURE_CONFIG, payload);
    }

    setEqGains(gains) {
        const payload = [0x00, QcEqBandCount - 1];
        for (const gain of gains) {
            const raw = gain < 0 ? gain + 0x10000 : gain;
            payload.push(raw >> 8 & 0xFF, raw & 0xFF);
        }
        this._qc(QcCmd.SET_USER_EQ_BANDS, payload);
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
