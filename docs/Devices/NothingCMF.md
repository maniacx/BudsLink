---
layout: default
title: Nothing / CMF
parent: Devices
permalink: /nothingcmf
---

# Nothing / CMF Buds

* Bluetooth socket for Nothing / CMF Buds can be accessed by only one application at a time. Close other Nothing / CMF companion or monitoring apps, such as earctl or earweb, before using BudsLink.
* Feature availability varies by model.

<br>
<img src="{{ 'assets/images/nothing/nothing-main.png' | relative_url }}" width="45%">
<img src="{{ 'assets/images/nothing/nothing-configure.png' | relative_url }}" width="85%">

Most settings are self-explanatory and similar to those available on OEM app. Settings specific to BudsLink are explained below.

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Compatibility
<br>

**Help update the compatibility list**

If your device is missing from the list or you have additional compatibility information, please help improve the documentation by submitting a pull request to the [Documentation](https://github.com/maniacx/BudsLink/blob/Documentation/docs/Devices/NothingCMF.md) branch to update this page, or opening an issue with your device model and details of features you tested.

<br>

**New Device Configuration**

If your device configuration is missing, you can request its addition by opening an issue with screenshots of the OEM app and the output of `bluetoothctl info <device-MAC>` Alternatively, submit a pull request to the main branch with the new device configuration after successful test.

<br>

**Currently tested and confirmed working:**

* **CMF Buds 2 Plus [B184]**  ✅ — Credits: ArcticDev78
* **Nothing Headphone (1) [B170]**  ✅ — Credits: Lascar_s@matrix
* **CMF Buds Pro 2 [B172]**  ✅ — Credits: khaledkhamis26
* **CMF Buds 2 [B179]**  ✅ — Credits: duckeydev
* **CMF Buds 2a [B179]**  ✅ — Credits: shakasan
* **Neckband Pro [B164]**  ✅ — Credits: iamxnfa
* **Nothing Headphone (a) [B198]**  ✅ — Credits: The-Nyla
* **Nothing Ear (3a) [B190]**  ✅ — Credits: rekordskratch


<br>

<style>
table th:first-of-type {
    width: 60%;
}
table th:nth-of-type(2) {
    width: 20%;
}
table th:nth-of-type(3) {
    width: 20%;
}
</style>

# Compatibility List

---

## Ear (2) (B155)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ❌ |
| Noise Control Level | Low, Mid, High | ❌ |
| Noise Control Adaptive | ✅ | ❌ |
| Personalized ANC | ✅ | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## Ear (Stick) (B157)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## Nothing Ear (A) (B162)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ❌ |
| Noise Control Level | Low, Mid, High | ❌ |
| Noise Control Adaptive | ✅ | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## Buds Pro (B163)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ❌ |
| Noise Control Level | Low, Mid, High | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## Neckband Pro (B164)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Single | ✅ |
| Noise Control | ✅ | ✅ |
| Noise Control Level | Low, Mid, High | ✅ |
| Noise Control Adaptive | ✅ | ✅ |
| Eq Preset | ✅ | ✅ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ✅ |
| Spatial Audio | ✅ | ✅ |
| Low Latency Mode | ✅ | ✅ |
| Find My Buds | ✅ | ✅ |
| Gesture | ✅ | ✅ |

---

## CMF Buds (B168)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## Nothing Headphone (1) (B170)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Single | ✅ |
| Noise Control | ✅ | ✅ |
| Noise Control Level | Low, Mid, High | ✅ |
| Noise Control Adaptive | ✅ | ✅ |
| Eq Preset | ✅ | ✅ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ✅ |
| Spatial Audio | ✅ | ✅ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ✅ |
| Find My Buds | ✅ | ✅ |
| Gesture | ✅ | ✅ |

---

## Nothing Ear (B171)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ❌ |
| Noise Control Level | Low, Mid, High | ❌ |
| Noise Control Adaptive | ✅ | ❌ |
| Personalized ANC | ✅ | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## CMF Buds Pro 2 (B172)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ✅ |
| Noise Control | ✅ | ✅ |
| Noise Control Level | Low, Mid, High | ✅ |
| Noise Control Adaptive | ✅ | ✅ |
| Eq Preset | ✅ | ✅ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ✅ |
| Spatial Audio | ✅ | ✅ |
| In Ear Detection | ✅ | ✅ |
| Low Latency Mode | ✅ | ✅ |
| Find My Buds | ✅ | ✅ |
| Gesture | ✅ | ✅ |

---

## Nothing Ear (3) (B173)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ❌ |
| Noise Control Level | Low, Mid, High | ❌ |
| Noise Control Adaptive | ✅ | ❌ |
| Personalized ANC | ✅ | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| Spatial Audio | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## Nothing Ear (Open) (B174)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| Low Latency Mode | ✅ | ❌ |

---

## CMF Headphone Pro (B175)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Single | ❌ |
| Noise Control | ✅ | ❌ |
| Noise Control Level | Low, Mid, High | ❌ |
| Noise Control Adaptive | ✅ | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ❌ |
| Spatial Audio | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## CMF Buds 2 (B179)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ✅ |
| Noise Control | ✅ | ✅ |
| Noise Control Level | Low, Mid, High | ✅ |
| Noise Control Adaptive | ✅ | ✅ |
| Eq Preset | ✅ | ✅ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ✅ |
| Spatial Audio | ✅ | ✅ |
| Low Latency Mode | ✅ | ✅ |
| Find My Buds | ✅ | ✅ |
| Gesture | ✅ | ✅ |

---

## Nothing Ear (1) (B181)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ❌ |
| Noise Control Level | Low, High | ❌ |
| Eq Preset | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## Nothing Ear (a) (B183)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ❌ |
| Noise Control Level | Low, Mid, High | ❌ |
| Noise Control Adaptive | ✅ | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## CMF Buds 2 Plus (B184)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ✅ |
| Noise Control Level | Low, Mid, High | ✅ |
| Noise Control Adaptive | ✅ | ✅ |
| Eq Preset | ✅ | ✅ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ✅ |
| Spatial Audio | ✅ | ✅ |
| In Ear Detection | ✅ | ✅ |
| Low Latency Mode | ✅ | ✅ |
| Find My Buds | ✅ | ❌ |
| Gesture | ✅ | ✅ |

---

## CMF Buds 2a (B185)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ✅ |
| Noise Control | ✅ | ✅ |
| Eq Preset | ✅ | ✅ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ✅ |
| Low Latency Mode | ✅ | ✅ |
| Find My Buds | ✅ | ✅ |
| Gesture | ✅ | ✅ |

---

## CMF Buds Pro 2 (B187)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ❌ |
| Noise Control | ✅ | ❌ |
| Noise Control Level | Low, Mid, High | ❌ |
| Noise Control Adaptive | ✅ | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ❌ |
| Spatial Audio | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## Nothing Headphone (a) (B186)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Single | ❌ |
| Noise Control | ✅ | ❌ |
| Noise Control Level | Low, Mid, High | ❌ |
| Noise Control Adaptive | ✅ | ❌ |
| Eq Preset | ✅ | ❌ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ❌ |
| Spatial Audio | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Gesture | ✅ | ❌ |

---

## Nothing Headphone (a) (B198)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Single | ✅ |
| Noise Control | ✅ | ✅ |
| Noise Control Level | Low, Mid, High | ✅ |
| Noise Control Adaptive | ✅ | ✅ |
| Eq Preset | ✅ | ✅ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ✅ |
| Spatial Audio | ✅ | ✅ |
| In Ear Detection | ✅ | ❌ |
| Low Latency Mode | ✅ | ✅ |
| Find My Buds | ✅ | ✅ |
| Gesture | ✅ | ✅ |

---

## Nothing Earbuds (3a) (B190)

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | Left+Right+Case | ✅ |
| Noise Control | ✅ | ✅ |
| Noise Control Level | Low, Mid, High | ✅ |
| Noise Control Adaptive | ✅ | ✅ |
| Eq Preset | ✅ | ✅ |
| Eq Custom | Not Implemented | ❌ |
| Enhanced Bass | ✅ | ✅ |
| Spatial Audio | ✅ | ✅ |
| In Ear Detection | ✅ | ✅ |
| Low Latency Mode | ✅ | ✅ |
| Find My Buds | ✅ | ✅ |
| Gesture | ✅ | ✅ |

---
