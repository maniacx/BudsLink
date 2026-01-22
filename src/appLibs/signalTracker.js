import GObject from 'gi://GObject';

import {createLogger} from '../lib/devices/logger.js';

const _log = createLogger('SignalTracker');
const destroyableTypes = [];

function _hasDestroySignal(obj) {
    return destroyableTypes.some(type => obj instanceof type);
}

export const TransientSignalHolder = GObject.registerClass(
class TransientSignalHolder extends GObject.Object {
    static [GObject.signals] = {
        'destroy': {},
    };

    constructor(owner = null) {
        super();

        if (owner && _hasDestroySignal(owner))
            owner.connectObject('destroy', () => this.destroy(), this);
    }

    destroy() {
        this.emit('destroy');
    }
});
registerDestroyableType(TransientSignalHolder);

class SignalManager {
    static getDefault() {
        if (!this._singleton)
            this._singleton = new SignalManager();
        return this._singleton;
    }

    constructor() {
        this._signalTrackers = new Map();
    }

    getSignalTracker(obj) {
        let signalTracker = this._signalTrackers.get(obj);
        if (!signalTracker) {
            signalTracker = new SignalTracker(obj);
            this._signalTrackers.set(obj, signalTracker);
        }
        return signalTracker;
    }

    maybeGetSignalTracker(obj) {
        return this._signalTrackers.get(obj) ?? null;
    }

    removeSignalTracker(obj) {
        this._signalTrackers.delete(obj);
    }

    destroyAll() {
        for (const signalTracker of this._signalTrackers.values())
            signalTracker.destroy();
        this._signalTrackers.clear();
    }
}

class SignalTracker {
    constructor(owner) {
        if (_hasDestroySignal(owner))
            this._ownerDestroyId = owner.connect_after('destroy', () => this.clear());

        this._owner = owner;
        this._map = new Map();
    }

    _getSignalData(obj) {
        let data = this._map.get(obj);
        if (!data) {
            data = {ownerSignals: [], destroyId: 0};
            this._map.set(obj, data);

            if (!_hasDestroySignal(obj))
                _log.info('Warning: tracked object has no destroy():', obj);
        }
        return data;
    }

    track(obj, ...handlerIds) {
        const data = this._getSignalData(obj);
        data.ownerSignals.push(...handlerIds);

        if (_hasDestroySignal(obj) && !data.destroyId) {
            data.destroyId =
                obj.connect_after('destroy', () => this.untrack(obj));
        }
    }

    untrack(obj) {
        const data = this._map.get(obj);
        if (!data)
            return;

        for (const id of data.ownerSignals)
            this._owner.disconnect(id);

        if (data.destroyId)
            obj.disconnect(data.destroyId);

        this._map.delete(obj);

        if (this._map.size === 0)
            this._removeTracker();
    }

    clear() {
        for (const obj of [...this._map.keys()])
            this.untrack(obj);
    }

    destroy() {
        this.clear();
        this._removeTracker();
    }

    _removeTracker() {
        if (!this._owner)
            return;

        if (this._ownerDestroyId)
            this._owner.disconnect(this._ownerDestroyId);

        SignalManager.getDefault().removeSignalTracker(this._owner);
        this._owner = null;
    }
}

export function connectObject(thisObj, ...args) {
    const signalIds = [];
    while (args.length > 1) {
        const signalName = args.shift();
        const handler = args.shift();

        signalIds.push(thisObj.connect(signalName, handler));
    }

    const obj = args.at(0) ?? globalThis;
    const tracker = SignalManager.getDefault().getSignalTracker(thisObj);
    tracker.track(obj, ...signalIds);
}

export function disconnectObject(thisObj, obj) {
    SignalManager.getDefault().maybeGetSignalTracker(thisObj)?.untrack(obj);
}

export function registerDestroyableType(gtype) {
    if (!GObject.type_is_a(gtype, GObject.Object))
        throw new Error(`${gtype} is not a GObject subclass`);

    if (!GObject.signal_lookup('destroy', gtype))
        throw new Error(`${gtype} does not have a destroy signal`);

    destroyableTypes.push(gtype);
}

export function destroyAllSignals() {
    SignalManager.getDefault().destroyAll();
}

GObject.Object.prototype.connectObject =
    function (...args) {
        connectObject(this, ...args);
    };

GObject.Object.prototype.disconnectObject =
    function (obj) {
        disconnectObject(this, obj);
    };

GObject.Object.prototype.connect_object =
    GObject.Object.prototype.connectObject;

GObject.Object.prototype.disconnect_object =
    GObject.Object.prototype.disconnectObject;

