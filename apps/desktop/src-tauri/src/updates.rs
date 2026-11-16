//! Signed updates, off by default (05-security §7: no phoning home).
//!
//! The shell looks for an update only when all of these hold:
//! - this build has an updater public key and endpoint (tauri.conf.json
//!   `plugins.updater`, filled in by the release build; see README), and
//! - the person turned "Check for updates" on, and an administrator hasn't
//!   locked updates off.
//!
//! Every update's signature is checked against the key, and the signed
//! version must match the one announced (`requireSignedVersion`). Nothing
//! installs without the person saying yes.

use crate::Shell;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

/// True when this build carries an updater key and at least one endpoint.
pub fn configured(app: &AppHandle) -> bool {
    let Some(cfg) = app.config().plugins.0.get("updater") else {
        return false;
    };
    let has_key = cfg
        .get("pubkey")
        .and_then(|v| v.as_str())
        .is_some_and(|s| !s.trim().is_empty());
    let has_endpoint = cfg
        .get("endpoints")
        .and_then(|v| v.as_array())
        .is_some_and(|a| !a.is_empty());
    has_key && has_endpoint
}

pub fn check_in_background(app: &AppHandle) {
    let wanted = {
        let s = app.state::<Shell>().settings.lock().unwrap().clone();
        s.updates_enabled && !s.updates_locked
    };
    if !wanted || !configured(app) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let update = match app.updater() {
            Ok(u) => u.check().await,
            Err(e) => Err(e),
        };
        let update = match update {
            Ok(Some(u)) => u,
            Ok(None) => return,
            Err(e) => {
                log::warn!("update check failed: {e}");
                return;
            }
        };
        let version = update.version.clone();
        let yes = app
            .dialog()
            .message(format!(
                "Dueproof {version} is ready to install. The app restarts when it's done."
            ))
            .title("Update available")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Install and restart".into(),
                "Later".into(),
            ))
            .blocking_show();
        if !yes {
            return;
        }
        match update.download_and_install(|_, _| {}, || {}).await {
            Ok(()) => app.restart(),
            Err(e) => log::warn!("update didn't install: {e}"),
        }
    });
}
