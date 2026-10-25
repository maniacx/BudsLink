---
layout: default
title: AirPods / Beats
parent: Devices
permalink: /airpods
---

# AirPods / Beats

* Bluetooth socket for Airpods/Beats protocol can be accessed by only one application at a time. Close other AirPods companion or monitoring apps, such as MagicPods or LibrePods, before using BudsLink.
* The case battery is displayed only when the AirPods report it, typically while the case is charging or at least one earbud is inside.
* ANC controls are shown only when at least one earbud is worn.
* Conversation Awareness controls are shown only when both earbuds are worn.
* Feature availability varies by model.


<br>
<img src="{{ 'assets/images/airpods/airpods-main.png' | relative_url }}" width="45%">
<img src="{{ 'assets/images/airpods/airpods-configure.png' | relative_url }}" width="85%">

Most settings are self-explanatory and similar to those available on iPhone, iPad, and Mac. Settings specific to BudsLink are explained below.

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Pause when device is not worn

When enabled, media playback automatically pauses when the earbuds are removed and resumes based on the selected behavior:

* Default behavior: Uses the device’s standard in-ear detection for pausing and resuming.
* Resume with both earbuds: Playback resumes only when both earbuds are worn.
* Resume with any earbud: Playback resumes as soon as at least one earbud is worn.

## Conversation awareness volume Limit

If supported by device, this setting limits media volume during active conversations to enhance awareness of your surroundings and reduce distractions.

* When conversation mode is triggered (based on supported device capabilities), the system automatically reduces media volume to a user-defined percentage of the maximum volume.
* This helps ensure you can still hear important external sounds while music or other media is playing.
* You can set the volume limit to any value between 0 and 50.
* Values are interpreted as a percentage of the device's maximum volume.
* Note: If the current playback volume is already below the specified limit, no adjustment will be made.

## Compatibility
<br>

**Help update the compatibility list**

If your device is missing from the list or you have additional compatibility information, please help improve the documentation by submitting a pull request to the [Documentation](https://github.com/maniacx/BudsLink/blob/Documentation/docs/Devices/AirPods.md) branch to update this page, or opening an issue with your device model and details of features you tested.

<br>

**New Device Configuration**

If your device configuration is missing, you can request its addition by opening an issue with screenshots of the OEM app and the output of `bluetoothctl info <device-MAC>` Alternatively, submit a pull request to the main branch with the new device configuration after successful test.

<br>

**Currently tested and confirmed working:**

* **AirPods 1st Gen** ✅ — Credits: Toxblh
* **AirPods Pro 1st Gen** ✅ — Credits: Toxblh, hazzac181
* **AirPods Pro 2nd Gen** ✅ — Credits: MobileAZN
* **AirPods 4th Gen with ANC** ✅ — Credits: Cameo007
* **AirPods Pro 2 USB-C** ✅ — Credits: maniacx
* **AirPods Max  USB-C** ✅ — Credits: GovanifY
* **Beats Powerbeats Fit** ✅ — Credits: schlagmichdoch

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

### AirPods 1st Gen

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2002           | ✅     |
| Battery Level                 | L, R, Case     | ✅     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### AirPods 2nd Gen

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 200F           | ❌     |
| Battery Level                 | L, R, Case     | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### AirPods 3rd Gen

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2013           | ❌     |
| Battery Level                 | L, R, Case     | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### AirPods 4th Gen

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2019           | ❌     |
| Battery Level                 | L, R, Case     | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### AirPods 4th Gen with ANC

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 201B           | ✅     |
| Battery Level                 | L, R, Case     | ✅     |
| ANC                           | ✅             | ✅     |
| Adaptive                      | ✅             | ✅     |
| Ambient Sound Customization   | ✅             | ✅     |
| Conversation Awareness        | ✅             | ✅     |
| In‑Ear Play/Pause             | ✅             | ✅     |

<br>
### AirPods Pro 1st Gen

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 200E           | ✅     |
| Battery Level                 | L, R, Case     | ✅     |
| ANC                           | ✅             | ✅     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### AirPods Pro 2nd Gen

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2014           | ✅     |
| Battery Level                 | L, R, Case     | ✅     |
| ANC                           | ✅             | ✅     |
| Adaptive                      | ✅             | ✅     |
| Ambient Sound Customization   | ✅             | ✅     |
| Conversation Awareness        | ✅             | ✅     |
| In‑Ear Play/Pause             | ✅             | ✅     |

<br>
### AirPods Pro 2 USB‑C

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2024           | ✅     |
| Battery Level                 | L, R, Case     | ✅     |
| ANC                           | ✅             | ✅     |
| Adaptive                      | ✅             | ✅     |
| Ambient Sound Customization   | ✅             | ✅     |
| Conversation Awareness        | ✅             | ✅     |
| In‑Ear Play/Pause             | ✅             | ✅     |

<br>
### AirPods Max

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 200A           | ❌     |
| Battery Level                 | Single         | ❌     |
| ANC                           | ✅             | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### AirPods Max USB‑C

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 201F           | ✅     |
| Battery Level                 | Single         | ✅     |
| ANC                           | ✅             | ✅     |
| In‑Ear Play/Pause             | ✅             | ✅     |

<br>
### AirPods Max 2

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 202D           | ❌     |
| Battery Level                 | Single         | ❌     |
| ANC                           | ✅             | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats Fit Pro

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2012           | ❌     |
| Battery Level                 | L, R, Case     | ❌     |
| ANC                           | ✅             | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats X

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2005           | ❌     |
| Battery Level                 | Single         | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats Flex

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2010           | ❌     |
| Battery Level                 | Single         | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats Solo 3

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2006           | ❌     |
| Battery Level                 | Single         | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats Solo 4

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2025           | ❌     |
| Battery Level                 | Single         | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Powerbeats 3

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2003           | ❌     |
| Battery Level                 | Single         | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats Studio 3

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2009           | ❌     |
| Battery Level                 | Single         | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Powerbeats Pro

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 200B           | ❌     |
| Battery Level                 | L, R, Case     | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats Fit Pro

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 202F           | ✅     |
| Battery Level                 | L, R, Case     | ✅     |
| ANC                           | ✅             | ✅     |
| In‑Ear Play/Pause             | ✅             | ✅     |

<br>
### Powerbeats 4

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 200D           | ❌     |
| Battery Level                 | Single         | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats Solo Pro

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 200C           | ❌     |
| Battery Level                 | Single         | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats Studio Pro

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2017           | ❌     |
| Battery Level                 | Single         | ❌     |
| ANC                           | ✅             | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats Studio Buds

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2011           | ❌     |
| Battery Level                 | L, R, Case     | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |

<br>
### Beats Studio Buds Plus

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Modalias                      | 2016           | ❌     |
| Battery Level                 | L, R, Case     | ❌     |
| In‑Ear Play/Pause             | ✅             | ❌     |


