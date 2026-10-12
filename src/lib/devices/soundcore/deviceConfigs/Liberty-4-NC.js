'use strict';

export default {
    name: 'Soundcore Liberty 4 NC', // model code: A3947
    pattern: /.*Soundcore Liberty 4 NC.*/i,
    modelCode: '3947',
    batteryDual: true,
    batteryCase: true,
    batteryMaxLevel: 5,
    caseBatteryMaxLevel: 5,
    ambientSoundControl: true,
    noiseCancellingSubModes: true,

    // Offsets into the body of the 01 01 state update packet
    stateBodyLength: 159,
    batteryOffset: 2,
    caseBatteryOffset: 139,
    soundModesOffset: 126,

    // Two simultaneous connections; the device list is read/managed through the 0b xx commands
    dualConnection: {},
    maxConnected: 2,
    dualEnabledOffset: 147,
    // LDAC and multiple connections are mutually exclusive
    ldac: true,

    // One byte booleans in the state packet, each with its own set command
    flags: [
        {key: 'sound-leak-compensation', offset: 141, command: [0x10, 0x86]},
        {key: 'gaming-mode', offset: 143, command: [0x10, 0x85]},
        {key: 'touch-tone', offset: 144, command: [0x01, 0x83]},
        {key: 'surround-sound', offset: 148, command: [0x02, 0x86]},
        {key: 'auto-play-pause', offset: 152, command: [0x01, 0x81]},
        {key: 'wearing-tone', offset: 153, command: [0x01, 0x8C]},
        {key: 'touch-lock', offset: 156, command: [0x04, 0x86]},
        {key: 'low-battery-prompt', offset: 157, command: [0x10, 0x82]},
    ],
    // enabled byte followed by an index into durations (minutes)
    autoPowerOff: {offset: 154, durations: [10, 20, 30, 60]},
    // enabled byte, limit in dB (75-100 in steps of 5), refresh rate
    limitHighVolume: {offset: 149},

    // Touch controls: 8 buttons of (enabled, action) bytes. The enabled byte is not used on
    // this model; the action byte holds the action for earbuds in the case in the high nibble
    // and the normal one in the low nibble. 0xF means no action.
    buttons: {
        offset: 109,
        order: [
            'single-left', 'single-right', 'double-left', 'double-right',
            'long-left', 'long-right', 'triple-left', 'triple-right',
        ],
    },
    ambientCycleOffset: 125,

    // Equalizer block of the state packet; the custom equalizer has 8 editable bands
    equalizer: {
        offset: 37,
        freqs: [100, 200, 400, 800, 1600, 3200, 6400, 12800],
        range: 6,
    },

    albumArtIcon: 'earbuds-stem',
    budsIcon: 'earbuds-stem',
    case: 'case-oval-short',
};
