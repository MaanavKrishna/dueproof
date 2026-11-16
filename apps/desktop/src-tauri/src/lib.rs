//! Dueproof desktop shell (Tauri 2), Connect mode.
//!
//! The main window shows one pinned server origin (self-hosted or hosted).
//! Before a server is set, it shows the app's own setup screen (`ui/`). See
//! `apps/desktop/README.md` and `docs/desktop.md`.

mod bridge;
mod commands;
mod health;
#[cfg(feature = "local-mode")]
mod local;
mod menu;
mod origin;
mod settings;
mod updates;
mod window;

use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{ipc::CapabilityBuilder, Manager, RunEvent};
use url::Url;

/// Shared by commands, menus and the window's navigation handler.
pub struct Shell {
    pub settings_dir: PathBuf,
    pub settings: Mutex<settings::Settings>,
    /// The server origin for this run. Changing server restarts the app, so
    /// the capability and the injected bridge always match it.
    pub pinned: Option<Url>,
    /// The app's own screens may load only when the shell asked for them.
    pub local_allowed: AtomicBool,
    pub dev_origin: Option<Url>,
    pub notify_limit: Mutex<bridge::RateLimit>,
    /// Closing the window hides it to the tray, when there is one.
    pub has_tray: AtomicBool,
    #[cfg(feature = "local-mode")]
    pub sidecars: Mutex<Option<local::Sidecars>>,
}

impl Shell {
    pub fn allow_local(&self, allowed: bool) {
        self.local_allowed.store(allowed, Ordering::SeqCst);
    }
}

pub fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Must be first: a second launch (or a deep link on Windows and Linux)
    // focuses this one instead of starting another shell.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::show_main(app);
        }));
    }

    let app = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::check_server,
            commands::connect,
            commands::set_autostart,
            commands::set_updates,
            commands::notify,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let settings_dir = app.path().app_config_dir()?;
            let settings = settings::load(&settings_dir);

            #[allow(unused_mut)]
            let mut pinned = settings
                .server_url
                .as_deref()
                .and_then(|s| origin::normalise_server_url(s).ok());

            #[cfg(feature = "local-mode")]
            let sidecars = if std::env::var_os("DUEPROOF_LOCAL").is_some() {
                let data = app.path().app_data_dir()?;
                let res = app.path().resource_dir()?;
                match local::Sidecars::start(&res, &data) {
                    Ok(s) => {
                        pinned = Some(s.origin.clone());
                        Some(s)
                    }
                    Err(e) => {
                        log::error!("local mode didn't start: {e}");
                        None
                    }
                }
            } else {
                None
            };

            let dev_origin = if tauri::is_dev() {
                app.config().build.dev_url.clone()
            } else {
                None
            };

            // The server's pages may call `notify`, and nothing else. Added
            // at run time because the origin is chosen at run time.
            if let Some(o) = &pinned {
                app.add_capability(
                    CapabilityBuilder::new("server")
                        .remote(origin::remote_capability_pattern(o))
                        .local(false)
                        .window("main")
                        .permission("allow-notify"),
                )?;
            }

            app.manage(Shell {
                settings_dir,
                settings: Mutex::new(settings),
                pinned,
                local_allowed: AtomicBool::new(false),
                dev_origin,
                notify_limit: Mutex::new(bridge::RateLimit::new(10, Duration::from_secs(60))),
                has_tray: AtomicBool::new(false),
                #[cfg(feature = "local-mode")]
                sidecars: Mutex::new(sidecars),
            });

            menu::install(&handle)?;
            let started_at_login = std::env::args().any(|a| a == "--autostart");
            window::open_main(&handle, !started_at_login)?;

            deep_links(&handle);
            updates::check_in_background(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Dueproof desktop app");

    app.run(|app, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => window::show_main(app),
        RunEvent::Exit => {
            #[cfg(feature = "local-mode")]
            if let Some(s) = app.state::<Shell>().sidecars.lock().unwrap().take() {
                s.stop();
            }
            let _ = app;
        }
        _ => {}
    });
}

/// `dueproof://open?path=/…` at start-up and while running.
fn deep_links(app: &tauri::AppHandle) {
    use tauri_plugin_deep_link::DeepLinkExt;

    // AppImages and dev builds aren't registered by an installer.
    #[cfg(any(target_os = "linux", windows))]
    if tauri::is_dev() || std::env::var_os("APPIMAGE").is_some() {
        let _ = app.deep_link().register_all();
    }

    if let Ok(Some(urls)) = app.deep_link().get_current() {
        for u in urls {
            window::open_deep_link(app, &u);
        }
    }
    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        for u in event.urls() {
            window::open_deep_link(&handle, &u);
        }
    });
}
