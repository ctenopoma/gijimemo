use rusqlite::{Connection, Result};
use std::sync::Mutex;

pub struct AppDb(pub Mutex<Connection>);

pub fn init_db(db_path: std::path::PathBuf) -> Result<AppDb> {
    std::fs::create_dir_all(db_path.parent().expect("db_path must have parent"))
        .expect("Failed to create app data dir");

    let conn = Connection::open(&db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    // Schema version management
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL
        );"
    )?;

    let current_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if current_version < 1 {
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
                prompt_template TEXT NOT NULL DEFAULT 'あなたは議事録のアシスタントです。

以下の議事録の内容を整理し、
1. 要点（箇条書き）
2. 決定事項
3. アクションアイテム（担当者・期日があれば含める）
をMarkdown形式で出力してください。

## 議事録タイトル
{title}

## 日時
{datetime}

## 内容
{content}',
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

            DELETE FROM schema_version;
            INSERT INTO schema_version (version) VALUES (1);
        ")?;
    }

    if current_version < 2 {
        conn.execute_batch("
            ALTER TABLE settings ADD COLUMN dark_mode INTEGER NOT NULL DEFAULT 0;
            DELETE FROM schema_version;
            INSERT INTO schema_version (version) VALUES (2);
        ")?;
    }

    Ok(AppDb(Mutex::new(conn)))
}
