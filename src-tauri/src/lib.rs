use tauri::Manager;

mod db;
mod commands;

pub use commands::*;

#[tauri::command]
async fn set_always_on_top(window: tauri::WebviewWindow, on_top: bool) -> Result<(), String> {
    window.set_always_on_top(on_top).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle().clone();
            let app_dir = app_handle.path().app_data_dir().expect("Failed to get app data dir");
            let db_path = app_dir.join("gijimemo.db");
            let app_db = db::init_db(db_path).expect("Failed to initialize database");
            app.manage(app_db);

            // Set main window properties
            let window = app.get_webview_window("main").unwrap();
            window.set_always_on_top(true).ok();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_always_on_top,
            commands::get_settings,
            commands::save_settings,
            commands::save_meeting,
            commands::get_meeting,
            commands::get_meetings_list,
            commands::delete_meeting,
            commands::search_meetings,
            commands::test_llm_connection,
            commands::generate_summary_stream,
            commands::export_issue_to_db,
            commands::call_llm_oneshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
