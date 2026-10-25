---
layout: default
title: Soundcore
parent: Devices
permalink: /soundcore
---


# Soundcore

* Bluetooth socket for Soundcore can be accessed by only one application at a time. Close other Soundcore companion or monitoring apps, before using BudsLink.
* Feature availability varies by model.
* Credits to abdulazizumarovich  for contributing the Soundcore Earbuds protocol.

<br>
<img src="{{ 'assets/images/soundcore/soundcore-main.png' | relative_url }}" width="45%">
<img src="{{ 'assets/images/soundcore/soundcore-configure.png' | relative_url }}" width="85%">

Most settings are self-explanatory and similar to those available on OEM app. Settings specific to BudsLink are explained below.

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Compatibility
<br>

**Help update the compatibility list**

If your device is missing from the list or you have additional compatibility information, please help improve the documentation by submitting a pull request to the [Documentation](https://github.com/maniacx/BudsLink/blob/Documentation/docs/Devices/Soundcore.md) branch to update this page, or opening an issue with your device model and details of features you tested.

<br>

**New Device Configuration**

If your device configuration is missing, you can request its addition by opening an issue with screenshots of the OEM app, the output of `bluetoothctl info <device-MAC>`. Alternatively, submit a pull request to the main branch with the new device configuration after successfully testing it.

<br>

**Currently tested and confirmed working:**

* **Soundcore Liberty 4 NC**  ✅ — Credits: abdulazizumarovich 


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


### Soundcore Liberty 4 NC

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Noise Control                 | ✅        | ✅     |
| Equalizer Preset              | ✅        | ✅     |
| Equalizer Custom              | ✅        | ✅     |
| In Ear Detection              | ✅        | ✅     |
| Auto Power Off                | ✅        | ✅     |
| Sound Leak Compensation       | ✅        | ✅     |
| Wearing Tone                  | ✅        | ✅     |
| Low Latency                   | ✅        | ✅     |
| Dual Connection (Multipoint)  | ✅        | ✅     |
| Gestures                      | ✅        | ✅     |


