# Contribution and Maintenance Policy

Contributions that add or modify device support are welcome. Contributors are expected to test their changes on the relevant hardware and help maintain their contributions, including fixing regressions caused by future changes where reasonably possible.

This is a volunteer-maintained project and does not guarantee continued functionality for every supported device or feature.

## Contribution Requirements

Contributions adding or modifying device functionality should include, where applicable:

* **BudsLink runtime log** showing the relevant functionality or issue.
* **Screenshots from the OEM application** demonstrating the feature or behavior being implemented.
* **Bluetooth device information** using:

```bash
  bluetoothctl info <device-address>
```
* Sufficient information to reproduce and verify the functionality on the relevant hardware.

These requirements help reviewers understand, verify, and maintain device functionality.

## Reverse Engineering

This project respects the intellectual-property rights of OEMs and other third parties. Contributions must not contain proprietary, confidential, leaked, or unauthorized material from OEM applications..

Contributors are responsible for ensuring that their contributions comply with applicable laws, licenses, copyrights, and other intellectual-property rights. Contributions containing questionable or unauthorized materials may be rejected.
