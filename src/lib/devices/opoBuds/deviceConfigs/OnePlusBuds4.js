'use strict';

export default {
    modelId: '065414',
    name: 'OnePlus Buds 4',

    batteryLR: true,
    batteryCase: true,

    eqPreset: {
        originalSound: 0x0B,
        serenade: 0x0E,
        bass: 0x01,
    },

    customEqSupport: true,
    eqBands: {
        frequencies: [62, 250, 1000, 4000, 8000, 16000],
        range: 6,
    },

    noiseControl: {
        ancCycleType: 2,
        off: [0x01],
        transparency: {
            levels: {
                regular: [0x04],
            },
        },
        noiseCancellation: {
            levels: {
                smart: [0x80],
                mild: [0x40],
                moderate: [0x20],
                deep: [0x10],
            },
        },
        adaptive: [0x00, 0x80],
    },

    inEarDetection: true,
    lowLatencyMode: true,
    dualConnection: true,
    spatialAudio: true,
    highResAudio: true,
    dynamicBass: true,
    dynamicBassOpo: true,
    autoAnswer: true,
    findMyPhone: true,
    fitTest: true,
    ring: true,

    gestureOptions: {
        slots: [
            {group: 'left',  device: 0x01, buttonId: 0x01, type: 'single'},
            {group: 'left',  device: 0x01, buttonId: 0x01, type: 'double'},
            {group: 'left',  device: 0x01, buttonId: 0x01, type: 'triple'},
            {group: 'left',  device: 0x01, buttonId: 0x01, type: 'swipe'},
            {group: 'left',  device: 0x01, buttonId: 0x01, type: 'action-hold'},
            {group: 'right',  device: 0x02, buttonId: 0x01, type: 'single'},
            {group: 'right', device: 0x02, buttonId: 0x01, type: 'double'},
            {group: 'right', device: 0x02, buttonId: 0x01, type: 'triple'},
            {group: 'right',  device: 0x02, buttonId: 0x01, type: 'swipe'},
            {group: 'right', device: 0x02, buttonId: 0x01, type: 'action-hold'},
        ],
        mapping: {
            gestureTypes: {
                'single': 0x01,
                'double': 0x02,
                'triple': 0x03,
                'action-hold': 0x04,
                'swipe': 0x05,
            },
            actions: {
                'none': [0x00],
                'play-pause': [0x01],
                'voice-assistant': [0x04],
                'skip-back': [0x05],
                'skip-forward': [0x06],
                'noise-control': [0x08],
                'device-switch': [0x0A],
                'game-mode': [0x11],
                'change-volume': [0x07],
                'switch-track': [0x0A],
            },
        },
        gestures: {
            'single': {
                type: 'tap',
                actions: [
                    'play-pause',
                    'none',
                ],
            },
            'double': {
                type: 'tap',
                actions: [
                    'play-pause',
                    'skip-forward',
                    'skip-back',
                    'voice-assistant',
                    'game-mode',
                    'none',
                ],
            },
            'triple': {
                type: 'tap',
                actions: [
                    'skip-forward',
                    'skip-back',
                    'voice-assistant',
                    'game-mode',
                    'none',
                ],
            },
            'swipe': {
                type: 'swipe',
                actions: [
                    'none',
                    'change-volume',
                    'switch-track',
                ],
            },
            'action-hold': {
                type: 'tap',
                actions: [
                    'noise-control',
                    'voice-assistant',
                    'game-mode',
                    'device-switch',
                    'none',
                ],
            },
        },
        noiseControlModes: {
            'off': 0x01,
            'transparency': 0x02,
            'noise-cancellation': 0x08,
            'adaptive': 0x8000,
        },
    },

    albumArtIcon: 'earbuds-stem',
    budsIcon: 'earbuds-stem',
    case: 'case-round',
};
