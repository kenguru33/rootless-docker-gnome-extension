// rootless-docker@glimt — GNOME Shell 45–48
'use strict';

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const USER_SERVICE = 'docker.service';
const POLL_SECONDS = 5;

/* ---------- helpers ---------- */

function run(argv, { check = true } = {}) {
    try {
        const proc = new Gio.Subprocess({
            argv,
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });
        proc.init(null);
        const [, out, err] = proc.communicate_utf8(null, null);
        const status = proc.get_exit_status();
        if (check && status !== 0)
            throw new Error(`${argv.join(' ')} failed (${status}): ${err || out}`);
        return { ok: status === 0, out: (out || '').trim(), err: (err || '').trim(), status };
    } catch (e) {
        return { ok: false, out: '', err: String(e), status: -1 };
    }
}

function runAsync(argv, { check = true } = {}) {
    return new Promise(resolve => {
        try {
            const proc = new Gio.Subprocess({
                argv,
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            proc.init(null);
            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [ok, out, err] = p.communicate_utf8_finish(res);
                    const status = p.get_exit_status();
                    if (check && status !== 0)
                        logError(new Error(`${argv.join(' ')} failed (${status}): ${err || out}`));
                    resolve({ ok: status === 0, out: (out || '').trim(), err: (err || '').trim(), status });
                } catch (e) {
                    resolve({ ok: false, out: '', err: String(e), status: -1 });
                }
            });
        } catch (e) {
            resolve({ ok: false, out: '', err: String(e), status: -1 });
        }
    });
}

function isActive()  { const r = run(['systemctl','--user','is-active',  USER_SERVICE], { check:false }); return r.ok && r.out === 'active'; }
function isEnabled() { const r = run(['systemctl','--user','is-enabled', USER_SERVICE], { check:false }); return r.ok && r.out === 'enabled'; }

const startServiceAsync   = () => runAsync(['systemctl','--user','start',   USER_SERVICE]);
const stopServiceAsync    = () => runAsync(['systemctl','--user','stop',    USER_SERVICE]);
const restartServiceAsync = () => runAsync(['systemctl','--user','restart', USER_SERVICE]);
const enableServiceAsync  = () => runAsync(['systemctl','--user','enable',  USER_SERVICE]);
const disableServiceAsync = () => runAsync(['systemctl','--user','disable', USER_SERVICE]);

/* ---------- indicator ---------- */

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Rootless Docker Toggle');

        // Icons
        this._normalIcon = new St.Icon({
            icon_name: 'package-x-generic-symbolic',
            style_class: 'system-status-icon',
        });
        this._refreshIcon = new St.Icon({
            icon_name: 'view-refresh-symbolic',
            style_class: 'system-status-icon',
        });

        // prepare rotation center for the refresh icon
        this._refreshIcon.set_pivot_point(0.5, 0.5);

        this._busy = false;
        this._spinId = 0;
        this._angle = 0;
        this._currentIcon = null;
        this._setIcon(this._normalIcon);

        // Menu items
        this._startItem    = new PopupMenu.PopupMenuItem('Start Docker');
        this._stopItem     = new PopupMenu.PopupMenuItem('Stop Docker');
        this._restartItem  = new PopupMenu.PopupMenuItem('Restart Docker');
        this._autostartOn  = new PopupMenu.PopupMenuItem('Enable Autostart (after login)');
        this._autostartOff = new PopupMenu.PopupMenuItem('Disable Autostart');

        this._startItem.connect('activate',    () => this._doAction(startServiceAsync));
        this._stopItem.connect('activate',     () => this._doAction(stopServiceAsync));
        this._restartItem.connect('activate',  () => this._doAction(restartServiceAsync));
        this._autostartOn.connect('activate',  () => this._doAction(enableServiceAsync));
        this._autostartOff.connect('activate', () => this._doAction(disableServiceAsync));

        this.menu.addMenuItem(this._startItem);
        this.menu.addMenuItem(this._stopItem);
        this.menu.addMenuItem(this._restartItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this._autostartOn);
        this.menu.addMenuItem(this._autostartOff);

        // Initial paint + polling
        this._refresh();
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _setIcon(icon) {
        if (this._currentIcon)
            this.remove_child(this._currentIcon);
        this.add_child(icon);
        this._currentIcon = icon;
    }

    _startSpin() {
        if (this._spinId)
            return;
        // ~60 FPS: advance ~6 degrees per tick -> full turn ~1s
        this._spinId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            this._angle = (this._angle + 6) % 360;
            this._refreshIcon.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, this._angle);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopSpin() {
        if (this._spinId) {
            GLib.source_remove(this._spinId);
            this._spinId = 0;
        }
        this._angle = 0;
        this._refreshIcon.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, 0);
    }

    _setBusy(busy) {
        if (this._busy === busy) return;
        this._busy = busy;

        // Disable menu items while busy
        [this._startItem, this._stopItem, this._restartItem, this._autostartOn, this._autostartOff]
            .forEach(i => i.setSensitive(!busy));

        // Swap icon and animate
        if (busy) {
            this._setIcon(this._refreshIcon);
            this._startSpin();
        } else {
            this._stopSpin();
            this._setIcon(this._normalIcon);
        }
    }

    _doAction(asyncFn) {
        // Close immediately so UI is responsive
        this.menu.close(true);

        this._setBusy(true);
        asyncFn()
            .then(() => this._refreshSoon(150))
            .catch(e => logError(e))
            .finally(() => this._setBusy(false));
    }

    _refresh() {
        const active = isActive();
        const enabled = isEnabled();

        // Running: full opacity; Stopped: dim (~40%)
        this._normalIcon.set_opacity(active ? 255 : 102);
        this._normalIcon.queue_redraw?.();

        if (!this._busy) {
            this._startItem.setSensitive(!active);
            this._stopItem.setSensitive(active);
            this._restartItem.setSensitive(active);
            this._autostartOn.setSensitive(!enabled);
            this._autostartOff.setSensitive(enabled);
        }
    }

    _refreshSoon(delayMs = 600) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = 0;
        }
        this._stopSpin();
        super.destroy();
    }
});

/* ---------- extension ---------- */

export default class RootlessDockerExtension extends Extension {
    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea('rootless-docker-toggle', this._indicator, 1, 'right');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
