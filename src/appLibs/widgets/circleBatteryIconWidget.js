'use strict';
import Cairo from 'gi://cairo';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Rsvg from 'gi://Rsvg';

import {setSourceColor, getInkBounds, addVectorImage} from './colorHelpers.js';
import {VectorImages} from './circularBatteryVectorImages.js';

export const CircleBatteryIcon = GObject.registerClass({
}, class CircleBatteryIcon extends Gtk.DrawingArea {
    _init(deviceIcon, appDir, params = {}) {
        const iconSize = 34;
        super._init({
            content_width: iconSize,
            content_height: iconSize,
            ...params,
        });

        this._iconSize = iconSize;
        this._deviceIcon = deviceIcon;
        this._appDir = appDir;
        this._scaleFactorConnected = false;
        this._fractionalScale = null;

        this._loadDeviceIcon();

        this.set_draw_func(this._draw.bind(this));
    }

    _loadDeviceIcon() {
        this._transform = {};
        this._rsvgHandle = null;

        const intendedIconSize = 15;
        const svgSize = 16;

        const iconFolder = `${this._appDir}/icons/hicolor/scalable/actions`;
        const filePath = `${iconFolder}/bbm-${this._deviceIcon}-symbolic.svg`;

        const inkRect = getInkBounds(filePath, svgSize);
        if (!inkRect)
            return;

        const scale = intendedIconSize / svgSize;

        const inkCx = inkRect.x + inkRect.width / 2;
        const inkCy = inkRect.y + inkRect.height / 2;

        const targetCx = this._iconSize / 2;
        const targetCy = this._iconSize / 2;

        const offsetX = targetCx - inkCx * scale;
        const offsetY = targetCy - inkCy * scale;

        this._transform.scale = scale;
        this._transform.offsetX = offsetX;
        this._transform.offsetY = offsetY;

        try {
            this._rsvgHandle = Rsvg.Handle.new_from_file(filePath);
        } catch {
            this._rsvgHandle = null;
        }
    }

    _assignWidgetColor() {
        const context = this.get_style_context();

        const fg = context.get_color();
        const success = context.lookup_color('success_color')[1] ?? fg;
        const error = context.lookup_color('error_color')[1] ?? fg;

        const baseLevelColor = fg.copy();
        baseLevelColor.alpha = 0.4;

        const fillLevelColor = this._percentage > 0 ? success : fg;

        return {
            foregroundColor: fg,
            baseLevelColor,
            fillLevelColor,
            disconnectedIconColor: error,
        };
    }

    _drawIcon(cr) {
        if (!this._rsvgHandle)
            return;

        cr.save();

        cr.translate(this._transform.offsetX, this._transform.offsetY);
        cr.scale(this._transform.scale, this._transform.scale);

        cr.pushGroup();
        this._rsvgHandle.render_cairo(cr);
        const pattern = cr.popGroup();

        setSourceColor(cr, this._colors.foregroundColor);
        cr.mask(pattern);

        cr.restore();
    }

    _computeFractionScale(scale) {
        if (Math.floor(this._fractionalScale) !== scale)
            return scale;

        return this._fractionalScale;
    }

    _setRadialStrokeSource(cr, cx, cy, radius, strokeWidth, scale, color) {
        let fade = 0.25 - 0.091 * Math.log(scale);
        fade = Math.max(0.15, Math.min(0.25, fade));
        const inner = radius - strokeWidth / 2;
        const outer = radius + strokeWidth / 2;

        const gradient = new Cairo.RadialGradient(cx, cy, inner, cx, cy, outer);

        gradient.addColorStopRGBA(0.0, color.red, color.green, color.blue, 0.0);
        gradient.addColorStopRGBA(fade, color.red, color.green, color.blue, color.alpha);
        gradient.addColorStopRGBA(1.0 - fade, color.red, color.green, color.blue, color.alpha);
        gradient.addColorStopRGBA(1.0, color.red, color.green, color.blue, 0.0);

        cr.setSource(gradient);
    }

    _drawCircle(cr) {
        if (!this._scaleFactorConnected) {
            this.connectObject('notify::scale-factor', () => {
                const surface = this.get_native()?.get_surface();
                log(`surface = ${surface}`);
                if (surface) {
                    this._fractionalScale = surface.get_scale();
                    this.queue_draw();
                }
            }, this);

            this._scaleFactorConnected = true;
        }

        let scale = this.get_scale_factor();
        scale = this._computeFractionScale(scale);

        const size = this._iconSize;
        const one = size / 16;
        const strokeWidth = (2.6 - 0.3 * Math.log(scale)) * one;

        const p = Math.max(0, Math.min(1, this._percentage / 100));

        const radius = (size - strokeWidth) / 2;
        const cx = size / 2;
        const cy = size / 2;

        const angleOffset = -0.5 * Math.PI;
        const endAngle = angleOffset + p * 2 * Math.PI;

        cr.save();
        cr.setLineWidth(strokeWidth);

        if (p > 0) {
            this._setRadialStrokeSource(
                cr, cx, cy, radius, strokeWidth, scale, this._colors.fillLevelColor);
            cr.arc(cx, cy, radius, angleOffset, endAngle);
            cr.stroke();
        }

        if (p < 1) {
            this._setRadialStrokeSource(
                cr, cx, cy, radius, strokeWidth, scale, this._colors.baseLevelColor);
            cr.arc(cx, cy, radius, endAngle, angleOffset + 2 * Math.PI);
            cr.stroke();
        }

        cr.restore();
    }

    _drawChargingStatusVectors(cr) {
        if (this._status !== 'disconnected' && this._status !== 'charging')
            return;

        const chargingPath = VectorImages['charging-bolt'];
        const disconnectedPath = VectorImages['disconnected'];

        if (this._status === 'disconnected') {
            cr.fill();
            addVectorImage(cr, disconnectedPath, this._colors.disconnectedIconColor);
        } else {
            addVectorImage(cr, chargingPath, this._colors.foregroundColor);
        }

        cr.fill();
    }

    _draw(area, cr) {
        if (!this._rsvgHandle)
            return;

        this._colors = this._assignWidgetColor();

        this._drawIcon(cr);
        this._drawCircle(cr);
        this._drawChargingStatusVectors(cr);
    }

    updateDeviceIcon(newIcon) {
        if (this._deviceIcon === newIcon)
            return;

        this._deviceIcon = newIcon;
        this._loadDeviceIcon();
        this.queue_draw();
    }

    updateValues(percentage, status) {
        this._status = status;
        this._percentage = percentage;
        this.queue_draw();
    }
});

