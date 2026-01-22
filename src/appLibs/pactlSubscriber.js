'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {createLogger} from '../lib/devices/logger.js';


const _log = createLogger('PactlSubscriber');
const listeners = new Set();
let _pactlProc = null;
let _pactlStream = null;
let _cancelled = false;
let _cancellable = null;

function _startPactl() {
    if (_pactlProc)
        return;

    _cancelled = false;
    _cancellable = new Gio.Cancellable();

    _pactlProc = new Gio.Subprocess({
        argv: ['env', 'LANG=C', 'LC_ALL=C', 'pactl', 'subscribe'],
        flags: Gio.SubprocessFlags.STDOUT_PIPE,
    });

    _pactlProc.init(null);

    const stdout = _pactlProc.get_stdout_pipe();
    _pactlStream = new Gio.DataInputStream({base_stream: stdout});
    const decoder = new TextDecoder('utf-8', {fatal: false});

    const readLine = async () => {
        /* eslint-disable no-await-in-loop */
        while (!_cancelled && _pactlStream) {
            try {
                const [lineBytes, len] =
                    await _pactlStream.read_line_async(GLib.PRIORITY_LOW, _cancellable);

                if (!lineBytes || len <= 0)
                    continue;

                const line = decoder.decode(lineBytes);
                for (const cb of listeners)
                    cb(line);
            } catch (e) {
                _log.error(e);
            }
        }
        /* eslint-enable no-await-in-loop */
    };


    readLine();
}

export function addListener(cb) {
    listeners.add(cb);
    _startPactl();
}

export function removeListener(cb) {
    listeners.delete(cb);
    if (listeners.size === 0) {
        _cancelled = true;

        if (_pactlStream) {
            try {
                _cancellable.cancel();
                _pactlStream.close(null);
            } catch {}
            _pactlStream = null;
        }

        if (_pactlProc) {
            try {
                _pactlProc.force_exit();
            } catch {}
            _pactlProc = null;
        }
    }
}

