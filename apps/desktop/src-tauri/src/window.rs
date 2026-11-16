//! The main window: the pinned server, or the app's own setup screen.

use crate::{
    bridge,
    origin::{self, Navigation},
    platform, Shell,
};
use std::path::{Path, PathBuf};
use tauri::{
    webview::{DownloadEvent, NewWindowResponse},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;
use url::Url;

pub const MAIN: &str = "main";

/// Opens (or re-opens) the main window. With a pinned server it loads the
/// server; without one, the setup screen.
pub fn open_main(app: &AppHandle, visible: bool) -> tauri::Result<WebviewWindow> {
    let shell = app.state::<Shell>();
    match shell.pinned.clone() {
        Some(o) => build(app, Some(&o), WebviewUrl::External(o.clone()), visible),
        None => open_setup_with(app, visible),
    }
}

/// "Change server": the setup screen in the main window.
pub fn open_setup(app: &AppHandle) {
    if let Err(e) = open_setup_with(app, true) {
        log::error!("couldn't open the setup screen: {e}");
    }
}

fn open_setup_with(app: &AppHandle, visible: bool) -> tauri::Result<WebviewWindow> {
    app.state::<Shell>().allow_local(true);
    build(app, None, WebviewUrl::App("index.html".into()), visible)
}

/// Back to the server after the setup screen, when the server didn't change.
pub fn reopen_server(app: &AppHandle) -> tauri::Result<()> {
    let shell = app.state::<Shell>();
    if let Some(o) = shell.pinned.clone() {
        build(app, Some(&o), WebviewUrl::External(o.clone()), true)?;
    }
    Ok(())
}

fn build(
    app: &AppHandle,
    bridge_for: Option<&Url>,
    url: WebviewUrl,
    visible: bool,
) -> tauri::Result<WebviewWindow> {
    let shell = app.state::<Shell>();
    if bridge_for.is_some() {
        shell.allow_local(false);
    }
    // One main window at a time: replace it (its capability stays bound to
    // the label, so the new one gets the same rights).
    if let Some(old) = app.get_webview_window(MAIN) {
        old.destroy()?;
    }

    let nav_app = app.clone();
    let new_window_app = app.clone();
    let download_app = app.clone();

    let mut b = WebviewWindowBuilder::new(app, MAIN, url)
        .title("Dueproof")
        .inner_size(1280.0, 820.0)
        .min_inner_size(720.0, 560.0)
        .visible(visible)
        // Let files dropped on the window reach the page's own drop zones
        // (HTML5 drag and drop). No file paths ever cross into the shell.
        .disable_drag_drop_handler()
        .on_navigation(move |target| {
            let shell = nav_app.state::<Shell>();
            match origin::decide_navigation(
                shell.pinned.as_ref(),
                target,
                shell
                    .local_allowed
                    .load(std::sync::atomic::Ordering::SeqCst),
                shell.dev_origin.as_ref(),
            ) {
                Navigation::Allow => true,
                Navigation::OpenExternally => {
                    open_externally(&nav_app, target);
                    false
                }
                Navigation::Deny => false,
            }
        })
        .on_new_window(move |target, _features| {
            let shell = new_window_app.state::<Shell>();
            match origin::decide_navigation(shell.pinned.as_ref(), &target, false, None) {
                // A same-origin "new tab" opens in this window.
                Navigation::Allow if target.scheme() != "about" => {
                    if let Some(w) = new_window_app.get_webview_window(MAIN) {
                        let _ = w.navigate(target);
                    }
                }
                Navigation::OpenExternally => open_externally(&new_window_app, &target),
                _ => {}
            }
            NewWindowResponse::Deny
        })
        .on_download(move |_webview, event| {
            if let DownloadEvent::Requested { url, destination } = event {
                if let Ok(dir) = download_app.path().download_dir() {
                    *destination = download_path(&dir, destination, &url);
                }
            }
            true
        });

    if let Some(o) = bridge_for {
        b = b.initialization_script(bridge::script(o, platform()));
    }

    #[cfg(target_os = "macos")]
    {
        // The traffic lights sit in a transparent title bar that takes the
        // page's background; the page keeps its full height below it.
        b = b
            .title_bar_style(tauri::TitleBarStyle::Transparent)
            .hidden_title(true);
    }

    let window = b.build()?;

    let close_app = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let shell = close_app.state::<Shell>();
            if shell.has_tray.load(std::sync::atomic::Ordering::SeqCst) {
                api.prevent_close();
                if let Some(w) = close_app.get_webview_window(MAIN) {
                    let _ = w.hide();
                }
            }
        }
    });
    Ok(window)
}

fn open_externally(app: &AppHandle, url: &Url) {
    if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
        log::warn!("couldn't open a link in the system browser: {e}");
    }
}

/// Shows and focuses the main window, creating it if it was closed.
pub fn show_main(app: &AppHandle) {
    let w = match app.get_webview_window(MAIN) {
        Some(w) => w,
        None => match open_main(app, true) {
            Ok(w) => w,
            Err(e) => {
                log::error!("couldn't open the main window: {e}");
                return;
            }
        },
    };
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
}

/// Loads a path of the pinned server in the main window.
pub fn go_to(app: &AppHandle, path: &str) {
    let shell = app.state::<Shell>();
    let Some(target) = shell
        .pinned
        .as_ref()
        .and_then(|p| origin::join_app_path(p, path))
    else {
        return;
    };
    show_main(app);
    if let Some(w) = app.get_webview_window(MAIN) {
        // On the setup screen, go back to the server first.
        let on_server = w
            .url()
            .ok()
            .zip(shell.pinned.as_ref())
            .is_some_and(|(u, p)| origin::same_origin(&u, p));
        if !on_server {
            let _ = reopen_server(app);
        }
        if let Some(w) = app.get_webview_window(MAIN) {
            let _ = w.navigate(target);
        }
    }
}

pub fn open_deep_link(app: &AppHandle, link: &Url) {
    let shell = app.state::<Shell>();
    let Some(pinned) = shell.pinned.as_ref() else {
        show_main(app);
        return;
    };
    match origin::deep_link_target(pinned, link) {
        Some(target) => {
            let path = &target[url::Position::BeforePath..];
            go_to(app, path);
        }
        None => log::warn!("ignored a dueproof:// link the app doesn't know"),
    }
}

/// Where a download is saved: the OS Downloads folder, under the name the
/// server gave (or the URL's last segment), never overwriting a file.
pub fn download_path(downloads: &Path, suggested: &Path, url: &Url) -> PathBuf {
    let from_suggested = suggested
        .file_name()
        .and_then(|n| n.to_str())
        .map(str::to_string);
    let from_url = url
        .path_segments()
        .and_then(|mut s| s.next_back())
        .filter(|s| !s.is_empty())
        .map(percent_decode);
    let name = from_suggested
        .or(from_url)
        .map(|n| sanitise_file_name(&n))
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "download".to_string());
    unique(downloads, &name)
}

fn percent_decode(s: &str) -> String {
    url::form_urlencoded::parse(format!("x={s}").as_bytes())
        .next()
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default()
}

fn sanitise_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    cleaned
        .trim_matches(|c: char| c == '.' || c.is_whitespace())
        .to_string()
}

fn unique(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    (1..1000)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_names_are_safe_and_unique() {
        let dir = std::env::temp_dir().join(format!("dp-dl-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let url = Url::parse("https://d.example/api/v1/reports/evidence%20pack.pdf?x=1").unwrap();
        let p = download_path(&dir, Path::new(""), &url);
        assert_eq!(p, dir.join("evidence pack.pdf"));
        std::fs::write(&p, b"x").unwrap();
        assert_eq!(
            download_path(&dir, Path::new(""), &url),
            dir.join("evidence pack (1).pdf")
        );
        // The suggested name wins, and can't climb out of the folder.
        let p = download_path(&dir, Path::new("/tmp/../..\\evil:name.pdf"), &url);
        assert_eq!(p.parent(), Some(dir.as_path()));
        let p = download_path(
            &dir,
            Path::new(""),
            &Url::parse("https://d.example/").unwrap(),
        );
        assert_eq!(p, dir.join("download"));
        let p = download_path(
            &dir,
            Path::new(""),
            &Url::parse("https://d.example/..%2F..%2Fx").unwrap(),
        );
        assert_eq!(p.parent(), Some(dir.as_path()));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
