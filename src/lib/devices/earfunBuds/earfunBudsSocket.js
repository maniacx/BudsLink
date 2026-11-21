'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {SocketHandler} from '../socketByProfile.js';
import {
    Frame, Cmd, SetCmd, InitialRequests, TouchActionLayout, GestureType, buildPacket, buildEqBandPacket,
    EqFrequencies
} from './earfunBudsConfig.js';

// The earbuds answer a burst of requests, but drop frames that are sent far too fast
const TX_INTERVAL_MS = 30;

export const EarfunBudsSocket = GObject.registerClass({
    GTypeName: 'BudsLink_EarfunBudsSocket',
}, class EarfunBudsSocket extends SocketHandler {
    _init(devicePath, profileManager, profile, callbacks) {
        super._init(devicePath, profileManager, profile);
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`EarfunBudsSocket-${identifier}`);
        this._log.info('EarfunBudsSocket init');

        this._callbacks = callbacks;
        this._rxBuffer = [];
        this._txQueue = [];
        this._txTimeoutId = null;
        this._readBackTimeouts = new Map();
        this._battery = {left: 0, right: 0, case: 0};

        this.startSocket();
    }

    postConnectInitialization() {
        for (const command of InitialRequests)
            this._send(buildPacket(command));
    }

    // A packet with a tag replaces a still queued one with the same tag, so only the last
    // value of a quickly changing setting is sent
    _send(packet, tag = null) {
        const queued = tag ? this._txQueue.findIndex(item => item.tag === tag) : -1;
        if (queued !== -1)
            this._txQueue[queued] = {packet, tag};
        else
            this._txQueue.push({packet, tag});

        this._pumpTx();
    }

    _pumpTx() {
        if (this._txTimeoutId || this._txQueue.length === 0)
            return;

        this.sendMessage(this._txQueue.shift().packet);
        this._txTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TX_INTERVAL_MS, () => {
            this._txTimeoutId = null;
            this._pumpTx();
            return GLib.SOURCE_REMOVE;
        });
    }

    _set(command, value, tag = null) {
        this._send(buildPacket(command, [value & 0xFF]), tag ?? `set-${command}`);
    }

    setAmbientMode(mode) {
        this._set(SetCmd.AMBIENT, mode);
    }

    setAncMode(value) {
        this._set(SetCmd.ANC, value);
    }

    setTransparencyMode(value) {
        this._set(SetCmd.TRANSPARENCY, value);
    }

    setGameMode(enabled) {
        this._set(SetCmd.GAME_MODE, enabled ? 1 : 0);
    }

    setInEarMask(mask) {
        this._set(SetCmd.IN_EAR, mask);
    }

    setTouchMode(mode) {
        this._set(SetCmd.TOUCH_MODE, mode);
    }

    // Left and right earbud are set in one frame, the side that is not set sends zeros
    setTouchAction(type, side, action) {
        const payload = side === 'left' ? [type, action, 0, 0] : [0, 0, type, action];
        this._send(buildPacket(SetCmd.TOUCH_ACTION, payload), `touch-${type}-${side}`);
    }

    // Asks for a state a moment after it was set, for settings the earbuds do not announce
    _readBack(command) {
        const previous = this._readBackTimeouts.get(command);
        if (previous)
            GLib.source_remove(previous);

        this._readBackTimeouts.set(command, GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
            this._readBackTimeouts.delete(command);
            this._send(buildPacket(command), `get-${command}`);
            return GLib.SOURCE_REMOVE;
        }));
    }

    setMicMode(mode) {
        this._set(SetCmd.MIC, mode);
    }

    setVoicePromptVolume(value) {
        this._set(SetCmd.VOICE_PROMPT, value);
    }

    setVolumeLimit(step) {
        this._set(SetCmd.VOICE_PROTECT, step);
    }

    setBalance(value) {
        this._set(SetCmd.BALANCE, value);
    }

    // The earbuds do not announce this change on their own, so the state is read back
    setMultipoint(enabled) {
        this._set(SetCmd.MULTIPOINT, enabled ? 1 : 0);
        this._readBack(Cmd.MULTIPOINT);
    }

    // The earbuds restart after a codec change
    setCodec(value) {
        this._set(SetCmd.CODEC, value);
    }

    setFindDevice(mode) {
        this._set(SetCmd.FIND_DEVICE, mode);
    }

    // The earbuds restart, or at least disconnect, when the mode changes
    setAdvancedAudio(mode) {
        this._set(SetCmd.ADVANCED_AUDIO, mode);
        this._readBack(Cmd.ADVANCED_AUDIO);
    }

    // The new name is used by the earbuds after they are paired again
    setDeviceName(name) {
        const bytes = Array.from(new TextEncoder().encode(name));
        this._send(buildPacket(SetCmd.DEVICE_NAME, bytes), 'device-name');
    }

    // gains: ten values in dB. The earbuds expect all bands each time
    setEqualizer(gains) {
        for (let band = 0; band < EqFrequencies.length; band++)
            this._send(buildEqBandPacket(band, gains[band] ?? 0), `eq-${band}`);
    }

    processData(bytes) {
        this._rxBuffer.push(...bytes);

        while (this._rxBuffer.length >= Frame.HEADER_LEN) {
            const start = this._rxBuffer.indexOf(Frame.SOP);
            if (start === -1) {
                this._rxBuffer = [];
                return;
            }
            if (start > 0)
                this._rxBuffer.splice(0, start);

            if (this._rxBuffer.length < Frame.HEADER_LEN)
                return;

            const [, version, flags, length] = this._rxBuffer;
            const vendor = this._rxBuffer[4] << 8 | this._rxBuffer[5];
            if (version !== Frame.VERSION && version !== 0x03 || flags !== Frame.FLAGS ||
                    vendor !== Frame.VENDOR && vendor !== Frame.VENDOR_EQ) {
                this._rxBuffer.shift();
                continue;
            }

            if (this._rxBuffer.length < Frame.HEADER_LEN + length)
                return;

            const frame = this._rxBuffer.splice(0, Frame.HEADER_LEN + length);
            const command = (frame[6] << 8 | frame[7]) & ~Frame.ACK_MASK;
            try {
                this._handleFrame(command, frame.slice(Frame.HEADER_LEN));
            } catch (e) {
                this._log.error(e, `Failed to handle frame ${hexBytes(frame)}`);
            }
        }
    }

    // A reply and a notification both start with a status byte, followed by the value
    _handleFrame(command, payload) {
        const value = payload[1];
        const cb = this._callbacks;

        switch (command) {
            case Cmd.FIRMWARE:
                cb.updateFirmware(new TextDecoder().decode(Uint8Array.from(payload.slice(1))));
                break;
            case Cmd.SERIAL_NUMBER:
                // One reply per earbud: the side (0 left, 1 right), then the serial as text
                cb.updateSerial(value === 1 ? 'right' : 'left',
                    new TextDecoder().decode(Uint8Array.from(payload.slice(2))));
                break;
            case Cmd.BATTERY_LEFT:
                this._updateBattery('left', value);
                break;
            case Cmd.BATTERY_RIGHT:
                this._updateBattery('right', value);
                break;
            case Cmd.BATTERY_CASE:
                this._updateBattery('case', value);
                break;
            case Cmd.AMBIENT:
                cb.updateAmbientMode(value);
                break;
            case Cmd.ANC:
                cb.updateAncMode(value);
                break;
            case Cmd.TRANSPARENCY:
                cb.updateTransparencyMode(value);
                break;
            case Cmd.GAME_MODE:
                cb.updateGameMode(value === 1);
                break;
            case Cmd.IN_EAR:
                cb.updateInEarMask(value);
                break;
            case Cmd.TOUCH_MODE:
                cb.updateTouchMode(value);
                break;
            case Cmd.TOUCH_ACTION:
                this._handleTouchActions(payload.slice(1));
                break;
            case Cmd.MULTIPOINT:
                cb.updateMultipoint(value === 1);
                break;
            case Cmd.CODEC:
                cb.updateCodec(value);
                break;
            case Cmd.MIC:
                cb.updateMicMode(value);
                break;
            case Cmd.VOICE_PROMPT:
                cb.updateVoicePromptVolume(value);
                break;
            case Cmd.VOICE_PROTECT:
                cb.updateVolumeLimit(value);
                break;
            case Cmd.BALANCE:
                cb.updateBalance(value);
                break;
            case Cmd.FIND_DEVICE:
                cb.updateFindDevice(value);
                break;
            case Cmd.ADVANCED_AUDIO:
                cb.updateAdvancedAudio(value);
                break;
            default:
                break;
        }
    }

    _updateBattery(part, level) {
        if (level === undefined || level > 100)
            return;

        this._battery[part] = level;
        const status = level > 0 ? 'discharging' : 'disconnected';
        const key = {left: 'battery1', right: 'battery2', case: 'battery3'}[part];
        this._callbacks.updateBatteryProps({
            [`${key}Level`]: level,
            [`${key}Status`]: status,
        });
    }

    // Pairs of (type, action): left, right for each kind of gesture
    _handleTouchActions(body) {
        const actions = {};
        for (let i = 0; i + 1 < body.length; i += 2) {
            const [type, action] = [body[i], body[i + 1]];
            const side = i / 2 % 2 === 0 ? 'left' : 'right';
            actions[`${type}-${side}`] = action;
        }

        const result = {};
        for (const [type, name] of TouchActionLayout) {
            for (const side of ['left', 'right']) {
                const action = actions[`${type}-${side}`];
                if (action !== undefined)
                    result[`${name}-${side}`] = action;
            }
        }
        for (const [type, name] of [[GestureType.callTriple, 'calltriple'], [GestureType.callLong, 'calllong']]) {
            for (const side of ['left', 'right']) {
                const action = actions[`${type}-${side}`];
                if (action !== undefined)
                    result[`${name}-${side}`] = action;
            }
        }

        this._callbacks.updateGestures(result);
    }

    destroy() {
        if (this._txTimeoutId)
            GLib.source_remove(this._txTimeoutId);
        this._txTimeoutId = null;
        this._txQueue = [];

        for (const id of this._readBackTimeouts.values())
            GLib.source_remove(id);
        this._readBackTimeouts.clear();

        super.destroy();
    }
});
