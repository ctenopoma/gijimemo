use tauri::State;
use crate::db::AppDb;
use super::Settings;

#[tauri::command]
pub fn get_settings(db: State<'_, AppDb>) -> Result<Settings, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let settings = conn.query_row(
        "SELECT llm_api_key, llm_endpoint, llm_model, prompt_template, always_on_top, auto_transparent, inactive_opacity, dark_mode FROM settings WHERE id = 1",
        [],
        |row| {
            Ok(Settings {
                llm_api_key: row.get(0)?,
                llm_endpoint: row.get(1)?,
                llm_model: row.get(2)?,
                prompt_template: row.get(3)?,
                always_on_top: row.get::<_, i64>(4)? != 0,
                auto_transparent: row.get::<_, i64>(5)? != 0,
                inactive_opacity: row.get(6)?,
                dark_mode: row.get::<_, i64>(7)? != 0,
            })
        },
    ).map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub fn save_settings(db: State<'_, AppDb>, settings: Settings) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE settings SET llm_api_key=?1, llm_endpoint=?2, llm_model=?3, prompt_template=?4, always_on_top=?5, auto_transparent=?6, inactive_opacity=?7, dark_mode=?8 WHERE id=1",
        rusqlite::params![
            settings.llm_api_key,
            settings.llm_endpoint,
            settings.llm_model,
            settings.prompt_template,
            settings.always_on_top as i64,
            settings.auto_transparent as i64,
            settings.inactive_opacity,
            settings.dark_mode as i64,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
