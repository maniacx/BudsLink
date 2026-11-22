'use strict';

// Client for the Qualcomm upgrade protocol (feature 6 of the Qualcomm GAIA protocol) that the
// earbuds use to take a voice pack (and firmware). The sequence follows the app of the vendor
// (recorded in a HCI snoop): a sync tells which part of an earlier transfer is still valid, the
// earbuds then ask for the bytes of the file, check it, restart and ask for a commit.
//
// This file has no dependency on GLib, so that the sequence can be tested without hardware.

export const Gaia = {
    VENDOR: 0x001D,
    // Commands of the upgrade feature
    CONNECT: 0x0C00,
    DISCONNECT: 0x0C01,
    CONTROL: 0x0C02,
    // Replies to them
    CONNECT_REPLY: 0x0D00,
    DISCONNECT_REPLY: 0x0D01,
    CONTROL_REPLY: 0x0D02,
    // The earbuds send their upgrade messages as notifications
    NOTIFICATION: 0x0C80,
    // Setup the app does before it starts (transport parameters and the notification of feature 6)
    SET_TRANSPORT_PARAM: 0x000D,
    REGISTER_NOTIFICATION: 0x0007,
};

export const Op = {
    START_REQ: 0x01,
    START_CFM: 0x02,
    DATA_BYTES_REQ: 0x03,
    DATA: 0x04,
    ABORT_REQ: 0x07,
    ABORT_CFM: 0x08,
    TRANSFER_COMPLETE_IND: 0x0B,
    TRANSFER_COMPLETE_RES: 0x0C,
    IN_PROGRESS_RES: 0x0E,
    COMMIT_REQ: 0x0F,
    COMMIT_CFM: 0x10,
    ERROR_IND: 0x11,
    COMPLETE_IND: 0x12,
    SYNC_REQ: 0x13,
    SYNC_CFM: 0x14,
    START_DATA_REQ: 0x15,
    IS_VALIDATION_DONE_REQ: 0x16,
    IS_VALIDATION_DONE_CFM: 0x17,
    ERROR_RES: 0x1F,
    SILENT_COMMIT_REQ: 0x20,
    SILENT_COMMIT_CFM: 0x21,
    EARBUDS_IN_CASE_REQ: 0x23,
    EARBUDS_IN_CASE_CFM: 0x24,
};

const ResumePoint = {
    START: 0,
    PRE_VALIDATE: 1,
    PRE_REBOOT: 2,
    POST_REBOOT: 3,
    COMMIT: 4,
    POST_COMMIT: 5,
};

export const State = {
    IDLE: 'idle',
    SETUP: 'setup',
    SYNC: 'sync',
    UPLOAD: 'upload',
    VALIDATE: 'validate',
    TRANSFERRED: 'transferred',
    REBOOT: 'reboot',
    COMMIT: 'commit',
    DONE: 'done',
    FAILED: 'failed',
};

// Size of the bytes of the file in one message. The app of the vendor sent 400
export const ChunkSize = 400;
const SUPPORTED_PROTOCOL = 5;
const ACK_TIMEOUT_MS = 8000;
// The earbuds send something at least this often while a transfer runs
const SILENCE_MS = 40000;
const SETUP_GAP_MS = 100;
const START_RETRIES = 5;
const START_RETRY_MS = 2000;

// Error codes of the earbuds (a part): text for the ones that need to be told to the user
const ErrorTexts = {
    0x21: 'battery low',
    0x81: 'the file is a different one',
};

export function md5Tail(md5hex) {
    return md5hex.slice(-8);
}

export function buildFrame(command, payload = []) {
    const length = payload.length;
    const header = length > 0xFF
        ? [0xFF, 0x04, 0x02, length >> 8 & 0xFF, length & 0xFF]
        : [0xFF, 0x04, 0x00, length];
    return [...header, Gaia.VENDOR >> 8, Gaia.VENDOR & 0xFF, command >> 8 & 0xFF, command & 0xFF,
        ...payload];
}

function message(opcode, content = []) {
    return [opcode, content.length >> 8 & 0xFF, content.length & 0xFF, ...content];
}

export class UpgradeClient {
    // file: Uint8Array with the upgrade file, fileId: the last four bytes of its MD5 (array)
    // hooks: {send(frame), setTimer(ms, fn) -> id, clearTimer(id), onState(state, info), log(text)}
    // resumeOnly: only finish a transfer that was made before (no file bytes are sent)
    constructor(file, fileId, hooks, resumeOnly = false) {
        this._resumeOnly = resumeOnly;
        this._watchdog = null;
        this._file = file;
        this._fileId = fileId;
        this._hooks = hooks;
        this._state = State.IDLE;
        this._queue = [];
        this._awaitingAck = false;
        this._ackTimer = null;
        this._startTimer = null;
        this._startAttempts = 0;
        this._offset = 0;
        this._remaining = 0;
        this._protocol = 0;
        this._resume = ResumePoint.START;
        this._silentCommit = false;
        this._finished = false;
        this._aborting = false;
    }

    get state() {
        return this._state;
    }

    get finished() {
        return this._finished;
    }

    // Prepares the transport as the app does, then opens the upgrade mode
    start() {
        this._setState(State.SETUP);
        this._touch();
        // The earbuds drop frames that follow each other too fast, so the setup is paced
        const setup = [
            [Gaia.SET_TRANSPORT_PARAM, [0x07, 0x00, 0x00, 0x00, 0x04]],
            [Gaia.SET_TRANSPORT_PARAM, [0x01, 0x00, 0x01, 0x00, 0x09]],
            [Gaia.REGISTER_NOTIFICATION, [0x06]],
        ];
        setup.forEach(([command, payload], i) =>
            this._hooks.setTimer(i * SETUP_GAP_MS + 1, () => this._sendPlain(command, payload)));
        this._hooks.setTimer(setup.length * SETUP_GAP_MS + 200, () => {
            this._sendPlain(Gaia.CONNECT, []);
            this._expectAck(Gaia.CONNECT_REPLY);
        });
    }

    abort(reason = 'aborted') {
        if (this._finished || this._aborting)
            return;

        this._aborting = true;
        this._reason = reason;
        this._queue = [];
        this._remaining = 0;
        this._sendControl(message(Op.ABORT_REQ));
    }

    // One frame of the earbuds: the command (without the reply bit) and the payload
    handleFrame(command, payload) {
        if (this._finished)
            return;

        this._touch();
        switch (command) {
            case Gaia.CONNECT_REPLY:
                this._clearAck();
                if ((payload[0] ?? 0) !== 0)
                    return this._fail(`The earbuds refused the upgrade mode (status ${payload[0]})`);
                this._setState(State.SYNC);
                this._sendControl(message(Op.SYNC_REQ, this._fileId));
                break;
            case Gaia.CONTROL_REPLY:
                this._onControlReply(payload);
                break;
            case Gaia.NOTIFICATION:
                this._onMessage(payload);
                break;
            case Gaia.DISCONNECT_REPLY:
                break;
            default:
                break;
        }
    }

    // The link went away. After the transfer that is the restart the earbuds do themselves
    onLinkLost() {
        if (this._finished)
            return;

        if (this._state === State.REBOOT || this._state === State.TRANSFERRED) {
            this._clearAck();
            this._clearWatchdog();
            this._setState(State.REBOOT);
            return;
        }
        this._fail('The connection to the earbuds was lost');
    }

    // A transfer that gets no frame at all for a long time has stalled
    _touch() {
        if (this._watchdog)
            this._hooks.clearTimer(this._watchdog);
        this._watchdog = this._state === State.REBOOT ? null : this._hooks.setTimer(SILENCE_MS, () => {
            this._watchdog = null;
            this._fail('The earbuds stopped answering');
        });
    }

    _setState(state, info = {}) {
        this._state = state;
        this._hooks.onState(state, {percent: this._percent(), ...info});
    }

    _percent() {
        return Math.min(100, Math.floor(this._offset * 100 / Math.max(1, this._file.length)));
    }

    _sendPlain(command, payload) {
        this._hooks.send(buildFrame(command, payload));
    }

    // Control messages wait for the reply of the earbuds before the next one goes out
    _sendControl(content) {
        this._queue.push({content});
        this._pump();
    }

    _pump() {
        if (this._awaitingAck || this._finished)
            return;

        let item = this._queue.shift();
        if (!item && this._remaining > 0)
            item = {content: this._nextData()};
        if (!item)
            return;

        this._awaitingAck = true;
        this._hooks.send(buildFrame(Gaia.CONTROL, item.content));
        this._expectAck(Gaia.CONTROL_REPLY);
        this._lastWasData = item.content[0] === Op.DATA;
        this._lastWasLastData = this._lastWasData && this._offset >= this._file.length &&
            this._remaining === 0;
    }

    _nextData() {
        const size = Math.min(ChunkSize, this._remaining);
        const chunk = this._file.subarray(this._offset, this._offset + size);
        this._offset += size;
        this._remaining -= size;
        const last = this._offset >= this._file.length ? 1 : 0;
        return message(Op.DATA, [last, ...chunk]);
    }

    _expectAck(command) {
        this._clearAck();
        this._ackTimer = this._hooks.setTimer(ACK_TIMEOUT_MS, () => {
            this._ackTimer = null;
            this._fail(`No reply of the earbuds to ${command.toString(16)}`);
        });
    }

    _clearAck() {
        if (this._ackTimer)
            this._hooks.clearTimer(this._ackTimer);
        this._ackTimer = null;
    }

    _onControlReply(payload) {
        this._clearAck();
        this._awaitingAck = false;
        if ((payload[0] ?? 0) !== 0)
            return this._fail(`The earbuds refused a message (status ${payload[0]})`);

        if (this._lastWasData) {
            this._hooks.onState(this._state, {percent: this._percent()});
            if (this._lastWasLastData) {
                // The whole file is sent: ask whether the earbuds accepted it
                this._lastWasLastData = false;
                this._setState(State.VALIDATE);
                this._sendControl(message(Op.IS_VALIDATION_DONE_REQ));
                return;
            }
        }
        this._pump();
    }

    _onMessage(bytes) {
        if (bytes.length < 3)
            return;

        const opcode = bytes[0];
        const content = bytes.slice(3);
        this._hooks.log?.(`upgrade message ${opcode.toString(16)} ${content.length} bytes`);

        switch (opcode) {
            case Op.SYNC_CFM:
                this._onSync(content);
                break;
            case Op.START_CFM:
                this._onStart(content);
                break;
            case Op.DATA_BYTES_REQ:
                this._onDataRequest(content);
                break;
            case Op.IS_VALIDATION_DONE_CFM: {
                const wait = content.length >= 2 ? content[0] << 8 | content[1] : 0;
                this._hooks.setTimer(Math.max(wait, 50), () => {
                    if (!this._finished && !this._aborting)
                        this._sendControl(message(Op.IS_VALIDATION_DONE_REQ));
                });
                break;
            }
            case Op.TRANSFER_COMPLETE_IND:
                this._setState(State.TRANSFERRED);
                this._askSilentCommit();
                break;
            case Op.SILENT_COMMIT_CFM:
                this._silentCommit = content[0] === 1;
                this._confirmTransfer();
                break;
            case Op.COMMIT_REQ:
                this._setState(State.COMMIT);
                this._sendControl(message(Op.COMMIT_CFM, [0]));
                break;
            case Op.COMPLETE_IND:
                this._complete();
                break;
            case Op.ERROR_IND:
                this._onError(content);
                break;
            case Op.ABORT_CFM:
                this._fail(this._reason ?? 'aborted');
                break;
            case Op.EARBUDS_IN_CASE_REQ:
            case Op.EARBUDS_IN_CASE_CFM:
            default:
                break;
        }
    }

    _onSync(content) {
        if (content.length >= 6) {
            this._resume = content[0];
            this._protocol = content[5];
            if (this._protocol > SUPPORTED_PROTOCOL)
                return this._abortWith(`Unsupported protocol version ${this._protocol}`);
        } else {
            this._resume = ResumePoint.START;
        }
        this._sendControl(message(Op.START_REQ));
    }

    _onStart(content) {
        if (content.length < 3)
            return this._abortWith('Invalid start reply');

        const status = content[0];
        if (status === 9) {
            // The earbuds are not ready yet
            if (this._startAttempts++ < START_RETRIES) {
                this._startTimer = this._hooks.setTimer(START_RETRY_MS, () =>
                    this._sendControl(message(Op.START_REQ)));
                return;
            }
            return this._abortWith('The earbuds are not ready');
        }
        if (status !== 0)
            return this._abortWith(`The earbuds refused to start (status ${status})`);

        switch (this._resume) {
            case ResumePoint.COMMIT:
                this._setState(State.COMMIT);
                this._sendControl(message(Op.COMMIT_CFM, [0]));
                break;
            case ResumePoint.PRE_REBOOT:
                this._askSilentCommit();
                break;
            case ResumePoint.POST_REBOOT:
                this._setState(State.COMMIT);
                this._sendControl(message(Op.IN_PROGRESS_RES, [0]));
                break;
            case ResumePoint.PRE_VALIDATE:
                this._setState(State.VALIDATE);
                this._sendControl(message(Op.IS_VALIDATION_DONE_REQ));
                break;
            case ResumePoint.POST_COMMIT:
                break;
            default:
                // After the restart the earbuds have nothing left to commit: they applied the file
                // (or did not need it). The earbuds of this model were seen to do that when the file
                // equals the installed one
                if (this._resumeOnly)
                    return this._complete();
                this._setState(State.UPLOAD);
                this._sendControl(message(Op.START_DATA_REQ));
                break;
        }
    }

    _onDataRequest(content) {
        if (content.length !== 8)
            return this._abortWith('Invalid data request');

        const wanted = (content[0] << 24 | content[1] << 16 | content[2] << 8 | content[3]) >>> 0;
        const skip = (content[4] << 24 | content[5] << 16 | content[6] << 8 | content[7]) >>> 0;
        if (skip > 0 && this._offset + skip < this._file.length)
            this._offset += skip;

        const left = this._file.length - this._offset;
        this._remaining = wanted >= left ? left : wanted;
        this._setState(State.UPLOAD);
        this._pump();
    }

    _askSilentCommit() {
        if (this._protocol < 4)
            this._confirmTransfer();
        else
            this._sendControl(message(Op.SILENT_COMMIT_REQ));
    }

    // The app of the vendor answers with the interactive commit (0): the earbuds restart and ask
    // for the commit afterwards
    _confirmTransfer() {
        this._sendControl(message(Op.TRANSFER_COMPLETE_RES, [0]));
        this._setState(State.REBOOT);
    }

    _onError(content) {
        this._sendControl(message(Op.ERROR_RES, content));
        const code = content.length >= 2 ? content[0] << 8 | content[1] : 0;
        this._abortWith(`Error of the earbuds ${code.toString(16)}${
            ErrorTexts[code & 0xFF] ? ` (${ErrorTexts[code & 0xFF]})` : ''}`);
    }

    _abortWith(reason) {
        this._hooks.log?.(`abort: ${reason}`);
        this.abort(reason);
    }

    _complete() {
        this._finished = true;
        this._clearAck();
        this._clearWatchdog();
        this._hooks.send(buildFrame(Gaia.DISCONNECT, []));
        this._setState(State.DONE);
    }

    _fail(reason) {
        if (this._finished)
            return;

        this._finished = true;
        this._clearAck();
        this._clearWatchdog();
        // Leave the upgrade mode, so that the earbuds do not wait for a transfer
        this._hooks.send(buildFrame(Gaia.DISCONNECT, []));
        this._setState(State.FAILED, {error: reason});
    }

    _clearWatchdog() {
        if (this._watchdog)
            this._hooks.clearTimer(this._watchdog);
        this._watchdog = null;
    }
}
