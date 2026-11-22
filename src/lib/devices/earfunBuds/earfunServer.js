'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

// Asks the server of the vendor whether a newer firmware exists for the earbuds. It only asks:
// a firmware is not downloaded or installed.
//
// The server wants every request signed with a key that the app of the vendor has. BudsLink does
// not ship that key. It reads it from a file of the user, one line:
//   ~/.config/io.github.maniacx.BudsLink/earfun-api-key

const Host = 'https://api.myearfun.com';
const KeyFile = 'earfun-api-key';
const DeviceId = 'budslink';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');

function readKey() {
    const path = GLib.build_filenamev([GLib.get_user_config_dir(), 'io.github.maniacx.BudsLink', KeyFile]);
    try {
        const [, bytes] = Gio.File.new_for_path(path).load_contents(null);
        return new TextDecoder().decode(bytes).trim();
    } catch {
        return null;
    }
}

function signature(key, timestamp) {
    const hex = GLib.compute_hmac_for_string(GLib.ChecksumType.SHA256, new TextEncoder().encode(key),
        `timestamp=${timestamp}&secret=${key}`, -1);
    const raw = Uint8Array.from(hex.match(/../g).map(h => parseInt(h, 16)));
    return GLib.base64_encode(raw);
}

// "TW700_20260805_v1.3.7" -> "1.3.7"
export function versionNumber(firmware) {
    return firmware.split('_')[2]?.replace('v', '') ?? '';
}

function compareVersions(a, b) {
    const [x, y] = [a, b].map(v => v.split('.').map(Number));
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const d = (x[i] ?? 0) - (y[i] ?? 0);
        if (d !== 0)
            return d;
    }
    return 0;
}

// A signed GET of the server. Returns the parsed answer, or null when the key is missing
// or the server did not answer
async function signedGet(path, query) {
    const key = readKey();
    if (!key)
        return null;

    const timestamp = `${Date.now()}`;
    const text = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const message = Soup.Message.new('GET', `${Host}${path}?${text}`);
    const headers = message.get_request_headers();
    headers.append('earfun-timestamp', timestamp);
    headers.append('earfun-token', encodeURIComponent(signature(key, timestamp)));
    headers.append('X-Requested-With', 'XMLHttpRequest');
    headers.append('User-Agent', 'Android');
    headers.append('Accept', 'application/json');

    const session = new Soup.Session({timeout: 30});
    const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
    if (message.get_status() !== Soup.Status.OK)
        return undefined;

    const answer = JSON.parse(new TextDecoder().decode(bytes.get_data()));
    return answer.code === 0 ? answer.data : undefined;
}

// The voice packs the server offers for the earbuds. The app of the vendor asks with an empty
// firmware version for this model, which gives the whole list.
// Returns {status: 'ok'|'nokey'|'error', packs: [{name, file, size, url, custom}]}
export async function fetchVoicePacks(hardwareModel = 'TW700') {
    try {
        const data = await signedGet('/m/api/ota-voice-guide',
            {hardware_model: hardwareModel, hardware_firmware_version: ''});
        if (data === null)
            return {status: 'nokey', packs: []};
        if (data === undefined)
            return {status: 'error', packs: []};

        const packs = [];
        for (const [kind, list] of [[false, data.upgrade ?? []], [true, data.custom ?? []]]) {
            for (const item of list) {
                if (item.valid && item.oss_url?.startsWith('https://oss.myearfun.com/'))
                    packs.push({
                        name: item.lang_name, file: item.firmware_name, size: item.firmware_size,
                        url: item.oss_url, custom: kind,
                    });
            }
        }
        return {status: 'ok', packs};
    } catch {
        return {status: 'error', packs: []};
    }
}

// Downloads a voice pack to the cache folder and returns its path, or null. The file must have
// the size the server named and the header of an upgrade file
export async function downloadVoicePack(pack) {
    try {
        const message = Soup.Message.new('GET', pack.url);
        const session = new Soup.Session({timeout: 60});
        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        const data = bytes.get_data();
        if (message.get_status() !== Soup.Status.OK || data.length !== pack.size ||
                new TextDecoder().decode(data.subarray(0, 8)) !== 'APPUHDR5')
            return null;

        const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'io.github.maniacx.BudsLink']);
        GLib.mkdir_with_parents(dir, 0o700);
        const path = GLib.build_filenamev([dir, `voice-${pack.file.replace(/[^A-Za-z0-9_-]/g, '_')}.bin`]);
        Gio.File.new_for_path(path).replace_contents(data, null, false,
            Gio.FileCreateFlags.NONE, null);
        return path;
    } catch {
        return null;
    }
}

// Returns {status: 'current'|'available'|'unavailable'|'nokey'|'error', version, notes, size}
export async function checkFirmware(firmware, hardwareModel = 'TW700') {
    const key = readKey();
    if (!key)
        return {status: 'nokey'};

    const version = versionNumber(firmware);
    if (!version)
        return {status: 'error'};

    const timestamp = `${Date.now()}`;
    const query = Object.entries({
        lang: 'en', deviceKeyid: DeviceId, firmware_version: version,
        hardware_model: hardwareModel, voice_lang: '', app_version: '1.0.0',
    }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const message = Soup.Message.new('GET', `${Host}/m/api/ota-firmware?${query}`);
    const headers = message.get_request_headers();
    headers.append('earfun-timestamp', timestamp);
    headers.append('earfun-token', encodeURIComponent(signature(key, timestamp)));
    headers.append('X-Requested-With', 'XMLHttpRequest');
    headers.append('User-Agent', 'Android');
    headers.append('Accept', 'application/json');

    try {
        const session = new Soup.Session({timeout: 20});
        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        if (message.get_status() !== Soup.Status.OK)
            return {status: 'error'};

        const answer = JSON.parse(new TextDecoder().decode(bytes.get_data()));
        if (answer.code !== 0)
            return {status: 'error'};

        // The server names its version like "700-V1.3.7" and also answers with the version the
        // earbuds have when it is the newest, so the numbers are compared
        const upgrade = answer.data?.upgrade;
        const offered = upgrade?.firmware_version?.match(/\d+(\.\d+)+/)?.[0];
        if (!offered || compareVersions(offered, version) <= 0)
            return {status: 'current', version};

        return {
            status: 'available',
            version: upgrade.firmware_version,
            notes: upgrade.describe ?? [],
            size: upgrade.firmware_size ?? 0,
        };
    } catch {
        return {status: 'error'};
    }
}
