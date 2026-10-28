import GObject from 'gi://GObject';

/**
 * DeviceInfo manages device feature values and synchronizes persistent values with GSettings.
 *
 * Features are defined as objects with these properties:
 * - key: Feature identifier.
 * - default: Default value used when no stored value exists.
 * - persist: Whether the value is saved to and restored from GSettings (default: false).
 * - relay: Whether updates emit their signal even when the value has not changed (default: false).
 *
 * Examples:
 * {key: 'fit-test-op', default: null, relay: true},
 * {key: 'wear-detection-mode', default: 0, persist: true},
 *
 * Methods:
 * - getValue(feature): Returns the current value of a feature.
 * - setValue(feature, value): Updates a value without emitting a signal.
 * - updateUI(feature, value): Updates a value and emits 'update-ui'.
 * - updateDevice(feature, value): Updates a value and emits 'update-device'.
 *
 * Updated values are saved to GSettings only if the feature is persistent.
 */

function pathToMac(path) {
    const idx = path.indexOf('dev_');
    if (idx === -1)
        return '';

    return path
        .substring(idx + 4)
        .replace(/_/g, ':');
}

export const DeviceInfo = GObject.registerClass({
    GTypeName: 'BudsLink_DeviceInfo',
    Signals: {
        'update-ui': {
            param_types: [GObject.TYPE_STRING],
        },
        'update-device': {
            param_types: [GObject.TYPE_STRING],
        },
    },
}, class DeviceInfo extends GObject.Object {
    _init({settings, settingsKey, devicePath, features}) {
        super._init();
        this.path = devicePath;
        this.mac = pathToMac(devicePath);
        this._settings = settings;
        this._settingsKey = settingsKey;
        this._devicePath = devicePath;
        this._features = new Map();

        this._syncStorage(features);
    }

    getValue(feature) {
        return this._features.get(feature)?.value;
    }

    setValue(feature, value) {
        this._updateFeature(feature, value, '');
    }

    updateUI(feature, value) {
        this._updateFeature(feature, value, 'update-ui');
    }

    updateDevice(feature, value) {
        this._updateFeature(feature, value, 'update-device');
    }

    _updateFeature(feature, value, signal) {
        const item = this._features.get(feature);

        if (!item)
            return;

        if (this._isEqual(item.value, value) && !item.relay)
            return;

        item.value = this._updateValue(item.value, value);

        this._saveToSettings();

        if (signal)
            this.emit(signal, feature);
    }

    _updateValue(currentValue, newValue) {
        if (Array.isArray(currentValue) && Array.isArray(newValue)) {
            currentValue.splice(0, currentValue.length, ...newValue);
            return currentValue;
        }

        if (this._isObject(currentValue) && this._isObject(newValue)) {
            for (const key of Object.keys(currentValue)) {
                if (!(key in newValue))
                    delete currentValue[key];
            }

            Object.assign(currentValue, newValue);

            return currentValue;
        }

        return newValue;
    }

    _isEqual(a, b) {
        if (a === b)
            return true;

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length)
                return false;

            for (let i = 0; i < a.length; i++) {
                if (!this._isEqual(a[i], b[i]))
                    return false;
            }

            return true;
        }

        if (this._isObject(a) && this._isObject(b)) {
            const aKeys = Object.keys(a);
            const bKeys = Object.keys(b);

            if (aKeys.length !== bKeys.length)
                return false;

            for (const key of aKeys) {
                if (!(key in b) || !this._isEqual(a[key], b[key]))
                    return false;
            }

            return true;
        }

        return false;
    }

    _isObject(value) {
        return value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value);
    }

    _syncStorage(features) {
        const devicesList = this._settings.get_strv(this._settingsKey).map(JSON.parse);

        const device = devicesList.find(d => d.path === this._devicePath);

        for (const feature of features) {
            const value = device && feature.key in device ? device[feature.key] : feature.default;
            const persist = feature.persist ?? false;
            const relay = feature.relay ?? false;
            this._features.set(feature.key, {value, persist, relay});
        }

        const storedDevice = {path: this._devicePath};

        for (const [key, feature] of this._features) {
            if (feature.persist)
                storedDevice[key] = feature.value;
        }

        let changed = false;

        if (device) {
            const index = devicesList.indexOf(device);

            if (JSON.stringify(device) !== JSON.stringify(storedDevice)) {
                devicesList[index] = storedDevice;
                changed = true;
            }
        } else {
            devicesList.push(storedDevice);
            changed = true;
        }

        if (changed)
            this._settings.set_strv(this._settingsKey, devicesList.map(JSON.stringify));
    }

    _saveToSettings() {
        const devicesList = this._settings.get_strv(this._settingsKey).map(JSON.parse);

        const device = devicesList.find(d => d.path === this._devicePath);

        if (!device)
            return;

        for (const [feature, item] of this._features) {
            if (item.persist)
                device[feature] = item.value;
            else
                delete device[feature];
        }

        this._settings.set_strv(this._settingsKey, devicesList.map(JSON.stringify));
    }
});
