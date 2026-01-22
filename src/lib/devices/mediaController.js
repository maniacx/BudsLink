'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {addListener, removeListener} from '../../appLibs/pactlSubscriber.js';


const MEDIA_PLAYER_PREFIX = 'org.mpris.MediaPlayer2.';
const COMP_DURATION = 350;

export const MediaController = GObject.registerClass({
    GTypeName: 'BudsLink_MediaController',
    Properties: {
        'output-is-a2dp': GObject.ParamSpec.boolean(
            'output-is-a2dp', 'output-is-a2dp', '', GObject.ParamFlags.READWRITE, false
        ),
    },
}, class MediaController extends GObject.Object {
    _init(settings, devicePath, previousOnDestroyVolume) {
        super._init();
        this._log = createLogger('MediaController');
        this._settings = settings;
        this._devicePath = devicePath;
        const indexMacAddress = devicePath.indexOf('dev_') + 4;
        this._macId = devicePath.substring(indexMacAddress);
        this._previousVolume = previousOnDestroyVolume;
        this._pendingMuteVolumeRestore = -1;

        this._isSinkDefault = false;
        this._isStreaming = false;
        this._volume = null;
        this._muted = null;

        this._asyncCancellable = new Gio.Cancellable();

        this._subscribeStdoutFd = -1;
        this._decodeTimeoutId = 0;

        this._mprisNames = [];
        this._lastPausedPlayer = null;
        this._playbackStatusChangePending = false;
        this._fadeVolumeInProgess = false;

        this._initialize();
    }

    async _runPactl(args, isJson) {
        if (this._asyncCancellable?.is_cancelled())
            return null;

        const proc = new Gio.Subprocess({
            argv: ['env', 'LANG=C', 'LC_ALL=C', ...args],
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });

        proc.init(null);

        try {
            const [, stdoutBytes, stderrBytes] = await new Promise((resolve, reject) => {
                proc.communicate_async(
                    null,
                    this._asyncCancellable,
                    (obj, res) => {
                        try {
                            resolve(obj.communicate_finish(res));
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });

            if (this._asyncCancellable?.is_cancelled())
                return null;

            if (stderrBytes?.get_size() > 0) {
                const decoder = new TextDecoder('utf-8', {fatal: false});
                const stderr = decoder.decode(stderrBytes.get_data());
                this._log.error(stderr, 'runPactl Error');
            }

            if (!stdoutBytes)
                return null;

            const decoder = new TextDecoder('utf-8', {fatal: false});
            const stdout = decoder.decode(stdoutBytes.get_data());
            
            return isJson ? JSON.parse(stdout) : stdout;
        } catch {
            return null;
        }
    }

    async _isDefaultSink() {
        const defaultSink =
            await this._runPactl(['pactl', '-f', 'json', 'get-default-sink'], false);

        return defaultSink && defaultSink.includes(this._macId);
    }

    async _getCard() {
        const cards = await this._runPactl(['pactl', '-f', 'json', 'list', 'cards'], true);
        if (!Array.isArray(cards))
            return null;

        const card = cards.find(c => c.name?.includes(this._macId));
        if (!card)
            return null;

        return card;
    }

    async _getSink() {
        const sinks = await this._runPactl(['pactl', '-f', 'json', 'list', 'sinks'], true);
        if (!Array.isArray(sinks))
            return null;

        const sink = sinks.find(s => s.name?.includes(this._macId));
        if (!sink)
            return null;

        return sink;
    }

    _isA2DP(card) {
        const profile =
            typeof card?.active_profile === 'string'
                ? card.active_profile
                : card?.active_profile?.name ?? '';

        return profile.includes('a2dp');
    }

    _getSinkVolumePercent(sink) {
        if (!sink?.volume)
            return null;

        let max = null;

        for (const ch of Object.values(sink.volume)) {
            if (!ch?.value_percent)
                continue;

            const v = parseInt(ch.value_percent, 10);
            if (Number.isNaN(v))
                continue;

            if (max === null || v > max)
                max = v;
        }

        return max;
    }

    async _setSinkVolume(volumePercent) {
        const sinkName = this._sink?.name;
        if (!sinkName)
            return;

        const volumeArg = `${Math.round(volumePercent)}%`;

        try {
            await this._runPactl(['pactl', 'set-sink-volume', sinkName, volumeArg], false);
        } catch (e) {
            this._log.error('Failed to set sink volume:', e);
        }
    }

    _isStreamingRunning(sink) {
        if (this._isSinkDefault)
            this._sink = sink;

        const volume = this._getSinkVolumePercent(sink);

        if (typeof volume === 'number' && this._volume !== volume) {
            this._volume = volume;
            if (!this._fadeVolumeInProgess && this._attenuated) {
                this._previousVolume = -1;
                this._attenuated = false;
            }
        }

        const muted = sink?.mute ?? null;
        if (this._muted !== muted) {
            this._muted = muted;
            if (muted && this._attenuated) {
                this._pendingMuteVolumeRestore = this._previousVolume;
                this._previousVolume = -1;
            }

            if (!muted && this._pendingMuteVolumeRestore !== -1) {
                this._setSinkVolume(this._pendingMuteVolumeRestore);
                this._pendingMuteVolumeRestore = -1;
            }
        }

        return sink?.state === 'RUNNING';
    }

    async _initialize() {
        try {
            const isDefault = await this._isDefaultSink();
            if (isDefault) {
                this._isSinkDefault = true;
                const card = await this._getCard();
                const sink = await this._getSink();
                if (card && sink) {
                    this.output_is_a2dp = this._isA2DP(card);
                    this._isStreaming = this._isStreamingRunning(sink);
                }
            }

            this._pactlListener = line => this._handlePactlEvent(line);
            addListener(this._pactlListener);
        } catch (e) {
            this._log.error(e);
        }
    }

    _handlePactlEvent(event) {
        if (event.includes('server')) {
            this._lastEvent = 'server';
        } else if (event.includes('card')) {
            if (this._lastEvent !== 'server')
                this._lastEvent = 'card';
        } else if (event.includes('sink')) {
            if (!this._lastEvent)
                this._lastEvent = 'sink';
        } else {
            return;
        }

        if (this._decodeTimeoutId > 0)
            return;

        this._decodeTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_LOW,
            300,
            () => {
                this._decodeTimeoutId = 0;
                const eventType = this._lastEvent;
                this._lastEvent = null;
                this._decodeEvent(eventType);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    async _decodeEvent(eventType) {
        if (eventType === 'server') {
            const isDefaultSink = await this._isDefaultSink();
            if (!isDefaultSink && this._isSinkDefault) {
                this._isSinkDefault = false;

                if (this.output_is_a2dp)
                    this.output_is_a2dp = false;

                this._isStreaming = false;
            }

            if (isDefaultSink) {
                this._isSinkDefault = true;

                const card = await this._getCard();
                const sink = await this._getSink();

                if (card && sink) {
                    const isA2dpOutput = this._isA2DP(card);
                    if (isA2dpOutput !== this.output_is_a2dp)
                        this.output_is_a2dp = isA2dpOutput;

                    this._isStreaming = this._isStreamingRunning(sink);
                }
            }
        } else if (eventType === 'card' && this._isSinkDefault) {
            const card = await this._getCard();
            const sink = await this._getSink();

            if (card && sink) {
                const isA2dpOutput = this._isA2DP(card);
                if (isA2dpOutput !== this.output_is_a2dp)
                    this.output_is_a2dp = isA2dpOutput;

                this._isStreaming = this._isStreamingRunning(sink);
            }
        } else if (eventType === 'sink' && this._isSinkDefault) {
            const sink = await this._getSink();
            this._isStreaming = this._isStreamingRunning(sink);
        }
    }

    _startFade(current, target) {
        if (this._fadeTimeoutId > 0)
            return Promise.resolve();

        this._fadeStep = 0;

        const curve = [0, 10, 25, 45, 65, 80, 92, 100];
        const steps = curve.map(p =>
            Math.round(current + (target - current) * p / 100)
        );

        let running = false;

        return new Promise(resolve => {
            this._fadeTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                125,
                () => {
                    if (running)
                        return GLib.SOURCE_CONTINUE;

                    if (this._asyncCancellable?.is_cancelled()) {
                        this._fadeTimeoutId = 0;
                        resolve();
                        return GLib.SOURCE_REMOVE;
                    }

                    const v = steps[this._fadeStep++];
                    if (v === undefined) {
                        this._fadeTimeoutId = 0;
                        resolve();
                        return GLib.SOURCE_REMOVE;
                    }

                    running = true;

                    this._setSinkVolume(v)
                    .finally(() => {
                        running = false;
                    });

                    return GLib.SOURCE_CONTINUE;
                }
            );
        });
    }

    _startFadeGuardDelay() {
        if (this._fadeVolumeTimeoutId) {
            GLib.source_remove(this._fadeVolumeTimeoutId);
            this._fadeVolumeTimeoutId = 0;
        }

        this._fadeVolumeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COMP_DURATION, () => {
            this._fadeVolumeInProgess = false;
            this._fadeVolumeTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    async _lowerVolume(caVolume) {
        if (this._attenuated)
            return;

        if (this._previousVolume >= 0)
            return;

        const currentVolume = this._volume;
        const targetVolume = Math.floor(caVolume);

        if (currentVolume <= targetVolume)
            return;

        this._attenuated = true;
        this._previousVolume = currentVolume;
        this._fadeVolumeInProgess = true;

        await this._startFade(currentVolume, targetVolume);
        this._startFadeGuardDelay();
    }

    _restoreVolumeDelayed() {
        if (!this._attenuated)
            return;

        if (this._previousVolume < 0)
            return;

        if (this._restoreVolTimeoutId)
            return;

        this._restoreVolTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            COMP_DURATION,
            () => {
                this._restoreVolume();
                this._restoreVolTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    async _restoreVolume() {
        if (!this._attenuated)
            return;

        if (this._previousVolume < 0)
            return;

        const currentVolume = this._volume;
        const targetVolume = this._previousVolume;

        this._attenuated = false;
        this._fadeVolumeInProgess = true;

        await this._startFade(currentVolume, targetVolume);
        this._startFadeGuardDelay();

        this._previousVolume = -1;
    }

    setConversationAwarenessVolume(attenuated, caVolume) {
        if (!this._isStreaming || !this.output_is_a2dp || this._muted || this._volume === null)
            return;

        if (this._fadeVolumeInProgess)
            return;

        if (attenuated)
            this._lowerVolume(caVolume);
        else
            this._restoreVolumeDelayed();
    }

    _playerPropsChanged() {
        if (this._playbackStatusChangePending) {
            this._playbackStatusChangePending = false;
            return;
        }
        const status = this._playerProxy?.get_cached_property('PlaybackStatus')?.unpack();
        if (status !== 'Paused')
            this._lastPausedPlayer = null;
    }

    async _changeStatus() {
        if (this._playerProxy) {
            if (this._requestedState === 'pause') {
                try {
                    await this._playerProxy.call(
                        'Pause',
                        null,
                        Gio.DBusCallFlags.NONE,
                        -1,
                        null
                    );
                } catch (e) {
                    this._log.error(e);
                }
                const status = this._playerProxy?.get_cached_property('PlaybackStatus')?.unpack();
                this._playbackStatusChangePending = status !== 'Paused';
                this._playerProxy.connectObject(
                    'g-properties-changed', () => this._playerPropsChanged(), this);
            } else {
                try {
                    await this._playerProxy.call(
                        'Play',
                        null,
                        Gio.DBusCallFlags.NONE,
                        -1,
                        null
                    );
                } catch {
                    console.error('Bluetooth-Battery-Meter: Error calling Mpris Play method');
                }
            }
        }
    }

    _onPlayerProxyReady() {
        const status = this._playerProxy?.get_cached_property('PlaybackStatus')?.unpack();
        if (this._requestedState === 'play' && status === 'Playing') {
            this._lastPausedPlayer = null;
            this._mprisNames = [];
        } else if (this._requestedState === 'play' && status === 'Paused') {
            this._lastPausedPlayer = null;
            this._mprisNames = [];
            this._changeStatus();
        } else if (this._requestedState === 'pause' && status === 'Playing') {
            this._mprisNames = [];
            this._lastPausedPlayer = this._busname;
            this._changeStatus();
        } else {
            this._playerProxy = null;
            this._iteratePlayers();
        }
    }

    async _initPlayerProxy(busname) {
        try {
            this._playerProxy = await Gio.DBusProxy.new_for_bus(
                Gio.BusType.SESSION,
                Gio.DBusProxyFlags.NONE,
                null,
                busname,
                '/org/mpris/MediaPlayer2',
                'org.mpris.MediaPlayer2.Player',
                null
            );
        } catch {
            console.error('Bluetooth-Battery-Meter: Failed to initialize proxy in player proxy');
            return;
        }
        this._onPlayerProxyReady();
    }

    _iteratePlayers() {
        if (this._mprisNames.length === 0)
            return;

        this._busname = this._mprisNames.shift();
        this._initPlayerProxy(this._busname);
    }

    _disconnectPlayerProxy() {
        this._playerProxy?.disconnectObject(this);
        this._playerProxy = null;
    }

    async changeActivePlayerState(requestedState) {
        if (requestedState === 'pause' && !this._isStreaming)
            return;

        this._requestedState = requestedState;
        this._disconnectPlayerProxy();

        let names = [];
        try {
            const res = await Gio.DBus.session.call(
                'org.freedesktop.DBus',
                '/org/freedesktop/DBus',
                'org.freedesktop.DBus',
                'ListNames',
                null,
                new GLib.VariantType('(as)'),
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );

            if (res)
                [names] = res.deepUnpack();
        } catch {
            console.error('Bluetooth-Battery-Meter: Error calling ListNames');
            return;
        }

        this._mprisNames = names.filter(name => name.startsWith(MEDIA_PLAYER_PREFIX));
        if (this._requestedState === 'play') {
            if (this._lastPausedPlayer && this._mprisNames.includes(this._lastPausedPlayer))
                this._initPlayerProxy(this._lastPausedPlayer);
        } else {
            this._iteratePlayers();
        }
    }

    _onDestroy() {
        if (this._previousVolume > -1) {
            const lastAttenuationInfo = {
                path: this._devicePath,
                timestamp: Date.now(),
                volume: this._previousVolume,
            };
            this._settings.set_strv('attenuated-on-destroy-info',
                [JSON.stringify(lastAttenuationInfo)]);
        }
    }

    destroy() {
        this._onDestroy?.();

        if (this._decodeTimeoutId) {
            GLib.source_remove(this._decodeTimeoutId);
            this._decodeTimeoutId = 0;
        }

        removeListener(this._pactlListener);
        this._pactlListener = null;

        this._asyncCancellable?.cancel();


        if (this._fadeVolumeTimeoutId) {
            GLib.source_remove(this._fadeVolumeTimeoutId);
            this._fadeVolumeTimeoutId = 0;
        }

        if (this._restoreVolTimeoutId) {
            GLib.source_remove(this._restoreVolTimeoutId);
            this._restoreVolTimeoutId = 0;
        }


        this._disconnectPlayerProxy();

        this._settings = null;
        this._mprisNames = [];
    }
});

