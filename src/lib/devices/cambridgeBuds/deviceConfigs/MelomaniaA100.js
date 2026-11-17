'use strict';

export default {
    name: 'Melomania A100',
    namePattern: /^Melomania A100/,

    batteryMultiple: true,
    batteryCase: true,

    eq: {
        range: 6,
        bands: 7,
        freq: [60, 120, 500, 1000, 2000, 4000, 10000],
        custom: true,
        presets: {
            flat: [0, 0, 0, 0, 0, 0, 0],
            blues: [-4.2, -1.7, -1.0, -1.4, 1.2, 2.4, 2.8],
            electronic: [0.9, 1.7, 0.9, -0.7, 0.2, 0.9, -1.2],
            natural: [-0.3, -0.2, -0.1, 0, 0, -0.1, -3.6],
            rock: [1.4, 4.8, 1.1, 0.4, 1.4, 0.8, -1.7],
            voice: [-6.0, -4.6, -1.0, 0.4, 3.0, 3.8, -4.7],
        },
    },

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
