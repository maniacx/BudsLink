'use strict';

export default {
    name: 'Melomania A100',
    namePattern: /^Melomania A100/,

    batteryMultiple: true,
    batteryCase: true,

    noiseControl: {
        modes: ['off', 'anc', 'transparency'],
    },

    eqPresets: true,
    dynamicEq: true,
    wearDetection: true,
    mono: true,
    sleepMode: true,
    gamingMode: true,
    ldac: true,

    autoPowerOff: [0, 30, 60],
    voicePrompts: [
        'off', 'tones', 'english', 'german', 'french', 'spanish', 'italian', 'mandarin',
        'cantonese', 'korean', 'southwark',
    ],
    touchControls: true,

    albumArtIcon: 'earbuds',
    budsIcon: 'earbuds',
    case: 'case-normal',
};
