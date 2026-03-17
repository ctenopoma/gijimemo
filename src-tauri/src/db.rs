use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use once_cell::sync::OnceCell;

pub static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

pub fn init_db(app: &AppHandle) -> Result<()> {
    let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
    std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
    let db_path = app_dir.join("gijimemo.db");

    let conn = Connection::open(&db_path)?;

    // Enable WAL mode for better performance
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    // Create tables
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS meetings (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT '',
            held_at TEXT NOT NULL DEFAULT '',
            action_items TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agenda_cards (
            id TEXT PRIMARY KEY,
            meeting_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            order_index INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            llm_api_key TEXT NOT NULL DEFAULT '',
            llm_endpoint TEXT NOT NULL DEFAULT '',
            llm_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
            prompt_template TEXT NOT NULL DEFAULT 'あなたは議事録のアシスタントです。\n\n以下の議事録の内容を整理し、\n1. 要点（箇条書き）\n2. 決定事項\n3. アクションアイテム（担当者・期日があれば含める）\nをMarkdown形式で出力してください。\n\n## 議事録タイトル\n{title}\n\n## 内容\n{content}',
            always_on_top INTEGER NOT NULL DEFAULT 1,
            auto_transparent INTEGER NOT NULL DEFAULT 1,
            inactive_opacity REAL NOT NULL DEFAULT 0.6
        );

        INSERT OR IGNORE INTO settings (id) VALUES (1);

        CREATE VIRTUAL TABLE IF NOT EXISTS meetings_fts USING fts5(
            meeting_id UNINDEXED,
            title,
            content,
            tokenize='unicode61'
        );

        CREATE TABLE IF NOT EXISTS card_images (
            id TEXT PRIMARY KEY,
            card_id TEXT NOT NULL,
            data TEXT NOT NULL,
            order_index INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (card_id) REFERENCES agenda_cards(id) ON DELETE CASCADE
        );
    ")?;

    // Schema migrations (idempotent)
    let _ = conn.execute_batch(
        "ALTER TABLE settings ADD COLUMN llm_model TEXT NOT NULL DEFAULT 'gpt-4o-mini';"
    ); // Silently ignore "duplicate column" error on subsequent runs

    DB.set(Mutex::new(conn)).ok();

    Ok(())
}
