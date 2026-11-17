'use strict';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'gettext';

export const EarTipStatus = {
    NotInitialized: 0,
    GoodSeal: 1,
    BadSeal: 2,
    Error: 3,
};

const EarTipFitTestDialog = GObject.registerClass({
    GTypeName: 'EarTipTestDialog',
}, class EarTipFitTestDialog extends Adw.Dialog {
    _init(parentRow, deviceIcon, noCancelButton) {
        super._init({
            title: _('Earbud Fit Test'),
            content_width: 300,
        });

        this._deviceIcon = deviceIcon;
        this._noCancelButton = noCancelButton;

        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(new Adw.HeaderBar());

        const page = new Adw.PreferencesPage();
        const earTipStatusGrp = new Adw.PreferencesGroup();
        const row = new Adw.ActionRow();

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            hexpand: true,
            margin_top: 18,
            margin_bottom: 18,
            margin_start: 18,
            margin_end: 18,
            height_request: 240,
        });

        row.set_child(box);
        earTipStatusGrp.add(row);
        page.add(earTipStatusGrp);
        toolbarView.set_content(page);
        this.set_child(toolbarView);

        this._earTipTitle = new Gtk.Label({
            css_classes: ['title-2'],
            halign: Gtk.Align.CENTER,
            wrap: true,
            hexpand: true,
        });
        box.append(this._earTipTitle);

        this._earTipSubtitle = new Gtk.Label({
            css_classes: ['caption'],
            halign: Gtk.Align.CENTER,
            wrap: true,
            hexpand: true,
        });
        box.append(this._earTipSubtitle);

        const earbudsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: true,
            spacing: 12,
            margin_top: 24,
            hexpand: true,
        });

        const leftCell = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        this._leftDeviceIcon = new Gtk.Image({
            icon_name: `bbm-${deviceIcon}-left-symbolic`,
            pixel_size: 64,
        });

        this._leftIcon = new Gtk.Image({
            icon_name: 'bbm-left-symbolic',
            pixel_size: 16,
        });

        this._leftStatusLabel = new Gtk.Label({
            label: _('Good Fit'),
            css_classes: ['caption-heading'],
            wrap: true,
        });


        leftCell.append(this._leftDeviceIcon);
        leftCell.append(this._leftIcon);
        leftCell.append(this._leftStatusLabel);

        const rightCell = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        this._rightDeviceIcon = new Gtk.Image({
            icon_name: `bbm-${deviceIcon}-right-symbolic`,
            pixel_size: 64,
        });

        this._rightIcon = new Gtk.Image({
            icon_name: 'bbm-right-symbolic',
            pixel_size: 16,
        });

        this._rightStatusLabel = new Gtk.Label({
            label: _('Right'),
            css_classes: ['caption-heading'],
            wrap: true,
        });

        rightCell.append(this._rightDeviceIcon);
        rightCell.append(this._rightIcon);
        rightCell.append(this._rightStatusLabel);
        earbudsBox.append(leftCell);
        earbudsBox.append(rightCell);
        box.append(earbudsBox);

        const spinner = new Adw.Spinner({
            width_request: 16,
            height_request: 16,
        });

        const inProgressLabel = new Gtk.Label({
            label: _('Test in progress…'),
        });

        this._testingProgressContent = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            margin_top: 16,
            halign: Gtk.Align.CENTER,
            visible: false,
        });

        this._testingProgressContent.append(spinner);
        this._testingProgressContent.append(inProgressLabel);

        box.append(this._testingProgressContent);

        const buttonGrp = new Adw.PreferencesGroup();
        this._button = new Adw.ButtonRow({title: _('Run test')});
        this._button.add_css_class('suggested-action');

        this._button.connect('activated', () => {
            if (this.testingInProgress) {
                parentRow.emit('cancel-test');
                this.updateStatus(EarTipStatus.NotInitialized, EarTipStatus.NotInitialized);
                return;
            }

            this.updateStatus(EarTipStatus.NotInitialized, EarTipStatus.NotInitialized);
            this.testingInProgress = true;
            this._setTestingLabels();
            this._updateButtonRow();
            parentRow.emit('start-test');
        });

        buttonGrp.add(this._button);
        page.add(buttonGrp);

        this.updateStatus(EarTipStatus.NotInitialized, EarTipStatus.NotInitialized);
    }

    _setTestingLabels() {
        this._earTipTitle.label = _('Please Wait…');
        this._earTipSubtitle.label = _(
            'Keep your earbuds in your ears and wait for the fit test to complete.'
        );
    }

    _updateButtonRow() {
        this._button.remove_css_class('suggested-action');
        this._button.remove_css_class('destructive-action');

        if (this.testingInProgress) {
            this._leftStatusLabel.visible = false;
            this._rightStatusLabel.visible = false;
            this._testingProgressContent.visible = true;

            if (this._noCancelButton) {
                this._button.sensitive = false;
            } else {
                this._button.title = _('Cancel');
                this._button.add_css_class('destructive-action');
            }
        } else {
            this._leftStatusLabel.visible = true;
            this._rightStatusLabel.visible = true;
            this._testingProgressContent.visible = false;

            if (this._noCancelButton) {
                this._button.add_css_class('suggested-action');
                this._button.sensitive = true;
            } else {
                this._button.title = _('Run test');
                this._button.add_css_class('suggested-action');
            }
        }
    }

    updateStatus(left, right) {
        this.testingInProgress = false;
        this._updateButtonRow();

        const updateSide = (icon, label, status) => {
            icon.remove_css_class('success');
            icon.remove_css_class('warning');
            icon.remove_css_class('error');

            label.remove_css_class('success');
            label.remove_css_class('warning');
            label.remove_css_class('error');

            switch (status) {
                case EarTipStatus.GoodSeal:
                    icon.add_css_class('success');
                    label.add_css_class('success');
                    label.label = _('Good Seal');
                    break;

                case EarTipStatus.BadSeal:
                    icon.add_css_class('warning');
                    label.add_css_class('warning');
                    label.label = _('Poor Seal');
                    break;

                case EarTipStatus.Error:
                    icon.add_css_class('error');
                    label.add_css_class('error');
                    label.label = _('Test Failed');
                    break;

                case EarTipStatus.NotInitialized:
                default:
                    label.label = '';
                    break;
            }
        };

        updateSide(this._leftIcon, this._leftStatusLabel, left, 'left');
        updateSide(this._rightIcon, this._rightStatusLabel, right, 'right');

        /* eslint-disable max-len */
        if (left === EarTipStatus.NotInitialized && right === EarTipStatus.NotInitialized) {
            this._earTipTitle.label = _('Ear Tip Fit Test');
            this._earTipSubtitle.label = _(
                'Place earbuds in both ears so they are comfortable and secure, then Run Test'
            );
        } else if (left === EarTipStatus.GoodSeal && right === EarTipStatus.GoodSeal) {
            this._earTipTitle.label = _('Ear Tip Fit Test Results');
            this._earTipSubtitle.label = _('Your earbuds have a good seal.');
        } else if (left === EarTipStatus.BadSeal &&
               right === EarTipStatus.GoodSeal) {
            this._earTipTitle.label = _('Poor Seal');
            this._earTipSubtitle.label = _(
                'Adjust the position of the left earbud or change the ear tip size, then Run Test again.'
            );
        } else if (left === EarTipStatus.GoodSeal && right === EarTipStatus.BadSeal) {
            this._earTipTitle.label = _('Ear Tip Fit Test Results');
            this._earTipSubtitle.label = _(
                'Adjust the position of the right earbud or change the ear tip size, then Run Test again.'
            );
        } else if (left === EarTipStatus.BadSeal && right === EarTipStatus.BadSeal) {
            this._earTipTitle.label = _('Ear Tip Fit Test Results');
            this._earTipSubtitle.label = _(
                'Adjust the position of both earbuds or change the ear tip size, then Run Test again.'
            );
        } else if (left === EarTipStatus.Error && right === EarTipStatus.Error) {
            this._earTipTitle.label = _('Ear Tip Fit Test Results');
            this._earTipSubtitle.label = _(
                'The fit test could not be completed. Make sure your earbuds are worn correctly, then Run Test again.'
            );
        }
        /* eslint-enable max-len */
    }

    updateIcon(deviceIcon) {
        if (this._deviceIcon === deviceIcon)
            return;

        this._deviceIcon = deviceIcon;
        this._leftDeviceIcon?.set_from_icon_name(`bbm-${deviceIcon}-left-symbolic`);
        this._rightDeviceIcon?.set_from_icon_name(`bbm-${deviceIcon}-right-symbolic`);
    }
});


export const EarTipFitTestRow = GObject.registerClass({
    GTypeName: 'EarTipTestRow',
    Signals: {
        'start-test': {},
        'cancel-test': {},
    },
}, class EarTipFitTestRow extends Adw.ActionRow {
    _init(window, icon, noCancelButton = false) {
        super._init({
            title: _('Earbud Fit Test'),
            subtitle: _(
                'Check acoustic seal for optimal sound quality and noise cancellation'
            ),
        });

        this._dialog = new EarTipFitTestDialog(this, icon, noCancelButton);

        const testButton = new Gtk.Button({
            label: _('Test'),
            valign: Gtk.Align.CENTER,
        });
        testButton.add_css_class('suggested-action');

        testButton.connect('clicked', () => {
            if (!this._dialog.testingInProgress) {
                this._dialog.updateStatus(EarTipStatus.NotInitialized,
                    EarTipStatus.NotInitialized);
            }

            this._dialog.present(window);
        });

        this.add_suffix(testButton);
    }

    updateStatus(left, right) {
        this._dialog?.updateStatus(left, right);
    }

    updateIcon(deviceIcon) {
        this._dialog?.updateIcon(deviceIcon);
    }

    isTestInProgress() {
        return this._dialog?.testingInProgress ?? false;
    }
});

