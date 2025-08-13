#!/usr/bin/env bash
set -euo pipefail

EXT_ID="rootless-docker@glimt"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)/$EXT_ID"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_ID"

die() {
  echo "❌ $*" >&2
  exit 1
}
info() { echo "• $*"; }

need_ext_dir() {
  [[ -d "$SRC_DIR" ]] || die "Extension source not found: $SRC_DIR"
  [[ -f "$SRC_DIR/metadata.json" && -f "$SRC_DIR/extension.js" ]] ||
    die "Missing metadata.json or extension.js in $SRC_DIR"
}

reload_hint() {
  if [[ "${XDG_SESSION_TYPE:-}" == "x11" ]]; then
    echo "🔄 On Xorg: press Alt+F2, type: r , then Enter to reload GNOME Shell."
  else
    echo "🔄 On Wayland: log out and back in to reload GNOME Shell."
  fi
}

case "${1:-}" in
install)
  need_ext_dir
  mkdir -p "$DEST_DIR"
  rsync -a --delete "$SRC_DIR"/ "$DEST_DIR"/
  info "Installed to: $DEST_DIR"
  gnome-extensions enable "$EXT_ID" || true
  echo "✅ Extension enabled."
  reload_hint
  ;;

enable)
  gnome-extensions enable "$EXT_ID"
  echo "✅ Extension enabled."
  reload_hint
  ;;

disable)
  gnome-extensions disable "$EXT_ID" || true
  echo "🛑 Extension disabled."
  reload_hint
  ;;

uninstall | remove)
  gnome-extensions disable "$EXT_ID" || true
  rm -rf "$DEST_DIR"
  echo "🗑 Removed: $DEST_DIR"
  reload_hint
  ;;

reinstall)
  "$0" uninstall
  "$0" install
  ;;

status)
  echo "Extension ID: $EXT_ID"
  gnome-extensions info "$EXT_ID" 2>/dev/null || echo "Not installed."
  gsettings get org.gnome.shell enabled-extensions | sed 's/^/enabled-extensions: /'
  ;;

*)
  cat <<EOF
Usage: $(basename "$0") {install|enable|disable|uninstall|reinstall|status}

Place this script next to the folder:
  ./manage.sh
  └─ $EXT_ID/
     ├─ metadata.json
     ├─ extension.js
     └─ stylesheet.css   (optional)

Examples:
  ./manage.sh install     # copy to ~/.local/... and enable
  ./manage.sh disable     # turn off (keeps files)
  ./manage.sh uninstall   # disable and remove files
  ./manage.sh status      # quick info
EOF
  exit 2
  ;;
esac
