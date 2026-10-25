---
layout: default
title: Sennheiser
parent: Devices
permalink: /sennheiser
---


# Sennheiser Headband / Earbuds


* Bluetooth socket for Sennheiser Headband / Earbuds can be accessed by only one application at a time. Close other Sennheiser companion or monitoring apps, before using BudsLink.
* Feature availability varies by model.

<br>
<img src="{{ 'assets/images/sennheiser/sennheiser-main.png' | relative_url }}" width="45%">
<img src="{{ 'assets/images/sennheiser/sennheiser-configure.png' | relative_url }}" width="85%">

Most settings are self-explanatory and similar to those available on OEM app. Settings specific to BudsLink are explained below.

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Parametric Eq (HDB 630 only)
<img src="{{ 'assets/images/sennheiser/sennheiser-parametric.png' | relative_url }}" width="85%">

## Compatibility
<br>

**Help update the compatibility list**

If your device is missing from the list or you have additional compatibility information, please help improve the documentation by submitting a pull request to the [Documentation](https://github.com/maniacx/BudsLink/blob/Documentation/docs/Devices/Sennheiser.md) branch to update this page, or opening an issue with your device model and details of features you tested.

<br>

**New Device Configuration**

If your device configuration is missing, you can request its addition by opening an issue with screenshots of the OEM app and the output of `bluetoothctl info <device-MAC>` Alternatively, submit a pull request to the main branch with the new device configuration after successful test.

<br>

**Currently tested and confirmed working:**
* **Sennheiser HDB 630**  ✅ — Credits: TheGentleChainsaw
* **Sennheiser Momentum Wireless 4**  ✅ — Credits: jacostag

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

### Sennheiser HDB 630

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Headband  | ✅     |
| Noise Cancellation (strength) | ✅        | ✅     |
| Adaptive                      | ✅        | ✅     |
| Equalizer Preset              | ✅        | ✅     |
| Equalizer Custom              | ✅        | ✅     |
| Podcast Mode                  | ✅        | ✅     |
| Switch to Sound Personalization| ✅        | ✅     |
| Sound Personalization Customization| ❌        | ❌     |
| Parametric Equalizer          | ✅        | ✅     |
| CrossFeed                     | ✅        | ✅     |
| SideTone                      | ✅        | ✅     |
| Comfort Call                  | ✅        | ✅     |
| In Ear Detection              | ✅        |Not Tested|
| Auto Answer Calls             | ✅        | ✅     |
| Auto Pause  (OEM app)         | ✅        | ✅     |
| Auto Pause Resume (BudsLink app)| ✅        | ❌     |
| Auto Transparency             | ✅        | ✅     |
| Auto Power Timeout            | ✅        | ✅     |
| Device Management (Multipoint)| ✅        | ❌     |

### Sennheiser Momentum Wireless 4

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Headband  | ✅     |
| Noise Cancellation (strength) | ✅        | ✅     |
| Adaptive                      | ✅        | ✅     |
| Equalizer Preset              | ✅        | ✅     |
| Equalizer Custom              | ✅        | ✅     |
| Podcast Mode                  | ✅        | ✅     |
| Switch to Sound Personalization| ✅        | ✅     |
| Sound Personalization Customization| ❌        | ❌     |
| SideTone                      | ✅        | ✅     |
| Comfort Call                  | ✅        | ✅     |
| In Ear Detection              | ✅        |Not Tested|
| Auto Answer Calls             | ✅        | ✅     |
| Auto Pause  (OEM app)         | ✅        | ✅     |
| Auto Pause Resume (BudsLink app)| ✅        | ❌     |
| Auto Power Timeout            | ✅        | ✅     |
| Device Management (Multipoint)| ✅        | ❌     |

