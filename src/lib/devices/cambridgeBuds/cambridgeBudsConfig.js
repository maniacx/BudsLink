'use strict';

import MelomaniaA100 from './deviceConfigs/MelomaniaA100.js';

export const CambridgeBudsModelList = [
    MelomaniaA100,
];

export const GAIA_SOF = 0xFF;
export const GAIA_VERSION_LEGACY = 0x01;
export const GAIA_VERSION_V3 = 0x03;
export const GAIA_VERSION_V4 = 0x04;
export const GAIA_FLAG_CHECKSUM = 0x01;
export const GAIA_FLAG_LENGTH_16 = 0x02;
export const GAIA_HEADER_LEN = 8;

export const Vendor = {
    CSR: 0x000A,
    QUALCOMM: 0x001D,
    CAMBRIDGE: 0x0B9E,
};

export const QcCmd = {
    SET_TRANSPORT_INFO: 0x000D,
    REGISTER_NOTIFICATION: 0x0007,
    GET_APP_VERSION: 0x0005,
    GET_BATTERY_LEVELS: 0x1A01,
    GET_SELECTED_EQ_PRESET: 0x0A02,
    SET_SELECTED_EQ_PRESET: 0x0A03,
    GET_USER_EQ_BANDS: 0x0A05,
    SET_USER_EQ_BANDS: 0x0A06,
    GET_GESTURE_CONFIG: 0x1604,
    SET_GESTURE_CONFIG: 0x1605,
};

export const QcRsp = {
    GET_APP_VERSION: 0x0105,
    GET_BATTERY_LEVELS: 0x1B01,
    GET_SELECTED_EQ_PRESET: 0x0B02,
    GET_USER_EQ_BANDS: 0x0B05,
    GET_GESTURE_CONFIG: 0x1704,
};

export const QcNtf = {
    USER_EQ_BANDS_CHANGED: 0x0A82,
    GESTURE_CHANGED: 0x1680,
};

export const QcNotificationFeatures = [0x00, 0x0D, 0x0C, 0x0B, 0x05, 0x08, 0x01, 0x06, 0x07];

export const QcBatteryId = {
    SINGLE: 0x00,
    LEFT: 0x01,
    RIGHT: 0x02,
    CASE: 0x03,
};

export const QcUserEqPreset = 0x3F;
export const QcEqBandCount = 7;

export const CaCmd = {
    SET_VOICE_PROMPT: 0x0007,
    GET_VOICE_PROMPT: 0x0006,
    SET_AUTO_POWER_OFF: 0x0008,
    GET_AUTO_POWER_OFF: 0x0009,
    GET_NOISE_CONTROL: 0x000D,
    SET_NOISE_CONTROL: 0x000E,
    SET_DYNAMIC_EQ: 0x0014,
    GET_DYNAMIC_EQ: 0x0015,

    SET_GAMING_MODE: 0x0200,
    GET_GAMING_MODE: 0x0201,
    SET_WEAR_DETECTION: 0x0206,
    GET_WEAR_DETECTION: 0x0207,
    SET_MONO: 0x0208,
    GET_MONO: 0x0209,
    SET_SLEEP: 0x020A,
    GET_SLEEP: 0x020B,

    SET_CODECS: 0x0400,
    GET_CODECS: 0x0401,
};

export const CaRsp = {
    STATUS: 0x0103,
    VOICE_PROMPT: [0x0106, 0x0107],
    AUTO_POWER_OFF: [0x0108, 0x0109],
    NOISE_CONTROL: [0x010D, 0x010E],
    DYNAMIC_EQ: [0x0114, 0x0115],

    GAMING_MODE: [0x0300, 0x0301],
    WEAR_DETECTION: [0x0306, 0x0307],
    MONO: [0x0308, 0x0309],
    SLEEP: [0x030A, 0x030B],

    CODECS: 0x0501,
};

export const NoiseControl = {
    OFF: 0x00,
    ANC: 0x01,
    TRANSPARENCY: 0x02,
};

export const LdacCodecId = 0x09;
export const CodecListLdacOn = [0x00, 0x01, 0x02, 0x03, 0x04, 0x09];
export const CodecListLdacOff = [0x00, 0x01];

export const VoicePrompt = {
    OFF: 0xFF,
    TONES: 0x00,
    ENGLISH: 0x01,
    GERMAN: 0x02,
    SPANISH: 0x03,
    ITALIAN: 0x04,
    KOREAN: 0x06,
    CANTONESE: 0x07,
    MANDARIN: 0x08,
    FRENCH: 0x09,
    SOUTHWARK: 0x0A,
};

export const AutoPowerOff = {
    NEVER: 0,
    MIN_30: 30,
    MIN_60: 60,
};

export function autoPowerOffToBytes(minutes) {
    return [Math.floor(minutes / 60), minutes % 60, 0x00];
}

export function bytesToAutoPowerOff(bytes) {
    if (!bytes || bytes.length < 3)
        return null;

    return bytes[0] * 60 + bytes[1] + Math.round(bytes[2] / 60);
}

export const EqPresets = [
    {id: 'flat', gains: [0, 0, 0, 0, 0, 0, 0]},
    {id: 'blues', gains: [-252, -102, -60, -84, 72, 144, 168]},
    {id: 'electronic', gains: [54, 102, 54, -42, 12, 54, -72]},
    {id: 'natural', gains: [-18, -12, -6, 0, 0, -6, -216]},
    {id: 'rock', gains: [84, 288, 66, 24, 84, 48, -102]},
    {id: 'voice', gains: [-360, -276, -60, 24, 180, 228, -282]},
];

export const EqPresetCustom = 'custom';

export function eqGainsToPreset(gains) {
    const preset = EqPresets.find(p =>
        p.gains.length === gains.length && p.gains.every((g, i) => g === gains[i]));

    return preset ? preset.id : EqPresetCustom;
}

export const Gesture = {
    SINGLE_TAP: 0x00,
    TRIPLE_TAP: 0x01,
    DOUBLE_TAP: 0x05,
    LONG_PRESS: 0x06,
};

export const Touchpad = {
    RIGHT: 1,
    LEFT: 2,
    BOTH: 3,
};

export const TouchActionCustom = 'custom';

export const TouchActions = {
    'none': [],
    'play-pause': [[2, 0x00], [1, 0x00]],
    'next': [[1, 0x02]],
    'previous': [[1, 0x03]],
    'volume-up': [[0, 0x10]],
    'volume-down': [[0, 0x11]],
    'ambient': [[0, 0x0F]],
    'voice-assistant': [[2, 0x15], [1, 0x15]],
};

export function encodeGestureEntry(touchpad, context, action) {
    return touchpad << 14 | context << 7 | action;
}

export function gestureEntryTouchpad(entry) {
    return entry >> 14;
}

export function touchActionEntries(action, touchpad) {
    return (TouchActions[action] ?? []).map(([context, id]) =>
        encodeGestureEntry(touchpad, context, id));
}

export function gestureEntriesToAction(entries, touchpad) {
    const own = entries.filter(e => gestureEntryTouchpad(e) === touchpad).sort((a, b) => a - b);

    for (const action of Object.keys(TouchActions)) {
        const expected = touchActionEntries(action, touchpad).sort((a, b) => a - b);
        if (expected.length === own.length && expected.every((e, i) => e === own[i]))
            return action;
    }

    return TouchActionCustom;
}

export function applyTouchAction(entries, touchpad, action) {
    return [
        ...entries.filter(e => gestureEntryTouchpad(e) !== touchpad),
        ...touchActionEntries(action, touchpad),
    ];
}
