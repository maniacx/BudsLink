---
layout: default
title: Redmi / Xiaomi
parent: Devices
permalink: /redmi
---


# Redmi / Xiaomi Earbuds

* Bluetooth socket for Redmi / Xiaomi can be accessed by only one application at a time. Close other Redmi / Xiaomi companion or monitoring apps, before using BudsLink.
* Feature availability varies by model.

{: .note }
>
> Some Redmi / Xiaomi Earbuds sockets may remain unavailable to BudsLink while connected to the OEM companion app on a mobile device. Disconnect the earbuds from the mobile app before using BudsLink. 


<br>
<img src="{{ 'assets/images/redmi/redmi-main.png' | relative_url }}" width="45%">
<img src="{{ 'assets/images/redmi/redmi-configure.png' | relative_url }}" width="85%">

Most settings are self-explanatory and similar to those available on OEM app. Settings specific to BudsLink are explained below.

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Compatibility
<br>

**Help update the compatibility list**

If your device is missing from the list or you have additional compatibility information, please help improve the documentation by submitting a pull request to the [Documentation](https://github.com/maniacx/BudsLink/blob/Documentation/docs/Devices/Redmi.md) branch to update this page, or opening an issue with your device model and details of features you tested.

<br>

**New Device Configuration**

If your device configuration is missing, you can request its addition by opening an issue with screenshots of the OEM app, the output of `bluetoothctl info <device-MAC>`, and the vendor and product IDs from runtime.log. To obtain the IDs, connect your earbuds, launch BudsLink, and check the log. Alternatively, submit a pull request to the main branch with the new device configuration after successfully testing it.

<br>

**Currently tested and confirmed working:**

* **Redmi Buds 6 Play**  ✅ — Credits: drinkingoutofcups
* **Redmi Buds 8 Lite**  ✅ — Credits: myemirhan
* **Redmi Buds 5 Pro**  ✅ — Credits: LittleHaku
* **Redmi Buds 6 Pro**  ✅ — Credits: digoxi
* **Redmi Buds 8 Pro**  ✅ — Credits: sjauijn


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

### Redmi Buds 6 Play

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Equalizer Preset              | ✅        | ✅     |
| Low Latency                   | ✅        | ✅     |
| Find My buds (Ring)           | ✅        | ✅     |
| Gestures                      | ✅        | ✅     |

### Redmi Buds 8 Lite

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Noise Control                 | ✅        | ✅     |
| Equalizer Preset              | ✅        | ✅     |
| Equalizer Custom              | ✅        | ✅     |
| In Ear Detection              | ✅        | ✅     |
| Auto Answer Calls             | ✅        | ✅     |
| Adaptive Sound                | ✅        | ✅     |
| Low Latency                   | ✅        | ✅     |
| Dual Connection (Multipoint)  | ✅        | ✅     |
| Find My buds (Ring)           | ✅        | ✅     |
| Gestures                      | ✅        | ✅     |

### Redmi Buds 5 Pro

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Noise Control                 | ✅        | ✅     |
| Noise Cancellation (strength) | ✅        | ✅     |
| Transparency (modes)          | ✅        | ✅     |
| Equalizer Preset              | ✅        | ✅     |
| Equalizer Custom              | ✅        | ✅     |
| In Ear Detection              | ✅        | ✅     |
| Auto Answer Calls             | ✅        | ✅     |
| Adaptive Sound                | ✅        | ✅     |
| Low Latency                   | ✅        | ✅     |
| Dual Connection (Multipoint)  | ✅        | ✅     |
| Find My buds (Ring)           | ✅        | ✅     |
| Gestures                      | ✅        | ✅     |


### Redmi Buds 8 Pro

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ❌     |
| Noise Control                 | ✅        | ❌     |
| Noise Cancellation (strength) | ✅        | ❌     |
| Transparency (modes)          | ✅        | ❌     |
| Equalizer Preset              | ✅        | ❌     |
| Equalizer Custom              | ✅        | ❌     |
| In Ear Detection              | ✅        | ❌     |
| Auto Answer Calls             | ✅        | ❌     |
| Adaptive Sound                | ✅        | ❌     |
| Low Latency                   | ✅        | ❌     |
| Dual Connection (Multipoint)  | ✅        | ❌     |
| Find My buds (Ring)           | ✅        | ❌     |
| Gestures                      | ✅        | ❌     |
