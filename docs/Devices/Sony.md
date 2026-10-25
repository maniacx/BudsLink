---
layout: default
title: Sony
parent: Devices
permalink: /sony
---


# Sony

* Bluetooth socket for Sony can be accessed by only one application at a time. Close other Sony companion or monitoring apps, such as SonyHeadphonesClient, before using BudsLink.
* Feature availability varies by model.

{: .note }
>
> Some Sony Headband/Earbuds sockets may remain unavailable to BudsLink while connected to the OEM companion app on a mobile device. Disconnect the earbuds from the mobile app before using BudsLink. 

<br>
<img src="{{ 'assets/images/sony/sony-main.png' | relative_url }}" width="45%">
<img src="{{ 'assets/images/sony/sony-configure.png' | relative_url }}" width="85%">

Most settings are self-explanatory and similar to those available on OEM app. Settings specific to BudsLink are explained below.

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Compatibility
<br>

**Help update the compatibility list**

If your device is missing from the list or you have additional compatibility information, please help improve the documentation by submitting a pull request to the [Documentation](https://github.com/maniacx/BudsLink/blob/Documentation/docs/Devices/Sony.md) branch to update this page, or opening an issue with your device model and details of features you tested.

<br>

**New Device Configuration**

If your device configuration is missing, you can request its addition by opening an issue with screenshots of the OEM app and the output of `bluetoothctl info <device-MAC>` Alternatively, submit a pull request to the main branch with the new device configuration after successful test.

<br>

**Currently tested and confirmed working:**

* **Sony WF-C510**  ✅ — Credits: G-dH
* **Sony WH-1000XM4**  ✅ — Credits: Int-Circuit
* **Sony WF-1000XM5**  ✅ — Credits: kilisei
* **Sony WH-1000XM5**  ✅ — Credits: pesader
* **Sony WH-1000XM5**  ✅ — Credits: guiand888
* **Sony WH-XB900N**  ✅ — Credits: BerenLuth
* **Sony WF-1000XM4**  ✅ — Credits: Raycx86
* **Sony WH-1000XM6**  ✅ — Credits: AquaCobalt
* **Sony LinkBuds S**  ✅ — Credits: Neikon
* **Sony WF-C700N**  ✅ — Credits: bertusw
* **Sony WF-C500** ✅ — Credits: laughingwater

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

### Sony WH-1000XM6

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ✅     |
| Ambient Mode                  | ✅             | ✅     |
| ANC Mode                      | ✅             | ✅     |
| Auto Ambient Sound Control    | ✅             | ✅     |
| Noise Control Button Mode     | ✅             | ✅     |
| Speak To Chat Config          | ✅             | Untested |
| Voice Notifications           | ✅             | Untested |
| Voice Notifications Volume    | ✅             | Untested |
| Auto Power Off When Taken Off | ✅             | ✅     |
| Pause When Taken Off          | ✅             | ✅     |
| Equalizer Ten Bands           | ✅             | ✅     |
| Listening Mode                | ✅             | ✅     |
| DSEE                          | ✅             | ✅     |

<br>
### Sony WH-1000XM5

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ✅     |
| Ambient Mode                  | ✅             | ✅     |
| ANC Mode                      | ✅             | ✅     |
| Noise Control Button Mode     | ✅             | ✅     |
| Speak To Chat Config          | ✅             | ✅     |
| Voice Notifications           | ✅             | ✅     |
| Auto Power Off When Taken Off | ✅             | ✅     |
| Pause When Taken Off          | ✅             | ✅     |
| Equalizer Six Bands           | ✅             | ✅     |
| DSEE                          | ✅             | ✅     |

<br>
### Sony WH-1000XM4

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ✅     |
| Ambient Mode                  | ✅             | ✅     |
| ANC Mode                      | ✅             | ✅     |
| Speak To Chat Config          | ✅             | ✅     |
| Voice Notifications           | ✅             | ✅     |
| Auto Power Off When Taken Off | ✅             | ✅     |
| Pause When Taken Off          | ✅             | ✅     |
| Equalizer Six Bands           | ✅             | ✅     |
| DSEE                          | ✅             | ✅     |

<br>
### Sony WH-1000XM3

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ❌     |
| Ambient Mode                  | ✅             | ❌     |
| ANC Mode                      | ✅             | ❌     |
| Voice Notifications           | ✅             | ❌     |
| Auto Power Off When Taken Off | ✅             | ❌     |
| Auto Power Off When Taken Time| ✅            | ❌     |
| Equalizer Six Bands           | ✅             | ❌     |
| DSEE                          | ✅             | ❌     |

<br>
### Sony WH-1000XM2

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ❌     |
| Ambient Mode                  | ✅             | ❌     |
| ANC Mode                      | ✅             | ❌     |
| Voice Notifications           | ✅             | ❌     |
| Equalizer Six Bands           | ✅             | ❌     |
| DSEE                          | ✅             | ❌     |

<br>
### Sony WH-CH720N

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ❌     |
| Ambient Mode                  | ✅             | ❌     |
| ANC Mode                      | ✅             | ❌     |
| Noise Control Button Mode     | ✅             | ❌     |
| Auto Power Off When Taken Off | ✅             | ❌     |
| Voice Notifications           | ✅             | ❌     |
| Equalizer Six Bands           | ✅             | ❌     |
| DSEE                          | ✅             | ❌     |

### Sony WF-1000XM6

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ❌     |
| Ambient Mode                  | ✅        | ❌     |
| Speak To Chat Config          | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |
| Auto Power Off When Taken Off | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |


### Sony WF-1000XM5

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Ambient Mode                  | ✅        | ✅     |
| Speak To Chat Config          | ✅        | ✅     |
| Voice Notifications           | ✅        | ✅     |
| Pause When Taken Off          | ✅        | ✅     |
| Auto Power Off When Taken Off | ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |
| Upscaling (DSEE)              | ✅        | ✅     |

<br>

### Sony WF-1000XM4

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Ambient Mode                  | ✅        | ✅     |
| ANC Mode                      | ✅        | ✅     |
| Button Modes Left / Right     | ✅        | ✅     |
| Pause When Taken Off          | ✅        | ✅     |
| Auto Power Off When Taken Off | ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |
| Upscaling (DSEE)              | ✅        | ✅     |

<br>

### Sony WF-1000XM3

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Ambient Mode                  | ✅        | ✅     |
| ANC Mode                      | ✅        | ✅     |
| Button Modes Left / Right     | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ✅     |
| Auto Power Off When Taken Off | ✅        | ✅     |
| Auto Power Off When Taken Time| ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |
| Upscaling (DSEE)              | ✅        | ✅     |

<br>

### Sony WF-C710N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Dual2+Case | No    |
| Ambient Mode                  | ✅        | ❌     |
| ANC Mode                      | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |

<br>

### Sony WF-C700N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Dual2+Case | No    |
| Ambient Mode                  | ✅        | ✅     |
| ANC Mode                      | ✅        | ✅     |
| Button Modes Left / Right     | ✅        | ✅     |
| Auto Power Off When Taken Off | ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |
| Upscaling (DSEE)              | ✅        | ✅     |

<br>

### Sony WF-C510

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Ambient Mode                  | ✅        | ✅     |
| Button Modes Left / Right     | ✅        | ✅     |
| Voice Notifications           | ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |
| Upscaling (DSEE)              | ✅        | ✅     |

<br>

### Sony WF-C500

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R,     | ✅     |
| Voice Notifications           | ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |
| Upscaling (DSEE)              | ✅        | ✅     |

<br>

### Sony WI-C100

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Single    | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |

<br>

### Sony WF-SP800N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ❌     |
| Ambient Mode                  | ✅        | ❌     |
| ANC Mode                      | ✅        | ❌     |
| Button Modes Left / Right     | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |
| Auto Power Off When Taken Off | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |

<br>

### Sony ULT / ULT WEAR

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Single    | ❌     |
| Ambient Mode                  | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |

<br>

### Sony WH-XB910N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Single    | ❌     |
| Ambient Mode                  | ✅        | ❌     |
| ANC Mode                      | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |
| Auto Power Off When Taken Off | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |

<br>

### Sony WH-XB900N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Single    | ✅     |
| Ambient Mode                  | ✅        | ✅     |
| ANC Mode                      | ✅        | ✅     |
| Voice Notifications           | ✅        | ✅     |
| Pause When Taken Off          | ✅        | ✅     |
| Auto Power Off When Taken Off | ✅        | ✅     |
| Auto Power Off When Taken Time| ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |

<br>

### Sony WI-SP600N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Single    | ❌     |
| Ambient Mode                  | ✅        | ❌     |
| ANC Mode                      | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |

### Sony LinkBuds

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ❌     |
| Speak To Chat Config          | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Button Modes Left / Right     | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |
| Auto Power Off When Taken Off | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |

<br>

### Sony LinkBuds S

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Ambient Mode                  | ✅        | ✅     |
| ANC Mode                      | ✅        | ✅     |
| Speak To Chat Config          | ✅        | ✅     |
| Button Modes Left / Right     | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ✅     |
| Auto Power Off When Taken Off | ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |
| Upscaling (DSEE)              | ✅        | ✅     |

<br>

