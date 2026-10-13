'use strict';
/* eslint-disable max-len */
export default {
    modelId: 'B190',
    name: 'Nothing Ear (3a)',
    pattern: /^.*Nothing Ear (3a)$/,

    batteryLR: true,
    batteryCase: true,

    eqPreset: {
        balanced: 0x00,
        voice: 0x01,
        more_treble: 0x02,
        more_bass: 0x03,
        custom: 0x05,
        advance: 0x06,
    },
    eqListeningModeType: true,

    noiseControl: {
        off: {byte: 0x05},
        transparency: {byte: 0x07},
        noiseCancellation: {
            levels: {
                low: 0x03,
                mid: 0x02,
                high: 0x01,
                adaptive: 0x04,
            },
        },
    },

    inEarDetection: true,
    lowLatencyMode: true,
    fitTest: true,
    ring: true,
    dualConnection: true,
    dualConnectionReboot: true,
    spatialAudioSwitch: true,

    gestureOptions: {
        default: '0C020102090301020902010308030103080201071603010716020109250301092502010B2503010B2502010C0103010C01',
        slots: [
            {group: 'left',  device: 0x02, buttonId: 0x01, type: 'double'},
            {group: 'left',  device: 0x02, buttonId: 0x01, type: 'triple'},
            {group: 'left',  device: 0x02, buttonId: 0x01, type: 'action-hold'},
            {group: 'left',  device: 0x02, buttonId: 0x01, type: 'double-action-hold'},
            {group: 'left', device: 0x02, buttonId: 0x01, type: 'both-buds-action'},
            {group: 'right', device: 0x03, buttonId: 0x01, type: 'double'},
            {group: 'right', device: 0x03, buttonId: 0x01, type: 'triple'},
            {group: 'right', device: 0x03, buttonId: 0x01, type: 'action-hold'},
            {group: 'right', device: 0x03, buttonId: 0x01, type: 'double-action-hold'},
            {group: 'right', device: 0x02, buttonId: 0x01, type: 'both-buds-action'},
        ],
        mapping: {
            gestureTypes: {
                'double': 0x02,
                'triple': 0x03,
                'action-hold': 0x07,
                'double-action-hold': 0x09,
                'both-buds-action': 0x0B,
            },
            actions: {
                'skip-forward': [0x09],
                'skip-back': [0x08],
                'voice-assistant': [0x0B],
                'noise-control': [0x0A, 0x14, 0x15, 0x16],
                'volume-up': [0x12],
                'volume-down': [0x13],
                'mic-mute': [0x1D],
                'news-description': [0x1F],
                'recording': [0x25],
                'no-action': [0x01],
            },
        },
        gestures: {
            'double': {
                type: 'pinch',
                actions: [
                    'skip-forward',
                    'skip-back',
                    'voice-assistant',
                ],
            },
            'triple': {
                type: 'pinch',
                actions: [
                    'skip-forward',
                    'skip-back',
                    'voice-assistant',
                    'no-action',
                ],
            },
            'action-hold': {
                type: 'pinch',
                actions: [
                    'noise-control',
                    'volume-up',
                    'volume-down',
                    'recording',
                    'voice-assistant',
                    'mic-mute',
                    'no-action',
                ],
            },
            'double-action-hold': {
                type: 'pinch',
                actions: [
                    'noise-control',
                    'volume-up',
                    'volume-down',
                    'recording',
                    'voice-assistant',
                    'no-action',
                ],
            },
            'both-buds-action': {
                type: 'pinch',
                actions: [
                    'recording',
                    'no-action',
                ],
            },
        },
        noiseControlModes: ['off', 'transparency', 'noise-cancellation'],
    },

    albumArtIcon: 'earbuds-stem',
    budsIcon: 'earbuds-stem',
    case: 'case-square',
};

