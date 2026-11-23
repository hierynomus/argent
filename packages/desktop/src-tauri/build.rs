fn main() {
    // `pick_folder` is called by the page the window shows (served by the local Argent server, so a remote
    // origin for Tauri); an app command gets a permission `allow-pick-folder` that capabilities/local-server.json grants.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["pick_folder"])),
    )
    .expect("failed to run tauri-build");
}
