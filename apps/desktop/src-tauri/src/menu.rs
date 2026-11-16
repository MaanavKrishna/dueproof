//! The window menu and the tray icon.

use crate::{window, Shell};
use std::sync::atomic::Ordering;
use tauri::{
    menu::{
        AboutMetadata, CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
    },
    tray::TrayIconBuilder,
    AppHandle, Manager, Wry,
};
use tauri_plugin_autostart::ManagerExt as _;

const OPEN: &str = "open";
const UPLOAD: &str = "upload";
const CHANGE_SERVER: &str = "change_server";
const RELOAD: &str = "reload";
const AUTOSTART: &str = "autostart";
const QUIT: &str = "quit";

/// Holds the tray's "Start at login" item so the setup screen can keep it in step.
struct TrayAutostart(CheckMenuItem<Wry>);

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let has_server = app.state::<Shell>().pinned.is_some();

    let upload = MenuItem::with_id(
        app,
        UPLOAD,
        "Upload documents…",
        has_server,
        Some("CmdOrCtrl+U"),
    )?;
    let change = MenuItem::with_id(app, CHANGE_SERVER, "Change server…", true, None::<&str>)?;
    let reload = MenuItem::with_id(app, RELOAD, "Reload", true, Some("CmdOrCtrl+R"))?;
    let quit = MenuItem::with_id(app, QUIT, "Quit Dueproof", true, Some("CmdOrCtrl+Q"))?;

    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[&reload, &PredefinedMenuItem::fullscreen(app, None)?],
    )?;

    #[cfg(target_os = "macos")]
    let menu = {
        let about = AboutMetadata {
            name: Some("Dueproof".into()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            copyright: Some("Licensed under FSL-1.1-ALv2".into()),
            ..Default::default()
        };
        let app_menu = Submenu::with_items(
            app,
            "Dueproof",
            true,
            &[
                &PredefinedMenuItem::about(app, Some("About Dueproof"), Some(about))?,
                &PredefinedMenuItem::separator(app)?,
                &change,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &quit,
            ],
        )?;
        let file = Submenu::with_items(
            app,
            "File",
            true,
            &[
                &upload,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::close_window(app, None)?,
            ],
        )?;
        let win = Submenu::with_items(
            app,
            "Window",
            true,
            &[
                &PredefinedMenuItem::minimize(app, None)?,
                &PredefinedMenuItem::maximize(app, None)?,
            ],
        )?;
        let help = Submenu::with_id(app, HELP_SUBMENU_ID, "Help", true)?;
        Menu::with_items(app, &[&app_menu, &file, &edit, &view, &win, &help])?
    };

    #[cfg(not(target_os = "macos"))]
    let menu = {
        let _ = (HELP_SUBMENU_ID, AboutMetadata::default());
        let file = Submenu::with_items(
            app,
            "File",
            true,
            &[
                &upload,
                &change,
                &PredefinedMenuItem::separator(app)?,
                &quit,
            ],
        )?;
        Menu::with_items(app, &[&file, &edit, &view])?
    };

    app.set_menu(menu)?;
    app.on_menu_event(|app, event| handle(app, event.id().as_ref()));

    // The tray. Some Linux desktops (GNOME without the AppIndicator
    // extension) have none: then closing the window quits as usual.
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let tray_menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, OPEN, "Open Dueproof", true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                format!("tray-{UPLOAD}"),
                "Upload documents…",
                has_server,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &{
                let item = CheckMenuItem::with_id(
                    app,
                    AUTOSTART,
                    "Start at login",
                    true,
                    autostart_on,
                    None::<&str>,
                )?;
                app.manage(TrayAutostart(item.clone()));
                item
            },
            &MenuItem::with_id(
                app,
                format!("tray-{CHANGE_SERVER}"),
                "Change server…",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, format!("tray-{QUIT}"), "Quit", true, None::<&str>)?,
        ],
    )?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Dueproof")
        .menu(&tray_menu)
        .show_menu_on_left_click(cfg!(target_os = "linux"))
        // Tray menu events reach the app-wide handler above.
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                window::show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    match tray.build(app) {
        Ok(_) => app.state::<Shell>().has_tray.store(true, Ordering::SeqCst),
        Err(e) => log::warn!("no tray icon on this desktop: {e}"),
    }
    Ok(())
}

pub fn sync_autostart(app: &AppHandle) {
    if let Some(item) = app.try_state::<TrayAutostart>() {
        let _ = item
            .0
            .set_checked(app.autolaunch().is_enabled().unwrap_or(false));
    }
}

fn handle(app: &AppHandle, id: &str) {
    match id.trim_start_matches("tray-") {
        OPEN => window::show_main(app),
        UPLOAD => window::go_to(app, "/inbox?upload=1"),
        CHANGE_SERVER => {
            window::open_setup(app);
            window::show_main(app);
        }
        RELOAD => {
            if let Some(w) = app.get_webview_window(window::MAIN) {
                let _ = w.reload();
            }
        }
        AUTOSTART => {
            let al = app.autolaunch();
            let on = al.is_enabled().unwrap_or(false);
            let _ = if on { al.disable() } else { al.enable() };
            sync_autostart(app);
        }
        QUIT => app.exit(0),
        _ => {}
    }
}
