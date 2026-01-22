'use strict';

export let AppId = null;
export let AppDir = null;
export let LogDir = null;
export let Settings = null;
export let Gtxt = null;
export let getCssPath = null;
export let createAboutDialog = null;


export function initContext(ctx) {
    AppId = ctx.appId;
    AppDir = ctx.appDir;
    LogDir = ctx.logDir;
    Settings = ctx.settings;
    Gtxt = ctx.gettext;
    getCssPath = ctx.getCssPath;
    createAboutDialog = ctx.createAboutDialog;
}

