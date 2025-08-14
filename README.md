# Rootless Docker GNOME Shell Extension

**Extension ID:** `rootless-docker@glimt`  
A GNOME Shell extension that adds a top‑panel indicator to monitor and control the **rootless** Docker service (`docker.service`) from your desktop.  
It works whether Docker is currently running or not — the icon simply reflects the current service state and lets you start, stop, restart, or toggle auto‑start at login.

---

## ✨ Features

- **Status indicator** — shows if the service is running or stopped.
- **Quick actions** — start, stop, or restart Docker from the panel menu.
- **Auto‑start control** — enable or disable Docker startup at login directly from the menu.
- **Auto‑refresh** — polling interval configurable in code.
- **Rootless only** — uses `systemctl --user`; no sudo required.
- **Lightweight** — no background daemons.

---

## 📦 Requirements

- GNOME Shell **45–48**
- **Rootless Docker installed for your user** (i.e., a user‑level `docker.service` exists).  
  *You do **not** need to pre‑enable or start it; the extension can start/stop it and toggle auto‑start.*
- User‑level `systemctl` support (present on most desktop Linux setups)

> If rootless Docker isn’t installed, menu actions will fail with “Unit docker.service not found.”

---

## ⚙️ Installation

You can install this extension using either the included `manage.sh` script or the `gext` CLI tool.

### Method 1 — Using `manage.sh` (recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/rootless-docker-extension.git
   cd rootless-docker-extension
2. Install and enable the extension:
   ```bash
   ./manage.sh install
   ```
3. Reload GNOME Shell:

 - X11: press Alt+F2, type r, press Enter
 - Wayland: log out and log back in

### Method 2 — Using `gext`

1. Install the `gext` tool if you haven't already:
   ```bash
   pip install gext
   ```
2. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/rootless-docker-extension.git
   ```
3. Install the extension:
   ```bash
   gext install rootless-docker@glimt
   ```