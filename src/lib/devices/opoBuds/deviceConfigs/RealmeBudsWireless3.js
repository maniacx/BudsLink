'use strict';

export default {
    modelId: '200005',
    name: 'Realme Buds Wireless 3',

    batteryLR: false,
    batteryCase: false,

    eqPreset: {
        originalSound: 0x00,
        deepBass: 0x01,
        serenade: 0x02,
        clearBass: 0x03,
    },

    noiseControl: {
        modes: {
            off: {
                set: [0x01],
                event: [0x01],
            },
            transparency: {
                set: [0x02],
                event: [0x02],
            },
            noiseCancellation: {
                set: [0x08],
                event: [0x08],
            },
        },
    },

    lowLatencyMode: true,
    spatialAudio: true,
    dynamicBass: true,
    dynamicBassOpo: true,

    albumArtIcon: 'earbuds-neckband',
    budsIcon: 'earbuds-neckband',
};
