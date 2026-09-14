'use strict';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {SocketHandler} from '../socketByProfile.js';
import {
    CommandType, FrameHeader, FindDevice
} from './oneMoreBudsConfig.js';

export const OneMoreBudsSocket = GObject.registerClass({
    GTypeName: 'BudsLink_OneMoreSocket',
}, class OneMoreBudsSocket extends SocketHandler {
    _init(devicePath, profileManager, profile, modelData, callbacks) {
        super._init(devicePath, profileManager, profile);
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`OneMoreSocket-${identifier}`);
        this._log.info('OneMoreSocket init');

        this._callbacks = callbacks;
        this._rxBuffer = [];
        this._seq = 0;
        this._modelData = modelData;
        this._pendingInitResponse = null;

        this.startSocket();
    }

    destroy() {
        if (this._pendingInitResponse) {
            if (this._pendingInitResponse.timeoutId)
                GLib.source_remove(this._pendingInitResponse.timeoutId);
            this._pendingInitResponse = null;
        }
        super.destroy();
    }

    async postConnectInitialization() {
        /* The SonoFlow firmware processes one frame at a time: commands sent
           in a burst before the previous reply arrives are dropped. Send each
           command, waiting for its reply before moving on. */
        await this._sendCommandAndWait(CommandType.SHAKE_HAND, [0x01]);
        await this._sendCommandAndWait(CommandType.BINAURAL_INFO);

        if (this._modelData?.noiseControl)
            await this._sendCommandAndWait(CommandType.LISTEN_MODE_GET);

        if (this._modelData?.equalizer)
            await this._sendCommandAndWait(
                this._getEqCommand(CommandType.EQ_MODE_GET));

        if (this._modelData?.gestures) {
            await this._sendCommandAndWait(CommandType.DOUBLE_CLICK_GET);
            await this._sendCommandAndWait(CommandType.TRIPLE_CLICK_GET);
        }
    }

    _sendCommandAndWait(command, payload = []) {
        return new Promise(resolve => {
            this._pendingInitResponse = {
                resolve,
                timeoutId: GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
                    this._pendingInitResponse = null;
                    resolve();
                    return GLib.SOURCE_REMOVE;
                }),
            };
            this._sendCommand(command, payload);
        });
    }

    /* --------------------------------------------------------------- framing */

    /* Over-ear models expose the sound-style selector (0x69/0x6A); the
       earbuds use the EQ-mode selector (0x3B/0x3C). */
    _getEqCommand(setOrGet) {
        return this._modelData?.eqPresetModel === 'presetSound'
            ? setOrGet === CommandType.EQ_MODE_GET
                ? CommandType.PRESET_SOUND_GET
                : CommandType.PRESET_SOUND_SET
            : setOrGet;
    }

    _nextSeq() {
        this._seq = (this._seq + 1) & 0xFFFF;
        return this._seq;
    }

    /* CmdKt.makeData: [flag][port][cmdHi][cmdLo][lenHi][lenLo][seqHi][seqLo]
       checksum = XOR of the 8 header bytes. Multi-byte fields big-endian. */
    _encode(command, payload = []) {
        const cmdHi = command >> 8 & 0xFF;
        const cmdLo = command & 0xFF;
        const len = payload.length;
        const seq = this._nextSeq();

        const header = [
            FrameHeader.SPP_FLAG,
            FrameHeader.SPP_PORT,
            cmdHi,
            cmdLo,
            len >> 8 & 0xFF,
            len & 0xFF,
            seq >> 8 & 0xFF,
            seq & 0xFF,
        ];

        const checksum = header.reduce((acc, b) => acc ^ b, 0);

        return [...header, checksum, ...payload];
    }

    _sendCommand(command, payload = [], loginfo = '') {
        if (loginfo)
            this._log.info(loginfo);

        this.sendMessage(this._encode(command, payload));
    }

    /* --------------------------------------------------------------- decoding */

    processData(data) {
        this._rxBuffer.push(...data);

        while (this._rxBuffer.length >= FrameHeader.HEADER_LEN) {
            /* Discard leading garbage up to the SPP / BLE flag byte. */
            const start = this._rxBuffer.findIndex(b =>
                b === FrameHeader.SPP_FLAG || b === FrameHeader.BLE_FLAG);
            if (start === -1) {
                this._rxBuffer = [];
                return;
            }

            if (start > 0)
                this._rxBuffer.splice(0, start);

            const frame = this._takeFrame();
            if (!frame)
                return;

            this._handleFrame(frame);
        }
    }

    /* Removes and returns one complete frame, or null once more bytes are
       needed. The header length is big-endian and counts the payload only. */
    _takeFrame() {
        const buf = this._rxBuffer;
        const flag = buf[0];
        const port = buf[1];

        const cmdHi = buf[2];
        const cmdLo = buf[3];
        const lenHi = buf[4];
        const lenLo = buf[5];

        const length = lenHi << 8 | lenLo;
        const total = FrameHeader.HEADER_LEN + length;

        if (buf.length < total)
            return null;

        const raw = buf.splice(0, total);
        const header = raw.slice(0, 8);
        const expected = header.reduce((acc, b) => acc ^ b, 0);

        if (raw[8] !== expected) {
            this._log.info(
                `Checksum mismatch: expected ${hexBytes(expected)} ` +
                `got ${hexBytes(raw[8])}`);
            return null;
        }

        if (flag === FrameHeader.SPP_FLAG && port !== FrameHeader.SPP_PORT) {
            this._log.info(`Unexpected SPP port ${hexBytes(port)}`);
            return null;
        }

        return {
            command: cmdHi << 8 | cmdLo,
            payload: raw.slice(9),
        };
    }

    _handleFrame({command, payload}) {
        this._log.info(
            `Received cmd ${hexBytes(command)} payload ${hexBytes(payload)}`);

        if (this._pendingInitResponse) {
            const pending = this._pendingInitResponse;
            this._pendingInitResponse = null;
            if (pending.timeoutId)
                GLib.source_remove(pending.timeoutId);
            pending.resolve();
        }

        switch (command) {
            case CommandType.SHAKE_HAND:
                this._callbacks.updateHandshake(payload);
                break;

            case CommandType.BINAURAL_INFO:
                this._callbacks.updateBinauralInfo(payload);
                break;

            case CommandType.LISTEN_MODE_GET:
            case CommandType.EQ_MODE_GET:
            case CommandType.PRESET_SOUND_GET:
            case CommandType.DOUBLE_CLICK_GET:
            case CommandType.TRIPLE_CLICK_GET: {
                if (payload.length < 1)
                    break;
                const value = payload[0];

                if (command === CommandType.LISTEN_MODE_GET)
                    this._callbacks.updateNoiseControl(value);
                else if (command === CommandType.EQ_MODE_GET ||
                        command === CommandType.PRESET_SOUND_GET)
                    this._callbacks.updateEq(value);
                else if (command === CommandType.DOUBLE_CLICK_GET)
                    this._callbacks.updateDoubleClick(value);
                else
                    this._callbacks.updateTripleClick(value);
                break;
            }

            /* SET replies carry only a result byte (0 failure, 1 success,
               2 binaural pairing) — log it and move on. */
            case CommandType.LISTEN_MODE_SET:
            case CommandType.EQ_MODE_SET:
            case CommandType.PRESET_SOUND_SET:
            case CommandType.DOUBLE_CLICK_SET:
            case CommandType.TRIPLE_CLICK_SET:
                break;

            default:
                break;
        }
    }

    /* --------------------------------------------------------------- setters */

    setNoiseControl(mode) {
        this._sendCommand(CommandType.LISTEN_MODE_SET, [mode],
            `Set listen mode: ${hexBytes(mode)}`);
    }

    setEqPreset(preset) {
        this._sendCommand(this._getEqCommand(CommandType.EQ_MODE_SET), [preset],
            `Set EQ preset: ${hexBytes(preset)}`);
    }

    setDoubleClick(action) {
        this._sendCommand(CommandType.DOUBLE_CLICK_SET, [action],
            `Set double click: ${hexBytes(action)}`);
    }

    setTripleClick(action) {
        this._sendCommand(CommandType.TRIPLE_CLICK_SET, [action],
            `Set triple click: ${hexBytes(action)}`);
    }

    /* The find-my-device command is exempt from the XOR checksum the rest of
       the protocol uses: the SonoFlow firmware only honours the literal
       checksum 0x78 that the official app always sends for cmd 0x5A
       (BluetoothOrderConstents CMD_FindDevice frame). */
    _sendFindCommand(payload, loginfo) {
        if (loginfo)
            this._log.info(loginfo);

        const seq = this._nextSeq();

        this.sendMessage(new Uint8Array([
            FrameHeader.SPP_FLAG,
            FrameHeader.SPP_PORT,
            0x00,
            CommandType.FIND_DEVICE,
            0x00,
            payload.length,
            seq >> 8 & 0xFF,
            seq & 0xFF,
            0x78,
            ...payload,
        ]));
    }

    findLeft() {
        this._sendFindCommand(FindDevice.LEFT_RING, 'Find left earcup');
    }

    findRight() {
        this._sendFindCommand(FindDevice.RIGHT_RING, 'Find right earcup');
    }

    findStop() {
        this._sendFindCommand(FindDevice.STOP, 'Stop find-my-device');
    }
});