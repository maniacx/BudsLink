'use strict';

export default {
    name: 'Soundcore Liberty 5 Pro', // model code: A3956
    pattern: /.*Soundcore Liberty 5 Pro.*/i,
    modelCode: '3956',
    isTlv: true,
    stateBodyLength: 332,
    batteryDual: true,
    batteryCase: true,
    batteryMaxLevel: 100,
    caseBatteryMaxLevel: 100,
    ambientSoundControl: true,
    noiseCancellingSubModes: false,

    // Two simultaneous connections; the device list is read/managed through the 0b xx commands
    dualConnection: {},
    maxConnected: 2,


    albumArtIcon: 'earbuds-stem',
    budsIcon: 'earbuds-stem',
    case: 'case-oval-short',
};
