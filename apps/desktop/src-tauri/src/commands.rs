//! Commands. The setup screen's commands are granted to local pages only
//! (capabilities/setup.json); `notify` only to the pinned server origin (the
//! run-time capability in lib.rs). Each command also checks who called it.

use crate::{bridge, health, origin, settings, updates, window, Shell};
use serde::Serialize;
use std::time::Instant;
use tauri::{AppHandle, State, Webview};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_notification::NotificationExt;

/// Defence in depth on top of the ACL: the caller must be one of the app's
/// own screens.
fn require_local(shell: &Shell, webview: &Webview) -> Result<(), String> {
    let url = webview.url().map_err(|e| e.to_string())?;
    if origin::is_local_app_url(&url, shell.dev_origin.as_ref()) {
        Ok(())
    } else {
        Err("not allowed".into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    server_url: Option<String>,
    autostart: bool,
    updates_enabled: bool,
    updates_locked: bool,
    updates_configured: bool,
    platform: &'static str,
    app_version: &'static str,
}

#[tauri::command]
pub fn get_settings(
    app: AppHandle,
    shell: State<'_, Shell>,
    webview: Webview,
) -> Result<SettingsView, String> {
    require_local(&shell, &webview)?;
    let s = shell.settings.lock().unwrap().clone();
    Ok(SettingsView {
        server_url: s.server_url,
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        updates_enabled: s.updates_enabled && !s.updates_locked,
        updates_locked: s.updates_locked,
        updates_configured: updates::configured(&app),
        platform: crate::platform(),
        app_version: env!("CARGO_PKG_VERSION"),
    })
}

#[tauri::command]
pub async fn check_server(
    shell: State<'_, Shell>,
    webview: Webview,
    url: String,
) -> Result<health::Report, String> {
    require_local(&shell, &webview)?;
    Ok(match origin::normalise_server_url(&url) {
        Ok(o) => health::check(&o).await,
        Err(e) => health::Report::refused(e.to_string()),
    })
}

/// Checks the server again, saves it and switches to it. A different
/// server restarts the app, so the new origin gets a fresh capability and
/// bridge and the old one keeps nothing.
#[tauri::command]
pub async fn connect(
    app: AppHandle,
    shell: State<'_, Shell>,
    webview: Webview,
    url: String,
) -> Result<health::Report, String> {
    require_local(&shell, &webview)?;
    let o = match origin::normalise_server_url(&url) {
        Ok(o) => o,
        Err(e) => return Ok(health::Report::refused(e.to_string())),
    };
    let report = health::check(&o).await;
    if !report.ok {
        return Ok(report);
    }
    let same = shell
        .pinned
        .as_ref()
        .is_some_and(|p| origin::same_origin(p, &o));
    {
        let mut s = shell.settings.lock().unwrap();
        s.server_url = Some(origin::origin_string(&o));
        settings::save(&shell.settings_dir, &s).map_err(|_| {
            "Couldn't save the server address. Check that your user folder is writable.".to_string()
        })?;
    }
    if same {
        window::reopen_server(&app).map_err(|e| e.to_string())?;
    } else {
        app.restart();
    }
    Ok(report)
}

#[tauri::command]
pub fn set_autostart(
    app: AppHandle,
    shell: State<'_, Shell>,
    webview: Webview,
    enabled: bool,
) -> Result<bool, String> {
    require_local(&shell, &webview)?;
    let al = app.autolaunch();
    let res = if enabled { al.enable() } else { al.disable() };
    res.map_err(|_| "Couldn't change the start-up setting.".to_string())?;
    crate::menu::sync_autostart(&app);
    Ok(al.is_enabled().unwrap_or(false))
}

#[tauri::command]
pub fn set_updates(
    shell: State<'_, Shell>,
    webview: Webview,
    enabled: bool,
) -> Result<bool, String> {
    require_local(&shell, &webview)?;
    let mut s = shell.settings.lock().unwrap();
    if s.updates_locked {
        return Err("Your administrator manages updates for this computer.".into());
    }
    s.updates_enabled = enabled;
    settings::save(&shell.settings_dir, &s)
        .map_err(|_| "Couldn't save the setting.".to_string())?;
    Ok(s.updates_enabled)
}

/// From the server's pages (the bridge's `Notification`). Text is cleaned
/// and capped, at most 10 a minute, and never logged.
#[tauri::command]
pub fn notify(
    app: AppHandle,
    shell: State<'_, Shell>,
    webview: Webview,
    title: String,
    body: String,
) -> Result<(), String> {
    let url = webview.url().map_err(|e| e.to_string())?;
    let pinned = shell.pinned.as_ref().ok_or("not allowed")?;
    if !origin::same_origin(pinned, &url) {
        return Err("not allowed".into());
    }
    if !shell.notify_limit.lock().unwrap().allow(Instant::now()) {
        return Err("too many notifications".into());
    }
    let title = bridge::clean_text(&title, bridge::MAX_TITLE);
    let body = bridge::clean_text(&body, bridge::MAX_BODY);
    app.notification()
        .builder()
        .title(if title.is_empty() {
            "Dueproof".to_string()
        } else {
            title
        })
        .body(body)
        .show()
        .map_err(|_| "couldn't show the notification".to_string())?;
    Ok(())
}
