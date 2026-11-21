'use strict';

/**
Protocol notes (EarFun Air Pro 4+, firmware V1.3.7)

GAIA frames over the classic Serial Port (RFCOMM) channel:
    FF | 04 | 00 | LEN | VENDOR(2) | COMMAND(2) | PAYLOAD[LEN]
No checksum. Vendor 000A for every command, 001D for the equalizer only. A reply carries the
command id with bit 0x8000 set and starts its payload with a status byte (00), followed by the
value. The earbuds also push the state commands (id without the 0x8000 bit) on their own when a
setting changes on the earbuds or from another device.

Values and meanings were verified against a Bluetooth HCI snoop log of the vendor app on the
Air Pro 4+. Command names follow the open-source Gadgetbridge EarFun support, which documents
the same family of earbuds for the Air Pro 4.
**/

export const DeviceTypeEarfunBuds = 'earfunBuds';

export const EarfunVendorUuid = '0000eb04-d102-11e1-9b23-00025b00a5a5';

export const EarfunModels = [
    {
        name: 'EarFun Air Pro 4+',
        pattern: /^EarFun Air Pro 4/i,
        budsIcon: 'earbuds-stem',
        case: 'case-square',
    },
];

export const Frame = {
    SOP: 0xFF,
    VERSION: 0x04,
    FLAGS: 0x00,
    HEADER_LEN: 8,
    VENDOR: 0x000A,
    VENDOR_EQ: 0x001D,
    ACK_MASK: 0x8000,
};

// Requests. The reply (and a later notification) uses the same id.
export const Cmd = {
    FIRMWARE: 0x0309,
    SERIAL_NUMBER: 0x0359,
    BATTERY_LEFT: 0x0306,
    BATTERY_RIGHT: 0x0307,
    BATTERY_CASE: 0x0317,
    TOUCH_ACTION: 0x030B,
    GAME_MODE: 0x0313,
    AMBIENT: 0x0315,
    MULTIPOINT: 0x0326,
    CONNECTED_DEVICES: 0x032C,
    CODEC: 0x032F,
    MIC: 0x0331,
    TOUCH_MODE: 0x0335,
    VOICE_PROMPT: 0x0339,
    FIND_DEVICE: 0x0333,
    ANC: 0x033B,
    TRANSPARENCY: 0x033D,
    IN_EAR: 0x034A,
    ADVANCED_AUDIO: 0x034C,
    VOICE_PROTECT: 0x0354,
    BALANCE: 0x0356,
};

// Commands that change a setting
export const SetCmd = {
    TOUCH_ACTION: 0x030A,
    GAME_MODE: 0x0312,
    DEVICE_NAME: 0x0316,
    AMBIENT: 0x0314,
    MULTIPOINT: 0x0327,
    CONNECT_DEVICE: 0x0329,
    DISCONNECT_DEVICE: 0x032A,
    PAIRING: 0x032B,
    CODEC: 0x032E,
    MIC: 0x0330,
    FIND_DEVICE: 0x0332,
    TOUCH_MODE: 0x0334,
    VOICE_PROMPT: 0x0338,
    ANC: 0x033A,
    TRANSPARENCY: 0x033C,
    IN_EAR: 0x0349,
    ADVANCED_AUDIO: 0x034B,
    VOICE_PROTECT: 0x0353,
    BALANCE: 0x0355,
    PLAYBACK_DEVICE: 0x0357,
    REBOOT: 0x0308,
    EQ_BAND: 0x0E01,
};

// What a tap and a long press on a device name do in the list of devices
export const PlaybackDevice = {
    SWITCH: 1,
    FIX: 2,
};

// Requests sent after the connection, in this order
export const InitialRequests = [
    Cmd.FIRMWARE, Cmd.BATTERY_LEFT, Cmd.BATTERY_RIGHT, Cmd.BATTERY_CASE, Cmd.AMBIENT,
    Cmd.ANC, Cmd.TRANSPARENCY, Cmd.GAME_MODE, Cmd.IN_EAR, Cmd.TOUCH_MODE, Cmd.TOUCH_ACTION,
    Cmd.MULTIPOINT, Cmd.CONNECTED_DEVICES, Cmd.CODEC, Cmd.MIC, Cmd.VOICE_PROMPT, Cmd.VOICE_PROTECT, Cmd.BALANCE,
    Cmd.FIND_DEVICE, Cmd.ADVANCED_AUDIO, Cmd.SERIAL_NUMBER,
];

// The list of devices that are connected to the earbuds (multipoint): per device the index, the
// name (21 bytes, filled up with zeros), 3 bytes that identify the device and a state (1 = active)
const DEVICE_ENTRY_LEN = 26;

export function parseDeviceList(bytes) {
    const devices = [];
    for (let i = 0; i + DEVICE_ENTRY_LEN <= bytes.length; i += DEVICE_ENTRY_LEN) {
        const entry = bytes.slice(i, i + DEVICE_ENTRY_LEN);
        const nameBytes = entry.slice(1, 22);
        const end = nameBytes.indexOf(0);
        const name = end === -1 ? nameBytes : nameBytes.slice(0, end);
        devices.push({
            index: entry[0],
            name: new TextDecoder().decode(Uint8Array.from(name)),
            id: Array.from(entry.slice(22, 25)).map(b => b.toString(16).padStart(2, '0')).join(''),
            active: entry[25] === 1,
        });
    }
    return devices;
}

export const AmbientMode = {
    OFF: 0,
    ANC: 1,
    TRANSPARENCY: 2,
};

// Noise cancellation sub modes. The manual levels use four of the remaining values.
export const AncMode = {
    EAR_ADAPTIVE: 0,
    WIND: 1,
    ENV_ADAPTIVE: 4,
};

// Manual noise cancellation level 1 (weakest) .. 4 (strongest), as sent in the ANC command
export const ManualAncValues = [6, 5, 3, 2];

export const TransparencyMode = {
    STANDARD: 0,
    NATURAL: 1,
};

export const Codec = {
    STABLE: 0x00,
    APTX: 0x01,
    APTX_ADAPTIVE: 0x03,
    APTX_LOSSLESS: 0x13,
    LDAC: 0x08,
};

// Connection mode of the earbuds. LE Audio also turns on Auracast and may take features such
// as game mode and the aptX / LDAC codecs away
export const AdvancedAudio = {
    FAST_PAIR: 0,
    LE_AUDIO: 1,
};

// Find my earbuds: a loud tone, as a mask of the earbuds that play it
export const FindDevice = {
    OFF: 0,
    LEFT: 1,
    RIGHT: 2,
    BOTH: 3,
};

export const DeviceNameMaxBytes = 25;

export const MicMode = {
    AUTO: 0,
    LEFT: 1,
    RIGHT: 2,
};

// Touch mode: which earbuds react to touch
export const TouchMode = {
    BOTH: 0,
    NONE: 1,
    RIGHT_ONLY: 2,
    LEFT_ONLY: 3,
};

// In-ear detection is a mask of "disable" flags, except for the sensitivity bit
export const InEarMask = {
    DISABLE_AUTO_PLAY: 0x01,
    DISABLE_AUTO_ANSWER: 0x02,
    DISABLE_ALL: 0x0F,
    HIGH_SENSITIVITY: 0x80,
};

// Gesture kinds
export const GestureType = {
    single: 0x01,
    double: 0x02,
    triple: 0x03,
    long: 0x11,
    callTriple: 0x06,
    callLong: 0x13,
};

export const GestureActions = {
    NONE: 0x10,
    PLAY_PAUSE: 0x01,
    VOLUME_UP: 0x02,
    VOLUME_DOWN: 0x03,
    PREVIOUS: 0x04,
    NEXT: 0x05,
    VOICE_ASSISTANT: 0x06,
    GAME_MODE: 0x07,
    NOISE_CONTROL: 0x08,
    REDIAL: 0x0D,
};

// Actions of the two call gestures (triple tap, press and hold). Each gesture offers only some of
// them: ANSWER_SWAP belongs to the triple tap, ANSWER_HANGUP and REJECT to press and hold.
// NOISE_CONTROL cycles through all three noise modes. The app can also pick only some of the
// modes, which gives other codes (0x0A = noise cancellation and transparency, measured)
export const CallActions = {
    ANSWER_HANGUP: 0x01,
    REJECT: 0x04,
    MUTE: 0x05,
    ANSWER_SWAP: 0x06,
    NOISE_CONTROL: 0x07,
    NONE: 0x10,
};

// Reply to the touch action request: (type, action) pairs for left and right, in this order
export const TouchActionLayout = [
    [GestureType.single, 'single'],
    [GestureType.double, 'double'],
    [GestureType.triple, 'triple'],
    [GestureType.long, 'long'],
];

// Voice protect: the volume limit is sent as a step, 0 = no limit. Step n limits to
// 100 - 10 * n percent
export const VolumeLimitSteps = [0, 1, 2, 3, 4, 5];

export const BalanceCenter = 50;

// Equalizer: ten bands. The frequency is sent as three times the centre frequency
// (rounded: 31.25 Hz is sent as 94)
export const EqFrequencies = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EqWireFrequencies = [94, 189, 375, 750, 1500, 3000, 6000, 12000, 24000, 48000];
export const EqGainUnit = 60;
export const EqQ = 0x0B33;
export const EqRange = 6;

export const EqPresets = [
    ['standard', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ['rock', [2, 2.5, 1, 0, 0, 0.5, 1, 1.5, 1.5, 1]],
    ['pop', [1.5, 2, 0, 0, 0, 0, 1, 1.5, 1.5, 1.5]],
    ['country', [0, 0.5, 0, 0, 0.5, 0, 0, 1, 0.5, 1]],
    ['rnb', [1, 1.5, 0.5, 0, 0, 0, 0.5, 1, 0, 0.5]],
    ['classical', [-1.5, -1, -0.5, 0.5, 0.5, 0, 0.5, 0.5, 1, 1.5]],
    ['jazz', [0, 0, 0, 0.5, 0.5, 0, 0.5, 1, 0.5, 1]],
    ['electronic', [0.5, 1, 0, 0, 1, 0, 1, 2, 3, 2]],
    ['dance', [0, 2, 0, 0, 1, 0, 1, 2, 0.5, 0]],
    ['hiphop', [1, 2, 0, 0, 1.5, 1, 0.5, 3.5, 0, 0]],
    ['metal', [0, 1, 0, 1, 1.5, 0, 1, 2, 3, 3.5]],
    ['blues', [0, 0, 0, 0.5, 1, 0, 0.5, 1.5, 0.5, 1]],
    ['soul', [1.5, 1.5, 0.5, 0, 0, 0, 0.5, 1, 1, 1]],
    ['hits', [1, 2, 0.5, -0.5, 0, 1.5, 0.5, 1.5, 0, 0]],
    ['latin', [1.5, 1.5, 0, 0, 0, 1.5, 0, 1, 0, 1]],
    ['natural', [-2.5, -2, -1, 0, -0.5, -0.5, 0, -0.5, 0, 0]],
    ['voice-boost', [0, 0, 0, 0.5, 2, 2.5, 2, 1, 0, 0]],
    ['voice-reduce', [0, 0, 0, -0.5, -2, -2.5, -2, -1, 0, 0]],
    ['bass-boost-1', [1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0]],
    ['bass-boost-2', [1.5, 3, 0, 0, 0, 0, 0, 0, 0, 0]],
    ['bass-boost-3', [2, 5, 0, 0, 0, 0, 0, 0, 0, 0]],
    ['bass-cut-1', [-2, -1.5, -1, 0, 0, 0, 0, 0, 0, 0]],
    ['bass-cut-2', [-4, -3, -1.5, 0, 0, 0, 0, 0, 0, 0]],
    ['bass-cut-3', [-6, -6, -3, 0, 0, 0, 0, 0, 0, 0]],
    ['treble-boost-1', [0, 0, 0, 0, 0, 0, 0, 1, 1.5, 1.5]],
    ['treble-boost-2', [0, 0, 0, 0, 0, 0, 0, 1.5, 3, 3]],
    ['treble-boost-3', [0, 0, 0, 0, 0, 0, 0, 3, 6, 6]],
    ['treble-cut-1', [0, 0, 0, 0, 0, 0, 0, -1, -1.5, -1.5]],
    ['treble-cut-2', [0, 0, 0, 0, 0, 0, 0, -1.5, -3, -3]],
    ['treble-cut-3', [0, 0, 0, 0, 0, 0, 0, -3, -6, -6]],
    ['original', [0, 0, 0, 0, 0, 0, 0.5, 1, 0.5, 0]],
];

export function buildPacket(command, payload = [], vendor = Frame.VENDOR) {
    return [
        Frame.SOP, Frame.VERSION, Frame.FLAGS, payload.length & 0xFF,
        vendor >> 8 & 0xFF, vendor & 0xFF,
        command >> 8 & 0xFF, command & 0xFF,
        ...payload,
    ];
}

// One equalizer band frame; gain in dB
export function buildEqBandPacket(band, gainDb) {
    const freq = EqWireFrequencies[band];
    const gain = Math.round(gainDb * EqGainUnit) & 0xFFFF;
    return buildPacket(SetCmd.EQ_BAND, [
        0xA1 + band, 0xFE, 0x98,
        freq >> 8 & 0xFF, freq & 0xFF,
        gain >> 8 & 0xFF, gain & 0xFF,
        EqQ >> 8 & 0xFF, EqQ & 0xFF,
        0x0D,
    ], Frame.VENDOR_EQ);
}

export function ancValueToSettings(value) {
    if (value === AncMode.EAR_ADAPTIVE)
        return {type: 'ear'};
    if (value === AncMode.ENV_ADAPTIVE)
        return {type: 'env'};
    if (value === AncMode.WIND)
        return {type: 'wind'};

    const index = ManualAncValues.indexOf(value);
    return index === -1 ? null : {type: 'manual', level: index + 1};
}

export function ancSettingsToValue(type, level) {
    switch (type) {
        case 'ear':
            return AncMode.EAR_ADAPTIVE;
        case 'env':
            return AncMode.ENV_ADAPTIVE;
        case 'wind':
            return AncMode.WIND;
        default:
            return ManualAncValues[Math.min(Math.max(level, 1), ManualAncValues.length) - 1];
    }
}

// Percentage limit shown in the UI for a voice protect step
export function volumeLimitPercent(step) {
    return step === 0 ? 100 : 100 - step * 10;
}
