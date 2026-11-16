# Dueproof desktop (Tauri 2)

The desktop app for Windows, macOS and Linux. v0.1 ships **Connect mode**: a
small native shell around your Dueproof server (self-hosted or hosted).
**Local mode** (everything on one computer, no server) is a spike behind a
build flag. User guide: `docs/desktop.md`.

```
apps/desktop
├── ui/                 The app's own screens (setup, "Change server"): HTML + TS + tokens CSS
├── scripts/            local-spike.mjs (Local-mode measurements)
└── src-tauri/
    ├── tauri.conf.json  CSP, bundle targets, deep-link scheme, updater (off)
    ├── capabilities/    setup.json: commands for the local screens only
    ├── linux/           .desktop template (passes deep links as %u)
    └── src/
        ├── origin.rs    URL validation, origin pinning, navigation and deep-link rules (tested)
        ├── health.rs    GET /api/health before a server is pinned (tested)
        ├── bridge.rs/.js The script injected into the server's pages; notify() checks (tested)
        ├── commands.rs  get_settings, check_server, connect, set_autostart, set_updates, notify
        ├── window.rs    Main window, navigation handler, new windows, downloads (tested)
        ├── menu.rs      Window menu and tray
        ├── settings.rs  settings.json in the OS config folder (tested)
        ├── updates.rs   Signed updater, off unless configured and turned on
        └── local.rs     Local mode sidecars (feature `local-mode`, tested)
```

## Commands

```sh
pnpm --filter @dueproof/desktop dev          # tauri dev (setup screen on Vite at 127.0.0.1:1420)
pnpm --filter @dueproof/desktop build        # tauri build: every bundle for this OS
pnpm --filter @dueproof/desktop build:linux  # .deb + AppImage only
pnpm --filter @dueproof/desktop test         # Vitest: the setup screen
pnpm --filter @dueproof/desktop test:rust    # cargo test: origin pinning, health, bridge, settings…
pnpm --filter @dueproof/desktop check:rust   # cargo check
pnpm --filter @dueproof/desktop typecheck
```

To try Connect mode against a local server: build and start the app
(`pnpm --filter @dueproof/app build`, then start it with
`DUEPROOF_EDITION=desktop` so the fake engine is allowed in production, plus
`AUTH_SECRET`, `APP_URL=http://localhost:3000`, a `PGLITE_DATA_DIR`), run the
desktop app and enter `localhost:3000`.

## How Connect mode works

1. **First launch** shows the setup screen (`ui/`). The address is checked in
   Rust (`origin.rs`): `https://` anywhere, `http://` only for this computer
   (`localhost`, `127.x`); no user name or password, no path, no IPv6
   literal. With no scheme typed, `https://` is assumed (`http://` for
   localhost). The shell then calls `GET /api/health` itself (no CORS, no
   cookies, no redirects followed) and only pins a server that answers like
   Dueproof. The origin is saved in `settings.json` in the OS config folder
   (`app.dueproof.desktop`).
2. **The main window loads that origin only.** `on_navigation` allows the
   pinned origin (and its `blob:` URLs); other `http(s)`, `mailto:` and
   `tel:` links open in the system's apps; `file:`, `data:`, `javascript:`
   and unknown schemes are refused. The app's own screens load only when the
   shell asks for them (first launch, "Change server"), so the server can't
   navigate to them. `window.open` to the same origin opens in the window;
   anything else goes to the system browser. Downloads go to the Downloads
   folder under a cleaned, unique name.
3. **IPC is least privilege.** The local screens get five app commands
   (`capabilities/setup.json`), and each command also checks that its caller
   is a local page. The server's origin gets exactly one command, `notify`,
   through a capability added at run time for that origin
   (`Manager::add_capability` with a `remote` URL pattern, scoped to the
   `main` window): this answers 05 §7's "M0 check" (Tauri can scope commands
   to an origin chosen at run time). No plugin command (opener, notification,
   dialog, updater, shell) is reachable from any page. Changing to a
   different server restarts the app, so the capability and the injected
   bridge always match the pinned origin. There is no shell plugin at all.
4. **CSP** for the local screens: `default-src 'self'; script-src 'self';
   style-src 'self'; connect-src ipc: http://ipc.localhost; object-src
   'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
   The server's pages keep the server's own CSP.

Verified headless on Linux (Xvfb, WebKitGTK 2.x) against a probe page on the
pinned origin: `notify` allowed; `get_settings`, `connect`, `set_updates`,
`plugin:opener|open_url`, `plugin:notification|notify` all denied by the ACL;
navigation to another site and to `tauri://localhost` refused; both
notifications seen on D-Bus (`org.freedesktop.Notifications.Notify`).

### Native extras

| Extra | Design |
|---|---|
| **OS notifications** | The webviews have no Web Push (no service-worker push in WKWebView, WebKitGTK or an embedded WebView2). The injected bridge replaces `window.Notification` and adds `window.dueproofDesktop.notify(title, body)`; both call `notify`, which cleans and caps the text (120/300 characters), allows 10 a minute, and never logs it. **The web app doesn't raise in-page notifications yet** (it uses Web Push through its service worker), so deadline alerts in the desktop app need a small apps/app change: when `window.dueproofDesktop` exists, show the alert with `new Notification(…)` (from the events stream or a poll). |
| **File and folder drop** | The simplest safe design: the shell's own drag-and-drop handler is off, so drops reach the page as ordinary HTML5 drops and the web app's drop zones (FileDropZone) handle them, folders included through `webkitGetAsEntry`. No file path ever crosses into the shell or IPC. A drop outside any drop zone is caught by the bridge (instead of the webview opening the file) and sends the person to `/inbox?upload=1`. "Upload documents…" (menu, tray, ⌘/Ctrl+U) opens the same screen. |
| **Tray** | Open Dueproof · Upload documents… · Start at login (check) · Change server… · Quit. Closing the window hides it to the tray, so the page keeps running and notifications still arrive; a second launch shows it again. Where the desktop has no tray (GNOME without the AppIndicator extension), closing quits. |
| **Deep links** | `dueproof://open?path=/cases/42`. The path must start with one `/`; no `//`, backslashes or control characters; the result must stay on the pinned origin. Anything else is ignored. On Windows and Linux a link starts a second process, which the single-instance plugin hands to the running one. Verified on Linux. |
| **Start at login** | tauri-plugin-autostart (Launch Agent on macOS, registry on Windows, XDG autostart on Linux), started with `--autostart` so the window stays hidden in the tray. |
| **Change server** | Menu and tray. Opens the setup screen in the main window; Cancel reconnects to the current server. |
| **Title bar** | macOS: transparent title bar with hidden title; the traffic lights sit on the page's background and the page keeps its full height. Windows and Linux: native decorations (Windows snap layouts work as usual). A full-bleed macOS title bar would need the web app to pad for `html[data-desktop="macos"]` (the bridge sets it). |
| **Menus** | macOS: app menu (About, Change server…, Services, Hide, Quit), File, Edit (needed for ⌘C/⌘V), View, Window, Help. Windows/Linux: File, Edit, View. Shortcuts use ⌘ on macOS, Ctrl elsewhere. |

## Updates (off by default)

The updater plugin is installed with `requireSignedVersion: true` (the
signed version must match the announced one: no downgrade by replay), but
this build has **no public key and no endpoint**, so it never looks. When a
release build has both, it checks once at start-up only if the person turned
"Check for updates" on in the setup screen, and installs only after they say
yes. An administrator can lock it off with `"updatesLocked": true` in
`settings.json`.

Making the signing key (once, on an offline machine; never commit it):

```sh
pnpm --filter @dueproof/desktop tauri signer generate -w ~/.tauri/dueproof-updater.key
# prints the public key; keep the private key and its password offline (05 §7)
```

Release builds then pass a config overlay instead of editing the committed
config:

```jsonc
// src-tauri/tauri.release.conf.json (not committed with real values)
{
  "bundle": { "createUpdaterArtifacts": true },
  "plugins": {
    "updater": {
      "pubkey": "<contents of dueproof-updater.key.pub>",
      "endpoints": ["https://github.com/<owner>/dueproof/releases/latest/download/latest.json"]
    }
  }
}
```

```sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/dueproof-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=…
pnpm --filter @dueproof/desktop tauri build --config src-tauri/tauri.release.conf.json
```

Each bundle gets a `.sig`; `latest.json` lists version, notes, and per
platform the URL and signature.

## Building on each OS

All need Node 22, pnpm 10 and Rust ≥ 1.90 (`rustup`). Run `pnpm install` at
the repository root first.

**Linux** (Ubuntu 24.04 / Debian 12):

```sh
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
pnpm --filter @dueproof/desktop build:linux   # .deb and .AppImage
# Fedora: webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel; add --bundles rpm
```

**Windows 10/11:** Visual Studio Build Tools with "Desktop development with
C++", and WebView2 (built into Windows 11; the installer downloads it where
missing). `pnpm --filter @dueproof/desktop build` makes an NSIS installer
(per-user, no admin rights) and an MSI.

**macOS 12+:** Xcode Command Line Tools (`xcode-select --install`).
`pnpm --filter @dueproof/desktop build` makes `Dueproof.app` and a `.dmg`.
For both chips: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
then `tauri build --target universal-apple-darwin`.

### Measured here (Linux x86_64, release, `opt-level = "s"`, LTO)

| | Size |
|---|---|
| Binary | 9.2 MB |
| `.deb` | 3.9 MB (9.0 MB installed; depends on the system WebKitGTK) |
| `.AppImage` | 79 MB (bundles WebKitGTK and GTK) |
| Start to the first request for the server page | 0.26–0.31 s (Xvfb, software rendering) |

Windows and macOS builds were not made here (no hosts); expect a binary of
about the same size (WebView2/WKWebView come with the OS).

## Signing (unsigned dev builds for now)

The owner has no company yet, so v0.1 builds are **unsigned**: Windows shows
SmartScreen's "Windows protected your PC" (More info → Run anyway) and macOS
needs right-click → Open, or `xattr -dr com.apple.quarantine Dueproof.app`.

**Windows (Authenticode).** Options for an individual: an OV code-signing
certificate issued in your own name (identity checked by the CA; since 2023
the key must live on a hardware token or a cloud HSM), or Microsoft's
cloud signing service (Trusted Signing) where it accepts individuals in your
region. EV certificates need an
organisation. Then either set the certificate in the config:

```jsonc
"bundle": { "windows": { "certificateThumbprint": "<SHA-1 thumbprint>",
  "digestAlgorithm": "sha256", "timestampUrl": "http://timestamp.digicert.com" } }
```

or, for a cloud HSM, `"signCommand": "…signtool or relic command… %1"`.
SmartScreen trust builds with downloads over time even when signed with OV.

**macOS (Developer ID + notarisation).** Join the Apple Developer Program as
an individual (no company needed), create a "Developer ID Application"
certificate and an App Store Connect API key, then build with:

```sh
export APPLE_CERTIFICATE="$(base64 -i DeveloperID.p12)"  APPLE_CERTIFICATE_PASSWORD=…
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_API_ISSUER=…  APPLE_API_KEY=…  APPLE_API_KEY_PATH=~/private_keys/AuthKey_….p8
pnpm --filter @dueproof/desktop build    # signs with the hardened runtime, notarises, staples
```

**Linux.** No platform signing; publish SHA-256 sums (and optionally a GPG
signature) next to the files. AppImages can embed a signature with
`appimagetool --sign`.

## Local mode (spike)

Build with the cargo feature and start with `DUEPROOF_LOCAL=1`:

```sh
pnpm --filter @dueproof/app build
node apps/desktop/scripts/local-spike.mjs --engine-python /path/to/engine-venv/bin/python
cd apps/desktop/src-tauri
cargo build --release --features local-mode,tauri/custom-protocol
ln -s ../../../local-runtime target/release/local-runtime   # where resource_dir() points in a raw build
DUEPROOF_LOCAL=1 target/release/dueproof-desktop
```

What it does (`src/local.rs`): picks two free ports on 127.0.0.1, makes a
fresh 32-byte launch secret, starts the engine (`uvicorn` on 127.0.0.1, with
the secret as `ENGINE_SHARED_SECRET`) and the Next.js standalone server
(`HOSTNAME=127.0.0.1`, `DUEPROOF_EDITION=desktop`, PGlite and files in the
OS app-data folder, an install-wide `AUTH_SECRET` kept there with mode
0600), each with a clean environment (nothing from the user's shell leaks
in). It waits for `/api/health`, pins `http://127.0.0.1:<port>` and opens it.
The sidecars stop with the app; on Linux they also get `PR_SET_PDEATHSIG`,
so a killed shell doesn't leave them running. Verified on Linux: the shell
started both, opened the sign-up page and left nothing behind.

Measured with `scripts/local-spike.mjs` (Linux x86_64, Node 22, Python 3.13):

| | |
|---|---|
| Node runtime | 119 MB |
| App, Next.js standalone (+ static, public) | 118.5 MB, 40 MB gzipped |
| Engine-fast venv (no torch, no Tesseract) | 205–212 MB |
| OCR models (engine README) | 30 MB |
| Python runtime (python-build-standalone) | about 100 MB (not measured) |
| **Estimated install** | **about 570 MB unpacked, about 200 MB compressed**, plus Tesseract and language packs if bundled (the ~1 GB translation model downloads on first use, 03 §5) |
| Engine ready | 0.4–0.5 s (1.3 s the very first time) |
| App ready, first launch (empty data, migrations) | 3.3–3.8 s |
| App ready, later launches | 1.5–1.6 s |
| First page after ready | about 0.2–0.3 s |
| Answers on the network address | no (loopback only) |

**Missing before Local mode can ship:**

1. **The per-launch secret isn't enforced by the app yet.** The shell passes
   `DUEPROOF_LAUNCH_SECRET`; apps/app must require it, or another local
   process (or a web page doing DNS rebinding) could call the server on
   127.0.0.1. Proposed: the shell first opens
   `/api/desktop/launch?secret=…`, which sets an `HttpOnly; SameSite=Strict`
   cookie and redirects to `/`; `proxy.ts` rejects every request without the
   cookie (except `/api/health`) and every `Host` other than
   `127.0.0.1:<port>`. Alternative: serve the app through a Tauri custom
   protocol that adds the secret in Rust, so the port needn't be reachable
   from the webview at all (cookies and service workers on custom schemes
   need testing in all three webviews).
2. **Bundling the runtime:** per-OS Node and python-build-standalone in
   `bundle.resources`, the engine installed into it, the OCR models, and
   Tesseract with its language packs. Sidecar binaries must be signed and,
   on macOS, notarised; Node needs the JIT entitlements
   (`com.apple.security.cs.allow-jit`).
3. **Child clean-up on macOS and Windows** when the shell is killed (a
   kqueue parent watcher; a Job object with kill-on-close).
4. A "Run on this computer" choice in the setup screen, a first-run splash
   while migrations run, the AI key in the OS keychain (05 §7), and the
   export/import path to a server (03 §5).

## Follow-ups outside this app

- apps/app: raise deadline alerts with `new Notification()` when
  `window.dueproofDesktop` is present (see Native extras); the `/inbox`
  route that `/inbox?upload=1` points at; optionally pad for the macOS title
  bar with `html[data-desktop="macos"]`.
- apps/site: add `desktop` to the docs sections (`apps/site/lib/docs.ts`) and
  link `docs/desktop.md` from `docs/deployment.md`.
- CI: run `cargo test` for `apps/desktop/src-tauri` (needs the Linux packages above).
