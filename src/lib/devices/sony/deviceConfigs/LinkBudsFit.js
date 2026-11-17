'use strict';

export default {
    name: 'LinkBuds Fit', // uuid: 956c7b26-d49a-4ba8-b03f-b17d393cb6e2 (v2)
    pattern: /.*LinkBuds Fit.*/,
    modaliasPrefix: 'v054Cp0EDB',
    batteryDual: true,
    batteryCase: true,
    ambientSoundControl: true,
    ambientSoundControlNA: true,
    ambientSoundControlButtonMode: true,
    buttonModesLeftRight: ['amb', 'vol', 'pb', 'na'],
    audioUpsampling: true,
    pauseWhenTakenOff: true,
    automaticPowerOffWhenTakenOff: true,
    powerOffFromPhone: true,
    speakToChatEnabled: true,
    speakToChatConfig: true,
    voiceNotifications: true,
    voiceNotificationsVolume: true,
    equalizerSixBands: true,
    listeningMode: true,
    dualConnection: {
        hasRoutingIndicator: true,
        hasRoutingControl: true,
        hasActiveFix: true,
    },
    albumArtIcon: 'earbuds',
    budsIcon: 'earbuds',
    case: 'case-oval',
};

