'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {LogDir} from '../../appLibs/utils.js';

const MAX_LOG_BYTES = 1024 * 1024;

const LOG_INFO = true;
const LOG_BYTES = true;

let liveLogSink = null;

function getLogFiles() {
    if (!LogDir)
        throw new Error('LogDir not initialized (initContext not called yet)');

    GLib.mkdir_with_parents(LogDir, 0o755);

    const logPath = GLib.build_filenamev([LogDir, 'runtime.log']);
    const historyPath = GLib.build_filenamev([LogDir, 'runtime-old.log']);

    return {
        logFile: Gio.File.new_for_path(logPath),
        historyFile: Gio.File.new_for_path(historyPath),
    };
}

function enforceLogSizeLimit(logFile, historyFile) {
    try {
        const info = logFile.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
        if (info.get_size() >= MAX_LOG_BYTES) {
            if (historyFile.query_exists(null))
                historyFile.delete(null);

            logFile.move(historyFile, Gio.FileCopyFlags.OVERWRITE, null, null);
        }
    } catch {
        // Do nothing
    }
}

function WriteLogLine(prefix, msg) {
    const {logFile, historyFile} = getLogFiles();
    enforceLogSizeLimit(logFile, historyFile);
    const line = `[${new Date().toISOString()}] ${prefix}: ${msg}\n\n`;

    if (liveLogSink)
        liveLogSink(line);

    const stream = logFile.append_to(Gio.FileCreateFlags.NONE, null);
    const bytes = new GLib.Bytes(line);
    stream.write_bytes(bytes, null);
    stream.flush(null);
    stream.close(null);
}

export function createLogger(tag) {
    return {
        info: LOG_INFO
            ? (...args) => WriteLogLine('INF', `[${tag}] ${args.join(' ')}`)
            : () => {},
        error: (err, msg = '') => {
            const text = `${msg} ${err instanceof Error ? err.stack : String(err)}`.trim();
            WriteLogLine('ERR', `[${tag}] ${text}`);
        },
        bytes: LOG_BYTES
            ? (...args) => WriteLogLine('BYT', `[${tag}] ${args.join(' ')}`)
            : () => {},
    };
}

export function setLiveLogSink(callback) {
    liveLogSink = callback;
}
