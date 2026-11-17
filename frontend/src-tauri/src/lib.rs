//! Desktop shell for MintMath: the web app in a native window, with a native
//! "Save as" dialog for exported files and native HTTP for Backblaze B2.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Backblaze B2 requests go through native HTTP (no browser CORS).
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running MintMath");
}
