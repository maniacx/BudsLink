'use strict';

import Liberty4NC from './deviceConfigs/Liberty-4-NC.js';

export const SoundcoreConfiguration = [
    Liberty4NC,
];

export const SoundcoreVendorUuidPrefix = '0cf12d31-fac3-4553-bd80-d6832e7b';

export function vendorUuidForModel(modelCode) {
    return `${SoundcoreVendorUuidPrefix}${modelCode.toLowerCase()}`;
}

export const DIRECTION_HOST_TO_DEVICE = [0x08, 0xEE, 0x00, 0x00, 0x00];
export const DIRECTION_DEVICE_TO_HOST = [0x09, 0xFF, 0x00, 0x00, 0x01];
export const HEADER_LEN = 9;

export const Cmd = {
    GET_STATE: [0x01, 0x01],
    SET_SOUND_MODES: [0x06, 0x81],
    GET_LDAC: [0x01, 0x7F],
    SET_LDAC: [0x01, 0xFF],
    SET_AUTO_POWER_OFF: [0x01, 0x86],
    SET_LIMIT_HIGH_VOLUME: [0x20, 0x82],
    SET_VOLUME_REFRESH_RATE: [0x20, 0x81],
    SET_BUTTON_ACTION: [0x04, 0x81],
    SET_AMBIENT_CYCLE: [0x06, 0x82],
    SET_EQUALIZER: [0x03, 0x87],
};

export const CmdDual = {
    SET_ENABLED: [0x0B, 0x84],
    GET_DEVICES: [0x0B, 0x01],
    DISCONNECT: [0x0B, 0x81],
    CONNECT: [0x0B, 0x82],
    FORGET: [0x0B, 0x83],
};

export const Rsp = {
    DUAL_DEVICES: 0x0B01,
    LDAC: 0x017F,
    STATE: 0x0101,
    SOUND_MODES_CHANGED: 0x0601,
};

export const AmbientMode = {
    NOISE_CANCELING: 0,
    TRANSPARENCY: 1,
    NORMAL: 2,
};

export const NcMode = {
    MANUAL: 0,
    ADAPTIVE: 1,
    TRANSPORTATION: 2,
};

export const TransparencyMode = {
    FULLY: 0,
    VOCAL: 1,
};

export const TransportMode = {
    PLANE: 0,
    TRAIN: 1,
    BUS: 2,
    CAR: 3,
};

export function checksum(bytes) {
    return bytes.reduce((sum, b) => sum + b, 0) & 0xFF;
}

export function buildPacket(command, body = []) {
    const packet = [
        ...DIRECTION_HOST_TO_DEVICE,
        ...command,
        (HEADER_LEN + body.length + 1) & 0xFF, (HEADER_LEN + body.length + 1) >> 8,
        ...body,
    ];
    packet.push(checksum(packet));
    return packet;
}

/** Decodes the 7 byte SoundModes field of a state update body. */
export function decodeSoundModes(bytes) {
    return {
        ambient: bytes[0],
        manualNcLevel: bytes[1] >> 4,
        adaptiveNcLevel: bytes[1] & 0x0F,
        transparencyMode: bytes[2],
        ncMode: bytes[3],
        windNoise: bytes[4] === 1,
        environmentDetection: bytes[5] === 1,
        transportMode: bytes[6],
    };
}

export function encodeSoundModes(modes) {
    const bytes = [
        modes.ambient,
        modes.manualNcLevel << 4 | modes.adaptiveNcLevel,
        modes.transparencyMode,
        modes.ncMode,
        modes.windNoise ? 1 : 0,
    ];

    bytes.push(modes.environmentDetection ? 1 : 0, modes.transportMode);
    return bytes;
}

/**
 * Parses one dual connection device list packet body.
 * Layout: total packets, packet index (from 1), then per device:
 * length (includes itself), connected flag, 6 byte address, name padded with 0.
 */
export function decodeDualDevices(body) {
    const devices = [];
    let pos = 2;
    while (pos < body.length) {
        const length = body[pos];
        if (length < 8 || pos + length > body.length)
            break;

        const mac = body.slice(pos + 2, pos + 8)
            .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
        const nameBytes = body.slice(pos + 8, pos + length);
        const end = nameBytes.indexOf(0);
        const name = new TextDecoder().decode(
            Uint8Array.from(end === -1 ? nameBytes : nameBytes.slice(0, end)));
        devices.push({id: mac, name, connected: body[pos + 1] === 1});
        pos += length;
    }
    return {total: body[0], index: body[1], devices};
}

export function macToBytes(mac) {
    return mac.replace(/:/g, '').match(/.{2}/g).map(h => parseInt(h, 16));
}

// Button ids used in the set commands, by press kind
export const ButtonId = {
    single: 2,
    double: 0,
    triple: 5,
    long: 1,
};

export const ButtonSide = {
    left: 0,
    right: 1,
};

// Action ids; 0xF in the action byte disables the button ('none')
export const TouchActionId = {
    'volume-up': 0,
    'volume-down': 1,
    'previous': 2,
    'next': 3,
    'ambient': 4,
    'voice-assistant': 5,
    'play-pause': 6,
};

export const TouchActionCustom = 'custom';
export const ActionDisabled = 0x0F;

export const AmbientCycleBit = {
    'cycle-nc': 1 << 0,
    'cycle-transparency': 1 << 1,
    'cycle-normal': 1 << 2,
};

export function touchActionFromId(id) {
    return Object.entries(TouchActionId).find(([, v]) => v === id)?.[0] ?? TouchActionCustom;
}

export const EqPreset = {
    DEFAULT: 0x0000,
    CUSTOM: 0xFEFE,
};

export const HearIdType = {
    INITIAL: 0,
    CUSTOM: 1,
    GENRE: 2,
};

export const HearIdTypeKey = {
    [HearIdType.INITIAL]: 'initial',
    [HearIdType.CUSTOM]: 'custom',
    [HearIdType.GENRE]: 'genre',
};

// Presets of the earbuds, the same list is used for Default and the HearID favourite genre.
// Bands are in tenths of dB; the two bands past the eighth are always 0 and -120.
export const EqPresets = [
    {id: 0, key: 'SoundcoreSignature', bands: [0, 0, 0, 0, 0, 0, 0, 0]},
    {id: 1, key: 'Acoustic', bands: [40, 10, 20, 20, 40, 40, 40, 20]},
    {id: 2, key: 'BassBooster', bands: [40, 30, 10, 0, 0, 0, 0, 0]},
    {id: 3, key: 'BassReducer', bands: [-40, -30, -10, 0, 0, 0, 0, 0]},
    {id: 4, key: 'Classical', bands: [30, 30, -20, -20, 0, 20, 30, 40]},
    {id: 5, key: 'Podcast', bands: [-30, 20, 40, 40, 30, 20, 0, -20]},
    {id: 6, key: 'Dance', bands: [20, -30, -10, 10, 20, 20, 10, -30]},
    {id: 7, key: 'Deep', bands: [20, 10, 30, 30, 20, -20, -40, -50]},
    {id: 8, key: 'Electronic', bands: [30, 20, -20, 20, 10, 20, 30, 30]},
    {id: 9, key: 'Flat', bands: [-20, -20, -10, 0, 0, 0, -20, -20]},
    {id: 10, key: 'HipHop', bands: [20, 30, -10, -10, 20, -10, 20, 30]},
    {id: 11, key: 'Jazz', bands: [20, 20, -20, -20, 0, 20, 30, 40]},
    {id: 12, key: 'Latin', bands: [0, 0, -20, -20, -20, 0, 30, 50]},
    {id: 13, key: 'Lounge', bands: [-10, 20, 40, 30, 0, -20, 20, 10]},
    {id: 14, key: 'Piano', bands: [0, 30, 30, 20, 40, 50, 30, 40]},
    {id: 15, key: 'Pop', bands: [-10, 10, 30, 30, 10, -10, -20, -30]},
    {id: 16, key: 'RnB', bands: [60, 20, -20, -20, 20, 30, 30, 40]},
    {id: 17, key: 'Rock', bands: [30, 20, -10, -10, 10, 30, 40, 50]},
    {id: 18, key: 'SmallSpeakers', bands: [40, 30, 10, 0, -20, -30, -40, -40]},
    {id: 19, key: 'SpokenWord', bands: [-30, -20, 10, 20, 20, 10, 0, -30]},
    {id: 20, key: 'TrebleBooster', bands: [-20, -20, -20, -10, 10, 20, 20, 40]},
    {id: 21, key: 'TrebleReducer', bands: [0, 0, 0, -20, -30, -40, -40, -60]},
];


const EQ_BANDS = 10;
const EQ_MIN = -120;
const EQ_MAX = 134;
const EQ_ABSENT = 0xFF;
const EQ_UNUSED_BANDS = [0, 0, 0, 0, 0, 0, 0, 0, 0, -120];

/**
 * Layout of the equalizer block of the state packet (relative to the model's offset):
 * preset id (2, LE), 2 channels of 10 band bytes, 1 unknown, hear id enabled (1),
 * hear id curve (2 channels), time (4), hear id type (1), custom hear id curve (2 channels),
 * music genre (1), 1 unknown.
 * Bands are stored as byte = tenths of dB + 120. 0xFF in the first band means no channel.
 */
export const EQ_BLOCK_LENGTH = 71;

export function decodeEqualizer(block) {
    const channel = start => {
        const bytes = block.slice(start, start + EQ_BANDS);
        return bytes[0] === EQ_ABSENT ? null : bytes;
    };
    return {
        presetId: block[0] | block[1] << 8,
        eq: [channel(2), channel(12)],
        unknown1: block[22],
        hearEnabled: block[23] === 1,
        hearCurve: [channel(24), channel(34)],
        time: block.slice(44, 48),
        hearType: block[48],
        customCurve: [channel(49), channel(59)],
        music: block[69],
    };
}

/** Everything the settings need to know about the equalizer state of the earbuds */
export function equalizerInfo(eq, bandCount) {
    const tenthsToDb = channel => channel?.slice(0, bandCount).map(b => (b + EQ_MIN) / 10) ?? null;
    return {
        mode: equalizerMode(eq),
        presetId: eq.presetId === EqPreset.CUSTOM ? null : eq.presetId,
        customBands: eq.presetId === EqPreset.CUSTOM ?
            tenthsToDb(eq.eq.find(c => c !== null)) : null,
        hearType: HearIdTypeKey[eq.hearType] ?? 'initial',
        genre: eq.music,
        hearCustomBands: tenthsToDb(eq.customCurve.find(c => c !== null)),
    };
}

export function equalizerMode(eq) {
    if (eq.hearEnabled)
        return 'hearid';

    return eq.presetId === EqPreset.CUSTOM ? 'custom' : 'default';
}

/** The 8 editable bands in dB of the custom equalizer, or null if no channel is present */
export function customBandsFromEqualizer(eq, bandCount) {
    const channel = eq.eq.find(c => c !== null);
    if (!channel)
        return null;

    return channel.slice(0, bandCount).map(b => (b + EQ_MIN) / 10);
}

function bandsToBytes(tenthsDb) {
    return tenthsDb.map(v => Math.min(Math.max(v, EQ_MIN), EQ_MAX) - EQ_MIN);
}

function roundHalfAwayFromZero(x) {
    return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
}

const DRC_SMALL = 0.85;
const DRC_LARGE = 0.95;
const DRC_COEFFICIENTS = [
    [1.26, -0.71 * DRC_SMALL, 0.177, -0.0494, 0.0345, -0.0197, 0.0075, -0.00217],
    [-0.71 * DRC_SMALL, 1.73 * DRC_LARGE, 0.0, 0.204, -0.068, 0.045, -0.0235, 0.0075],
    [0.177, -0.81 * DRC_SMALL, 1.73 * DRC_LARGE, -0.81 * DRC_SMALL, 0.208, -0.07, 0.045,
        -0.0197],
    [-0.0494, 0.204, 0.0, 1.73 * DRC_LARGE, -0.82 * DRC_SMALL, 0.208, -0.068, 0.0345],
    [0.0345, -0.068, 0.208, -0.82 * DRC_SMALL, 1.73 * DRC_LARGE, 0.0, 0.204, -0.0494],
    [-0.0197, 0.045, -0.07, 0.208, -0.81 * DRC_SMALL, 1.73 * DRC_LARGE, -0.81 * DRC_SMALL,
        0.177],
    [0.0075, -0.0235, 0.045, -0.068, 0.204, 0.0, 1.83 * DRC_LARGE, -0.71 * DRC_SMALL],
    [-0.00217, 0.0075, -0.0197, 0.0345, -0.0494, 0.177, -0.71 * DRC_SMALL, 1.5],
];

/**
 * Dynamic range compression the earbuds expect for the effective curve.
 * Ported from OpenSCQ30 (Kyle Scheuing), verified against its known good packet.
 */
function applyDrc(tenthsDb) {
    const adj = tenthsDb.map(v => v / 10);
    const lows = adj[2] * 0.81 * DRC_SMALL;
    const highs = adj[5] * 0.81 * DRC_SMALL;
    const out = DRC_COEFFICIENTS.map((coefficients, band) => {
        let acc = 0.0;
        for (let i = 0; i < 8; i++) {
            if ((band === 1 || band === 3) && i === 2)
                acc -= lows;
            else if ((band === 4 || band === 6) && i === 5)
                acc -= highs;
            else
                acc += adj[i] * coefficients[i];
        }
        return roundHalfAwayFromZero(acc / 10 * 10);
    });
    return [...out, ...EQ_UNUSED_BANDS.slice(8)];
}

function channelToTenths(bytes) {
    return bytes.map(b => b + EQ_MIN);
}

/** Body of the set equalizer command for the given (modified) decoded equalizer state */
export function encodeEqualizer(eq) {
    const channelBytes = channel => channel ?? new Array(EQ_BANDS).fill(EQ_ABSENT);

    let active = eq.eq;
    if (eq.hearEnabled)
        active = eq.hearType === HearIdType.CUSTOM ? eq.customCurve : eq.hearCurve;

    // The earbuds report a single equalizer channel when it is not a HearID curve. Both buds
    // play the effective curve, an absent channel there would be played as maximum gain
    const shared = active.find(channel => channel);
    active = active.map(channel => channel ?? shared ?? null);

    const body = [
        eq.presetId & 0xFF, eq.presetId >> 8,
        eq.music, 0,
        ...eq.eq.flatMap(channelBytes),
        0, eq.unknown1, eq.hearEnabled ? 1 : 0,
        ...eq.hearCurve.flatMap(channelBytes),
        ...eq.time, eq.hearType,
        ...eq.customCurve.flatMap(channelBytes),
        ...active.flatMap(channel => {
            if (!channel)
                return [...new Array(EQ_BANDS - 1).fill(EQ_ABSENT), 0];

            const bytes = bandsToBytes(applyDrc(channelToTenths(channel)));
            bytes[EQ_BANDS - 1] = 0;
            return bytes;
        }),
        0,
    ];
    return body;
}

/**
 * New decoded equalizer state for the requested settings:
 * {mode, presetId, customBands (dB), hearType ('initial', 'custom', 'genre'), genre,
 * hearCustomBands (dB)}
 */
export function equalizerForMode(eq, settings) {
    const next = {...eq};
    const toBytes = tenths => bandsToBytes(tenths);

    // Replaces the editable bands of a channel; the two bands past them stay as the earbuds
    // reported them
    const withBands = (channel, tenths) => channel && [...toBytes(tenths), ...channel.slice(tenths.length)];

    if (settings.hearCustomBands) {
        const tenths = settings.hearCustomBands.map(v => Math.round(v * 10));
        next.customCurve = eq.customCurve.map(channel => withBands(channel, tenths));
    }

    if (settings.mode === 'hearid') {
        next.hearEnabled = true;
        next.hearType = Number(Object.entries(HearIdTypeKey)
            .find(([, key]) => key === settings.hearType)?.[0] ?? HearIdType.INITIAL);
        if (next.hearType === HearIdType.GENRE)
            next.music = settings.genre;
    } else if (settings.mode === 'default') {
        const preset = EqPresets.find(p => p.id === settings.presetId) ?? EqPresets[0];
        next.hearEnabled = false;
        next.presetId = preset.id;
        next.eq = eq.eq.map(channel => withBands(channel, preset.bands));
    } else if (settings.mode === 'custom') {
        next.hearEnabled = false;
        next.presetId = EqPreset.CUSTOM;
        const tenths = settings.customBands.map(v => Math.round(v * 10));
        next.eq = eq.eq.map(channel => withBands(channel, tenths));
    }
    return next;
}
