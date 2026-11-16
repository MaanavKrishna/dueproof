fn main() {
    // Every app command gets an allow-/deny- permission; capabilities decide
    // which window and origin may use it (capabilities/setup.json for the
    // local screens, and the run-time capability for the pinned server origin
    // in src/lib.rs).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_settings",
            "check_server",
            "connect",
            "set_autostart",
            "set_updates",
            "notify",
        ]),
    ))
    .expect("failed to run tauri-build");
}
