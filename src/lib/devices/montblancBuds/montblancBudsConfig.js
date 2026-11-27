'use strict';

// Montblanc MTB 03 — Qualcomm GAIA v3 (vendor 0x001D), firmware "5.0.3".
// Supported GAIA features reported by the buds: Core v2, Earbud v1, ANC v0, Voice UI v1,
// Music Processing v1, Upgrade v2. No Voice Processing (no mic controls).
//
// The ANC feature uses the older 1-based command layout (verified on hardware):
//   0x01 GET state   -> 00 off / 01 on
//   0x02 SET state   <- 00 / 01
//   0x03 GET number of modes (0x0a)
//   0x04 GET mode    -> 00..05, see AncMode
//   0x05 SET mode    <- 00..05
// Notifications: 0x0480 state, 0x0481 mode, 0x0482 leakthrough gain.
// Battery and gesture commands used by other GAIA drivers are rejected by this firmware;
// battery is read from BlueZ (org.bluez.Battery1, reported over HFP).

export const GAIA_SOF = 0xFF;
export const GAIA_VERSION_LEGACY = 0x01;
export const GAIA_VERSION_V4 = 0x04;
export const GAIA_FLAG_CHECKSUM = 0x01;
export const GAIA_FLAG_LENGTH_16 = 0x02;
export const GAIA_HEADER_LEN = 8;

export const Vendor = {
    CSR: 0x000A,
    QUALCOMM: 0x001D,
};

export const Feature = {
    CORE: 0x00,
    ANC: 0x02,
};

export const PacketType = {
    COMMAND: 0,
    NOTIFICATION: 1,
    RESPONSE: 2,
    ERROR: 3,
};

export function gaiaCommand(feature, type, id) {
    return feature << 9 | type << 7 | id;
}

export const CoreCmd = {
    GET_APP_VERSION: gaiaCommand(Feature.CORE, PacketType.COMMAND, 0x05),
    REGISTER_NOTIFICATION: gaiaCommand(Feature.CORE, PacketType.COMMAND, 0x07),
    SET_TRANSPORT_INFO: gaiaCommand(Feature.CORE, PacketType.COMMAND, 0x0D),
};

export const CoreRsp = {
    GET_APP_VERSION: gaiaCommand(Feature.CORE, PacketType.RESPONSE, 0x05),
};

export const AncId = {
    GET_STATE: 0x01,
    SET_STATE: 0x02,
    GET_MODE: 0x04,
    SET_MODE: 0x05,
};

export const AncNtfId = {
    STATE: 0x00,
    MODE: 0x01,
    GAIN: 0x02,
};

export const AncState = {
    OFF: 0x00,
    ON: 0x01,
};

// Each sub-mode is its own mode number (even = noise cancellation, odd = Live/transparency).
// The buds apply a per-mode preset level automatically (reported in notification 0x0482).
// The earbud gesture only cycles TRAVEL and ATTENTION; the others are set from an app.
export const AncMode = {
    TRAVEL: 0x00,
    ATTENTION: 0x01,
    OFFICE: 0x02,
    VOICE_FOCUS: 0x03,
    SPORTS: 0x04,
    ENVIRONMENT: 0x05,
};

// Sub-modes per noise-control family, in UI order (1-based index in boxNRadioButtonState).
export const AncSubModes = {
    anc: [AncMode.TRAVEL, AncMode.OFFICE, AncMode.SPORTS],
    live: [AncMode.ATTENTION, AncMode.VOICE_FOCUS, AncMode.ENVIRONMENT],
};

export function ancFamily(mode) {
    return Object.keys(AncSubModes).find(f => AncSubModes[f].includes(mode)) ?? null;
}

export const MontblancBudsModelList = [
    {
        name: 'Montblanc MTB 03',
        namePattern: /MTB ?03/i,
        budsIcon: 'earbuds',
    },
];
