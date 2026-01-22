### BudsLink (GJS Script / Flatpak)

![Screenshot](https://raw.githubusercontent.com/maniacx/test-bluetooth-battery-meter/main/readme.png)

BudsLink is a standalone GJS-based application that provides battery monitoring and feature control for supported Bluetooth earbuds.
It can be used either as a **plain GJS script** or as a **prebuilt Flatpak package** compiled using Github Actions and distributed via GitHub Releases.

---

## Features
* Displays the battery level of the headset
* Displays individual battery levels for earbuds (left, right, and charging case), if supported
* Controls Active Noise Cancellation (ANC) and related listening modes, if supported
* Supports additional device-specific features where available
* Can be installed and run as a **Flatpak app**, or launched directly as a **GJS script**
* Supports overriding the system default accent color and dark mode settings

---

## Supported Devices
* AirPods
* Beats
* Sony earbuds and headphones

---

## Installation & Usage

BudsLink can be used in two different ways, depending on whether you want a **ready-to-use application** or a **developer/debug-friendly script**.

---

### Flatpak App (Recommended)
The Flatpak version is a fully packaged, sandboxed application built automatically via GitHub Actions and distributed through GitHub Releases.

* No manual dependency management
* Works consistently across distributions
* Best choice for end users

### Installation (Flatpak)
1. Download the `.flatpak` bundle from the **GitHub Releases** page.
2. Install it locally:

```
flatpak install --user BudsLink.flatpak
```

---

### GJS Script
The GJS script runs BudsLink directly on your system without sandboxing.

* Intended for developers and advanced users
* Easier debugging and logging
* Requires system dependencies to be installed manually

## Requirements

The following dependencies are required:

* GJS (>= 1.80.2)
* Adwaita (>= 1.5)
* GTK (>= 4.14)
* BlueZ (via D-Bus)
* pactl (PulseAudio or PipeWire with `pipewire-pulse`)

Runs the script in gjs-console

Download/Extract BudsLink repository from Github

```
gjs-console -m /path/to/BudsLink_repository/script.js
```
