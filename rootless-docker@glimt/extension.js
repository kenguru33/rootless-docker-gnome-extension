// rootless-docker@glimt — GNOME Shell 45–48
'use strict';

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const USER_SERVICE = 'docker.service';
const POLL_SECONDS = 5;

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

function isActive()  { const r = run(['systemctl','--user','is-active', USER_SERVICE], {check:false}); return r.ok && r.out === 'active'; }
function isEnabled() { const r = run(['systemctl','--user','is-enabled', USER_SERVICE], {check:false}); return r.ok && r.out === 'enabled'; }

function startService()    { return run(['systemctl','--user','start',   USER_SERVICE]); }
function stopService()     { return run(['systemctl','--user','stop',    USER_SERVICE]); }
function restartService()  { return run(['systemctl','--user','restart', USER_SERVICE]); }
function enableService()   { return run(['systemctl','--user','enable',  USER_SERVICE]); }
function disableService()  { return run(['systemctl','--user','disable', USER_SERVICE]); }

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Rootless Docker Toggle');

        // Use the Papirus box/container icon via the generic symbolic name
        this._icon = new St.Icon({
            icon_name: 'package-x-generic-symbolic',
            style_class: 'system-status-icon'
        });
        this.add_child(this._icon);

        // Menu items
        this._startItem    = new PopupMenu.PopupMenuItem('Start Docker');
        this._stopItem     = new PopupMenu.PopupMenuItem('Stop Docker');
        this._restartItem  = new PopupMenu.PopupMenuItem('Restart Docker');
        this._autostartOn  = new PopupMenu.PopupMenuItem('Enable Autostart (after login)');
        this._autostartOff = new PopupMenu.PopupMenuItem('Disable Autostart');

        this._startItem.connect('activate',    () => { startService();    this._refreshSoon(); });
        this._stopItem.connect('activate',     () => { stopService();     this._refreshSoon(); });
        this._restartItem.connect('activate',  () => { restartService();  this._refreshSoon(1200); });
        this._autostartOn.connect('activate',  () => { enableService();   this._refreshSoon(); });
        this._autostartOff.connect('activate', () => { disableService();  this._refreshSoon(); });

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

    _refresh() {
        const active = isActive();
        const enabled = isEnabled();

        // Running: full opacity; Stopped: dim (~40%)
        this._icon.set_opacity(active ? 255 : 102);
        this._icon.queue_redraw?.();

        this._startItem.setSensitive(!active);
        this._stopItem.setSensitive(active);
        this._restartItem.setSensitive(active);
        this._autostartOn.setSensitive(!enabled);
        this._autostartOff.setSensitive(enabled);
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
        super.destroy();
    }
});

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
