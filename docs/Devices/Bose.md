---
layout: default
title: Bose
parent: Devices
permalink: /bose
---


# Bose Headband / Earbuds

* Bluetooth socket for Bose headband/earbuds can be accessed by only one application at a time. Close other Bose companion or monitoring apps, such as bosectl, before using BudsLink.

<br>
<img src="{{ 'assets/images/bose/bose-main.png' | relative_url }}" width="45%">
<img src="{{ 'assets/images/bose/bose-configure.png' | relative_url }}" width="85%">

Most settings are self-explanatory and similar to those available on OEM app. Settings specific to BudsLink are explained below.

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Modes
<img src="{{ 'assets/images/bose/bose-mode.png' | relative_url }}" width="85%">

The Modes page provides the same mode selection and configuration options as the OEM mobile app. The main difference is the `Show in toggle` button.

Clicking `Show in toggle` adds the selected mode to the Main Page toggle, allowing you to switch between modes directly from the main page. A maximum of 4 modes can be added to the Main Page.
<img src="{{ 'assets/images/bose/bose-add-toggle.png' | relative_url }}" width="100%">

## Compatibility
<br>

**Help update the compatibility list**

If your device is missing from the list or you have additional compatibility information, please help improve the documentation by submitting a pull request to the [Documentation](https://github.com/maniacx/BudsLink/blob/Documentation/docs/Devices/Bose.md) branch to update this page, or opening an issue with your device model and details of features you tested.

<br>

**New Device Configuration**

If your device configuration is missing, you can request its addition by opening an issue with screenshots of the OEM app and the output of `bluetoothctl info <device-MAC>` Alternatively, submit a pull request to the main branch with the new device configuration after successful test.

<br>

**Currently tested and confirmed working:**
* **Bose QuietComfort Ultra Earbuds**  ✅ — Credits: SMaiz, MobileAZN
* **Bose QuietComfort 35 II**  ✅ — Credits: amaxine
* **Bose QuietComfort 35**  ✅ — Credits: amaxine 

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

### Bose QuietComfort Ultra Earbuds

| Feature                        |      Supported      | Tested |
| :----------------------------- | :-----------------: | :----: |
| Battery Level                  | Left / Right / Case |    ✅   |
| Audio Modes                    |          ✅          |    ✅   |
| Custom Audio Modes             |          ✅          |    ✅   |
| Spatial Audio                  |          ✅          |    ✅   |
| Equalizer Preset               |          ✅          |    ✅   |
| Equalizer Custom               |          ✅          |    ✅   |
| SideTone                       |          ✅          |    ✅   |
| Auto Answer Calls              |          ✅          |    ✅   |
| Auto Pause                     |          ✅          |    ✅   |
| Auto Transparency              |          ✅          |    ✅   |
| Device Management (Multipoint) |          ✅          |    Not tested   |
| Voice Prompts                  |          ✅          |    ✅   |
| Gesture Customization          |          ✅          |    ✅   |


### Bose QuietComfort 35 II

| Feature                        | Supported | Tested |
| :----------------------------- | :-------: | :----: |
| Battery Level                  |  Headband |    ✅   |
| Noise Cancellation (strength)  |     ✅     |    ✅   |
| SideTone                       |     ✅     |    ✅   |
| Automatic Power Off Timer      |     ✅     |    ✅   |
| Voice Prompts                  |     ✅     |    ✅   |
| Device Management (Multipoint) |     ✅     |    Not tested   |
| Gesture / Button Customization |     ✅     |    ✅   |

### Bose QuietComfort 35

| Feature                        | Supported | Tested |
| :----------------------------- | :-------: | :----: |
| Battery Level                  |  Headband |    ✅   |
| Noise Cancellation (strength)  |     ✅     |    ✅   |
| Automatic Power Off Timer      |     ✅     |    ✅   |
| Voice Prompts                  |     ✅     |    ✅   |
| Device Management (Multipoint) |     ✅     |    Not tested   |



