'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {SocketHandler} from '../socketByProfile.js';
import {
    Cmd, CmdDual, Rsp, HEADER_LEN, DIRECTION_DEVICE_TO_HOST, buildPacket, checksum, decodeSoundModes,
    encodeSoundModes, decodeDualDevices, macToBytes, ButtonId, ButtonSide, TouchActionId,
    touchActionFromId, ActionDisabled, EQ_BLOCK_LENGTH, decodeEqualizer, equalizerMode,
    equalizerInfo, encodeEqualizer, equalizerForMode
} from './soundcoreConfig.js';

const SOUND_MODES_LENGTH = 7;

// The earbuds drop commands that arrive in quick succession
const TX_INTERVAL_MS = 250;

export const SoundcoreSocket = GObject.registerClass({
    GTypeName: 'BudsLink_SoundcoreSocket',
}, class SoundcoreSocket extends SocketHandler {
    _init(devicePath, profileManager, profile, callbacks, modelData) {
        super._init(devicePath, profileManager, profile);
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`SoundcoreSocket-${identifier}`);
        this._log.info('SoundcoreSocket init');

        this._callbacks = callbacks;
        this._modelData = modelData;
        this._rxBuffer = [];
        this._txQueue = [];
        this._txTimeoutId = null;
        this._buttonBytes = {};
        this._dualDevices = [];
        this._refreshTimeoutId = null;

        this.startSocket();
    }

    postConnectInitialization() {
        this.requestState();
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

    requestState() {
        this._send(buildPacket(Cmd.GET_STATE));
    }

    setSoundModes(modes) {
        this._send(buildPacket(Cmd.SET_SOUND_MODES, encodeSoundModes(modes)), 'sound-modes');
    }

    processData(bytes) {
        this._rxBuffer.push(...bytes);

        while (this._rxBuffer.length >= HEADER_LEN + 1) {
            const start = this._rxBuffer.indexOf(DIRECTION_DEVICE_TO_HOST[0]);
            if (start === -1) {
                this._rxBuffer = [];
                return;
            }
            if (start > 0)
                this._rxBuffer.splice(0, start);

            if (this._rxBuffer.length < HEADER_LEN)
                return;

            const isDeviceToHost = DIRECTION_DEVICE_TO_HOST.every((b, i) =>
                this._rxBuffer[i] === b);
            const length = this._rxBuffer[7] | this._rxBuffer[8] << 8;
            if (!isDeviceToHost || length < HEADER_LEN + 1) {
                this._rxBuffer.shift();
                continue;
            }
            if (this._rxBuffer.length < length)
                return;

            const frame = this._rxBuffer.splice(0, length);
            if (checksum(frame.slice(0, -1)) !== frame[length - 1]) {
                this._log.info(`Bad checksum: ${hexBytes(frame)}`);
                continue;
            }

            try {
                this._handleFrame(frame[5] << 8 | frame[6], frame.slice(HEADER_LEN, -1));
            } catch (e) {
                this._log.error(e, `Failed to handle frame ${hexBytes(frame)}`);
            }
        }
    }

    _handleFrame(command, body) {
        if (command === Rsp.STATE) {
            this._handleState(body);
        } else if (command === Rsp.LDAC && body.length >= 1) {
            this._callbacks.updateLdac(body[0] === 1);
            this._scheduleInitialDualRequest(100);
        } else if (command === Rsp.DUAL_DEVICES) {
            this._handleDualDevices(body);
        } else if (command === Rsp.SOUND_MODES_CHANGED && body.length >= SOUND_MODES_LENGTH) {
            this._callbacks.updateSoundModes(decodeSoundModes(body));
        }
    }

    _handleState(body) {
        const m = this._modelData;
        if (body.length !== m.stateBodyLength) {
            this._log.info(`Unexpected state length ${body.length}`);
            return;
        }

        this._emitBattery(body);

        if (m.dualConnection)
            this._callbacks.updateDualEnabled(body[m.dualEnabledOffset] === 1);

        this._emitSettings(body);
        this._emitTouchControls(body);
        this._emitEqualizer(body);

        // The earbuds ignore a query that arrives while the device list is being sent, so
        // ask for LDAC first and the device list once it has answered.
        if (m.ldac) {
            this._send(buildPacket(Cmd.GET_LDAC));
            this._scheduleInitialDualRequest(1500);
        } else if (m.dualConnection) {
            this.requestDualDevices();
        }

        const modes = body.slice(m.soundModesOffset, m.soundModesOffset + SOUND_MODES_LENGTH);
        this._callbacks.updateSoundModes(decodeSoundModes(modes));
    }

    _handleDualDevices(body) {
        const {total, index, devices} = decodeDualDevices(body);
        if (index === 1)
            this._dualDevices = [];

        this._dualDevices.push(...devices);
        if (index === total)
            this._callbacks.updateDualDevices(this._dualDevices);
    }

    _scheduleInitialDualRequest(delayMs) {
        if (!this._modelData.dualConnection)
            return;

        if (this._initDualTimeoutId)
            GLib.source_remove(this._initDualTimeoutId);

        this._initDualTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            this._initDualTimeoutId = null;
            this.requestDualDevices();
            return GLib.SOURCE_REMOVE;
        });
    }

    setDualEnabled(enabled) {
        this._send(buildPacket(CmdDual.SET_ENABLED, [enabled ? 1 : 0]));
    }

    setLdac(enabled) {
        this._send(buildPacket(Cmd.SET_LDAC, [enabled ? 1 : 0]));
    }

    requestDualDevices() {
        this._send(buildPacket(CmdDual.GET_DEVICES));
    }

    connectDualDevice(mac) {
        this._sendDualAction(CmdDual.CONNECT, mac);
    }

    disconnectDualDevice(mac) {
        this._sendDualAction(CmdDual.DISCONNECT, mac);
    }

    forgetDualDevice(mac) {
        this._sendDualAction(CmdDual.FORGET, mac);
    }

    _sendDualAction(command, mac) {
        this._send(buildPacket(command, macToBytes(mac)));

        if (this._refreshTimeoutId)
            GLib.source_remove(this._refreshTimeoutId);

        this._refreshTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._refreshTimeoutId = null;
            this.requestDualDevices();
            return GLib.SOURCE_REMOVE;
        });
    }

    _emitSettings(body) {
        const m = this._modelData;

        for (const {key, offset} of m.flags ?? [])
            this._callbacks.updateToggle(key, body[offset] === 1);

        if (m.autoPowerOff) {
            const {offset, durations} = m.autoPowerOff;
            const minutes = body[offset] === 1 ? durations[body[offset + 1]] ?? 0 : 0;
            this._callbacks.updateAutoPowerOff(minutes);
        }

        if (m.limitHighVolume) {
            const {offset} = m.limitHighVolume;
            this._callbacks.updateVolumeLimit(body[offset] === 1, body[offset + 1], body[offset + 2]);
        }
    }

    setFlag(key, enabled) {
        const flag = this._modelData.flags?.find(f => f.key === key);
        if (flag)
            this._send(buildPacket(flag.command, [enabled ? 1 : 0]));
    }

    setAutoPowerOff(minutes) {
        const {durations} = this._modelData.autoPowerOff;
        const index = durations.indexOf(minutes);
        this._send(buildPacket(Cmd.SET_AUTO_POWER_OFF,
            index === -1 ? [0, 0] : [1, index]));
    }

    setVolumeLimit(enabled, db) {
        this._send(buildPacket(Cmd.SET_LIMIT_HIGH_VOLUME, [enabled ? 1 : 0, db]));
    }

    setVolumeRefreshRate(rate) {
        this._send(buildPacket(Cmd.SET_VOLUME_REFRESH_RATE, [rate]));
    }

    _emitTouchControls(body) {
        const m = this._modelData;

        m.buttons?.order.forEach((name, index) => {
            const byte = body[m.buttons.offset + index * 2 + 1];
            this._buttonBytes[`gesture-${name}`] = byte;
            const action = byte & 0xF;
            this._callbacks.updateGesture(`gesture-${name}`,
                action === ActionDisabled ? 'none' : touchActionFromId(action));
        });

        if (m.ambientCycleOffset)
            this._callbacks.updateAmbientCycle(body[m.ambientCycleOffset] & 0xF);
    }

    setGesture(key, action) {
        const [, press, side] = key.split('-');
        const buttonId = ButtonId[press];
        const sideId = ButtonSide[side];
        if (buttonId === undefined || sideId === undefined)
            return;

        const id = action === 'none' ? ActionDisabled : TouchActionId[action];
        if (id === undefined)
            return;

        // Only the nibble for earbuds out of the case changes
        const byte = ((this._buttonBytes[key] ?? 0) & 0xF0) | id;
        this._buttonBytes[key] = byte;
        this._send(buildPacket(Cmd.SET_BUTTON_ACTION, [sideId, buttonId, byte]));
    }

    setAmbientCycle(mask) {
        this._send(buildPacket(Cmd.SET_AMBIENT_CYCLE, [mask << 4 | mask]));
    }

    _emitEqualizer(body) {
        const m = this._modelData;
        if (!m.equalizer)
            return;

        const eq = decodeEqualizer(body.slice(m.equalizer.offset,
            m.equalizer.offset + EQ_BLOCK_LENGTH));
        this._equalizer = eq;
        this._callbacks.updateEqualizer(equalizerInfo(eq, m.equalizer.freqs.length));
    }

    setEqualizer(settings) {
        if (!this._equalizer)
            return;

        // Everything but the changed parts is sent back exactly as the earbuds reported it
        const next = equalizerForMode(this._equalizer, settings);
        this._equalizer = next;
        this._send(buildPacket(Cmd.SET_EQUALIZER, encodeEqualizer(next)));
    }

    _emitBattery(body) {
        const m = this._modelData;
        const offset = m.batteryOffset;
        const status = charging => charging === 1 ? 'charging' : 'discharging';
        const percent = (level, max) => Math.max(0, Math.min(Math.round(level * 100 / max), 100));

        this._callbacks.updateBatteryProps({
            battery1Level: percent(body[offset], m.batteryMaxLevel),
            battery1Status: status(body[offset + 2]),
            battery2Level: percent(body[offset + 1], m.batteryMaxLevel),
            battery2Status: status(body[offset + 3]),
            battery3Level: percent(body[m.caseBatteryOffset], m.caseBatteryMaxLevel),
            battery3Status: 'discharging',
        });
    }

    destroy() {
        if (this._txTimeoutId)
            GLib.source_remove(this._txTimeoutId);
        this._txTimeoutId = null;
        this._txQueue = [];
        if (this._refreshTimeoutId)
            GLib.source_remove(this._refreshTimeoutId);
        this._refreshTimeoutId = null;
        if (this._initDualTimeoutId)
            GLib.source_remove(this._initDualTimeoutId);
        this._initDualTimeoutId = null;
        this._rxBuffer = [];
        super.destroy();
    }
});
