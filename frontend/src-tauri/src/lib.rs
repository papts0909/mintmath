//! Desktop shell for MathPad: the web app in a native window, with a native
//! "Save as" dialog for exported files.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running MathPad");
}
