'use strict';

import SonoFlow from './deviceConfigs/SonoFlow.js';

export const OneMoreBudsModelList = [
    SonoFlow,
];

/**
Reference Material and Credits

Protocol recovered from the "1MORE MUSIC" Android application
(com.onemore.connect): com.onemore.music.module.ui.cmd.{CmdKt, DispatcherKt,
ConstKt}, com.onemore.music.module.spp.{BluetoothOrderConstents,
BluetoothService, BluetoothSPP}.
**/

/* SPP frame header offsets — built by CmdKt.makeData().
   [flag][port][cmdHi][cmdLo][lenHi][lenLo][seqHi][seqLo][checksum][payload...] */
export const FrameHeader = {
    SPP_FLAG: 0x11,
    SPP_PORT: 0x01,
    /* BLE path uses makeReceiveBleData: flag 0x01, port 0x00 */
    BLE_FLAG: 0x01,
    BLE_PORT: 0x00,
    HEADER_LEN: 9,
};

/* cmd byte pairs — BluetoothOrderConstents / CmdKt.
   Each GET command uses cmdHi == cmdLo == the code. */
export const CommandType = {
    SHAKE_HAND: 0x4D,
    BINAURAL_INFO: 0x4E,

    EQ_PARAMS_SET: 0x53,
    EQ_PARAMS_GET: 0x54,

    /* Sound-style preset selector (over-ear models like SonoFlow). */
    PRESET_SOUND_SET: 0x69,
    PRESET_SOUND_GET: 0x6A,

    FIND_DEVICE: 0x5A,

    EQ_MODE_SET: 0x3B,
    EQ_MODE_GET: 0x3C,

    LISTEN_MODE_SET: 0x5E,
    LISTEN_MODE_GET: 0x5F,

    AUTO_PLAY_SET: 0x62,
    AUTO_PLAY_GET: 0x63,

    DOUBLE_CLICK_SET: 0x64,
    DOUBLE_CLICK_GET: 0x65,

    TRIPLE_CLICK_SET: 0x66,
    TRIPLE_CLICK_GET: 0x67,
};

/* Listen-mode values — ConstKt.listenModeName(). */
export const ListenMode = {
    OFF: 0x00,
    STRONG: 0x01,
    MILD: 0x02,
    TRANSPARENT: 0x03,
    WNR: 0x04,
    PASS_THROUGH: 0x05,
    VOICE_ENHANCEMENT: 0x06,
    ADAPTIVE: 0x07,
};

/* EQ preset selector — ConstKt.eqModeName(). */
export const EqPreset = {
    MUSIC: 0x00,
    SLEEP: 0x01,
};

/* Sound-style presets for over-ear models (0x69/0x6A PRESET_SOUND). The
   official app builds this exact list in TestKt#custSoundData() and the
   sound-style picker is fed straight from it; HC905 is not among the models
   given their own list, so these default names apply. */
export const SonoFlowPreset = {
    names: [
        'Studio',             // 0x00
        'Bass reducer',       // 0x01
        'Bass booster',       // 0x02
        'Acoustic',           // 0x03
        'Classical',          // 0x04
        'Podcast',            // 0x05
        'Deep',               // 0x06
        'Electronic',         // 0x07
        'Hip-Hop',            // 0x08
        'Lounge',             // 0x09
        'Pop',                // 0x0A
        'Voice Enhancement',  // 0x0B
    ],
    values: Array.from({length: 12}, (_, i) => i),
};

/* Double click / triple click actions. The earbuds (binaural) and over-ear
   (monaural-connected) devices accept slightly different sets — over-ear
   (monaural) list: 0 off, 1 next, 2 prev, 3 vol_down, 4 vol_up. */
export const ClickAction = {
    OFF: 0x00,
    NEXT: 0x01,
    PREV: 0x02,
    VOL_DOWN: 0x03,
    VOL_UP: 0x04,
    PLAY_PAUSE: 0x05,
    VOICE_CONTROL: 0x06,
};

/* FindDevice payload: [left][right], 0x01 = ring, 0x00 = stop. */
export const FindDevice = {
    LEFT_RING: [0x01, 0x00],
    RIGHT_RING: [0x00, 0x01],
    STOP: [0x00, 0x00],
};