//! The shell's own settings: one small JSON file in the OS app-config folder
//! (`~/.config/app.dueproof.desktop`, `%APPDATA%\app.dueproof.desktop`,
//! `~/Library/Application Support/app.dueproof.desktop`).
//!
//! It holds no secrets: the session lives in the webview's cookie store, as
//! in any browser. An administrator can pre-seed the file (see README).

use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub const FILE_NAME: &str = "settings.json";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// The pinned server origin (`https://host[:port]`), once set up.
    pub server_url: Option<String>,
    /// Look for signed updates at start-up. Off unless someone turns it on.
    pub updates_enabled: bool,
    /// Administrators can lock updates off for a managed install.
    pub updates_locked: bool,
}

pub fn path_in(dir: &Path) -> PathBuf {
    dir.join(FILE_NAME)
}

/// Reads the settings. A missing or unreadable file gives the defaults (the
/// setup screen), never a crash.
pub fn load(dir: &Path) -> Settings {
    match fs::read(path_in(dir)) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

/// Writes atomically: a temporary file, then a rename over the old one.
pub fn save(dir: &Path, settings: &Settings) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    let json = serde_json::to_vec_pretty(settings).map_err(io::Error::other)?;
    fs::write(&tmp, json)?;
    fs::rename(&tmp, path_in(dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let mut bytes = [0u8; 8];
        getrandom::fill(&mut bytes).unwrap();
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        std::env::temp_dir().join(format!("dueproof-desktop-{name}-{hex}"))
    }

    #[test]
    fn missing_file_gives_defaults() {
        let dir = temp_dir("missing");
        assert_eq!(load(&dir), Settings::default());
        assert!(!load(&dir).updates_enabled);
    }

    #[test]
    fn round_trips() {
        let dir = temp_dir("roundtrip");
        let s = Settings {
            server_url: Some("https://dueproof.example.com".into()),
            updates_enabled: true,
            updates_locked: false,
        };
        save(&dir, &s).unwrap();
        assert_eq!(load(&dir), s);
        let raw = fs::read_to_string(path_in(&dir)).unwrap();
        assert!(raw.contains("\"serverUrl\""));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn corrupt_or_partial_files_fall_back_safely() {
        let dir = temp_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        fs::write(path_in(&dir), b"{not json").unwrap();
        assert_eq!(load(&dir), Settings::default());
        fs::write(
            path_in(&dir),
            br#"{"serverUrl":"https://a.example","unknown":1}"#,
        )
        .unwrap();
        assert_eq!(load(&dir).server_url.as_deref(), Some("https://a.example"));
        assert!(!load(&dir).updates_enabled);
        fs::remove_dir_all(dir).unwrap();
    }
}
