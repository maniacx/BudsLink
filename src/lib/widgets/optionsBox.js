'use strict';

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {SliderBin} from './sliderBin.js';
import {CheckButtonBin} from './checkButtonBin.js';
import {RadioButtonBin} from './radioButtonBin.js';

export const OptionsBox = GObject.registerClass({
    GTypeName: 'BudsLink_OptionsBox',
}, class OptionsBox extends Gtk.Box {
    _init(dataHandler) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            hexpand: true,
            margin_bottom: 12,
        });

        this._dataHandler = dataHandler;
        const config = this._dataHandler.getConfig();

        this._pages = {};
        this._currentPage = null;

        const allOpts = [
            config.optionsBox1,
            config.optionsBox2,
            config.optionsBox3,
            config.optionsBox4,
        ];

        allOpts.forEach((opts, idx) => {
            if (!Array.isArray(opts) || opts.length === 0)
                return;

            const boxId = idx + 1;

            const page = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                hexpand: true,
            });

            const widgets = [];

            opts.forEach(opt => {
                let widget = null;

                if (opt === 'slider')
                    widget = new SliderBin(this._dataHandler, boxId);
                else if (opt === 'check-button')
                    widget = new CheckButtonBin(this._dataHandler, boxId);
                else if (opt === 'radio-button')
                    widget = new RadioButtonBin(this._dataHandler, boxId);

                if (widget) {
                    page.append(widget);
                    widgets.push(widget);
                }
            });

            this._pages[boxId] = {
                container: page,
                widgets,
            };
        });

        this._updateVisibleBox(this._dataHandler.props.optionsBoxVisible);

        this._dataHandlerId = this._dataHandler.connect('properties-changed', () => {
            this._updateVisibleBox(
                this._dataHandler.props.optionsBoxVisible
            );
        });
    }

    _updateVisibleBox(index) {
        if (this._currentPage) {
            this.remove(this._currentPage);
            this._currentPage = null;
        }

        const pageObj = this._pages[index];
        if (!pageObj)
            return;

        this.append(pageObj.container);
        this._currentPage = pageObj.container;
    }

    destroy() {
        if (this._dataHandler && this._dataHandlerId)
            this._dataHandler.disconnect(this._dataHandlerId);

        this._dataHandlerId = null;
        this._dataHandler = null;

        for (const page of Object.values(this._pages)) {
            for (const widget of page.widgets)
                widget.destroy?.();
        }

        this._pages = {};
        this._currentPage = null;
    }
});
