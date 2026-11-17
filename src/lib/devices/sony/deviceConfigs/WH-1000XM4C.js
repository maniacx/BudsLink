'use strict';

export default {
    name: 'WH-1000XM4C', // uuid: 956c7b26-d49a-4ba8-b03f-b17d393cb6e2 (v2)
    pattern: /.*WH-1000XM4C.*/,
    modaliasPrefix: 'v054Cp1020',
    batterySingle: true,
    powerOffFromPhone: true,
    ambientSoundControl: true,
    //    ambientSoundControlNA: true,
    ambientSoundControlButtonMode: true,
    speakToChatEnabled: true,
    speakToChatConfig: true,
    //    speakToChatFocusOnVoice: true,
    voiceNotifications: true,
    voiceNotificationsVolume: true,
    //   automaticPowerOffWhenTakenOff: true,
    equalizerTenBands: true,
    //   listeningMode: true,
    quickAccess: true,
    audioUpsampling: true,
    pauseWhenTakenOff: true,
    dualConnection: {
        hasRoutingIndicator: true,
        hasRoutingControl: true,
        hasActiveFix: true,
    },
    albumArtIcon: 'headphone1',
    budsIcon: 'headphone1',
};

