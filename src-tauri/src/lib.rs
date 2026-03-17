use tauri::{Manager, WebviewWindow};

mod db;
mod commands;

pub use commands::*;

#[tauri::command]
async fn set_always_on_top(window: WebviewWindow, on_top: bool) -> Result<(), String> {
    window.set_always_on_top(on_top).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_window_opacity(window: WebviewWindow, opacity: f64) -> Result<(), String> {
    // Tauri v2 does not expose set_opacity directly on WebviewWindow via API in all platforms
    // We handle opacity via CSS on the frontend side instead
    // This command is kept as a hook for future platform-specific implementations
    let _ = opacity;
    let _ = window;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle().clone();
            db::init_db(&app_handle).expect("Failed to initialize database");

            // Set main window properties
            let window = app.get_webview_window("main").unwrap();
            window.set_always_on_top(true).ok();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_always_on_top,
            set_window_opacity,
            commands::get_settings,
            commands::save_settings,
            commands::save_meeting,
            commands::get_meeting,
            commands::get_meetings_list,
            commands::delete_meeting,
            commands::search_meetings,
            commands::test_llm_connection,
            commands::generate_summary_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
