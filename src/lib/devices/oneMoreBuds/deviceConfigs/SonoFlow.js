'use strict';

/*
 * 1MORE SonoFlow (HC905).
 *
 * An over-ear ANC headphone identified by its 1MORE model name / internal
 * model code HC905. Controlled over a classic SPP (RFCOMM) link using the
 * standard serial profile UUID, exactly like the official app.
 */
export default {
    name: 'SonoFlow',
    id: ['HC905', 'HQ33'],
    type: 'headphones',

    /* Detects this model among the audio devices paired with BlueZ. */
    namePatterns: [
        /.*1MORE\s+Sono[Ff]low.*/i,
        /.*Sono[Ff]low\s+QC30.*/i,
    ],

    /* An over-ear headphone reports one battery; the 0x4E binaural-info frame
       may carry redundant left/right/box fields, so present it as a single
       level like the other over-ear models in BudsLink. */
    batteryMultiple: false,
    batteryCase: false,

    /* Airoha listen-mode selector this model exposes:
       0 off, 1 strong (ANC), 2 mild, 3 transparent. */
    noiseControl: {
        modes: ['off', 'nc', 'ambient'],
    },

    /* Sound-style preset selector (0x69/0x6A PRESET_SOUND). The 0x3B/0x3C
       EQ-mode commands the earbuds use are not answered on this model. */
    equalizer: true,
    eqPresetModel: 'presetSound',

    /* Double / triple click gesture configuration (0x64/0x66). The firmware
       replies cmd 0x00 to both GETs — gestures are not supported on this
       model, so the rows are hidden and no GETs are sent. */
    gestures: false,

    /* 0x5A find-my-device. The device replies cmd 0x02 to the 0x5A trigger
       (a generic packet ACK) but answers cmd 0x00 to the 0x5B FindDeviceUI
       capability query and never starts a beeper — the official app would
       not offer find for this model, so the row stays hidden. */
    findMyBuds: false,

    albumArtIcon: 'headphone1',
    budsIcon: 'headphone1',
    case: 'case-normal',
};