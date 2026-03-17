use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use chrono::Utc;

use crate::db::DB;

// Build a reqwest client that bypasses system proxy for the given endpoint host.
// This is required when the LLM runs inside a corporate network where a system
// proxy is configured but the LLM endpoint must be reached directly.
fn build_llm_client(_endpoint: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()   // disable all system-level proxy env vars for this client
        .build()
        .map_err(|e| format!("HTTPクライアント構築失敗: {}", e))
}

// On Windows, "localhost" may resolve to ::1 (IPv6) while local LLM servers
// typically listen on 127.0.0.1 (IPv4). Replace to avoid connection failures.
fn normalize_endpoint(endpoint: &str) -> String {
    endpoint
        .replace("://localhost:", "://127.0.0.1:")
        .replace("://localhost/", "://127.0.0.1/")
        // bare "localhost" with no port or path
        .replace("://localhost", "://127.0.0.1")
}

// ─── Data structs ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub llm_api_key: String,
    pub llm_endpoint: String,
    pub llm_model: String,
    pub prompt_template: String,
    pub always_on_top: bool,
    pub auto_transparent: bool,
    pub inactive_opacity: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgendaCard {
    pub id: String,
    pub meeting_id: String,
    pub title: String,
    pub content: String,
    pub order_index: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub held_at: String,
    pub action_items: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MeetingWithCards {
    pub meeting: Meeting,
    pub cards: Vec<AgendaCard>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MeetingListItem {
    pub id: String,
    pub title: String,
    pub held_at: String,
    pub updated_at: String,
    pub card_count: i64,
}

// ─── Settings commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    let db = DB.get().ok_or("DB not initialized")?;
    let conn = db.lock().map_err(|e| e.to_string())?;

    let settings = conn.query_row(
        "SELECT llm_api_key, llm_endpoint, llm_model, prompt_template, always_on_top, auto_transparent, inactive_opacity FROM settings WHERE id = 1",
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
            })
        },
    ).map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    let db = DB.get().ok_or("DB not initialized")?;
    let conn = db.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE settings SET llm_api_key=?1, llm_endpoint=?2, llm_model=?3, prompt_template=?4, always_on_top=?5, auto_transparent=?6, inactive_opacity=?7 WHERE id=1",
        rusqlite::params![
            settings.llm_api_key,
            settings.llm_endpoint,
            settings.llm_model,
            settings.prompt_template,
            settings.always_on_top as i64,
            settings.auto_transparent as i64,
            settings.inactive_opacity,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ─── Meeting commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn save_meeting(meeting: Meeting, cards: Vec<AgendaCard>) -> Result<String, String> {
    let db = DB.get().ok_or("DB not initialized")?;
    let mut conn = db.lock().map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    // Upsert meeting
    let meeting_id = if meeting.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        meeting.id.clone()
    };

    tx.execute(
        "INSERT INTO meetings (id, title, held_at, action_items, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title,
           held_at=excluded.held_at,
           action_items=excluded.action_items,
           updated_at=excluded.updated_at",
        rusqlite::params![
            meeting_id,
            meeting.title,
            meeting.held_at,
            meeting.action_items,
            if meeting.created_at.is_empty() { now.clone() } else { meeting.created_at.clone() },
            now.clone(),
        ],
    ).map_err(|e| e.to_string())?;

    // Delete existing cards for this meeting
    tx.execute("DELETE FROM agenda_cards WHERE meeting_id=?1", [&meeting_id])
        .map_err(|e| e.to_string())?;

    // Insert cards
    for card in &cards {
        let card_id = if card.id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            card.id.clone()
        };
        tx.execute(
            "INSERT INTO agenda_cards (id, meeting_id, title, content, order_index) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![card_id, meeting_id, card.title, card.content, card.order_index],
        ).map_err(|e| e.to_string())?;
    }

    // Update FTS index
    tx.execute("DELETE FROM meetings_fts WHERE meeting_id=?1", [&meeting_id])
        .map_err(|e| e.to_string())?;

    let cards_text: String = cards.iter()
        .map(|c| format!("{} {}", c.title, c.content))
        .collect::<Vec<_>>()
        .join(" ");

    tx.execute(
        "INSERT INTO meetings_fts (meeting_id, title, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![meeting_id, meeting.title, cards_text],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(meeting_id)
}

#[tauri::command]
pub fn get_meeting(id: String) -> Result<MeetingWithCards, String> {
    let db = DB.get().ok_or("DB not initialized")?;
    let conn = db.lock().map_err(|e| e.to_string())?;

    let meeting = conn.query_row(
        "SELECT id, title, held_at, action_items, created_at, updated_at FROM meetings WHERE id=?1",
        [&id],
        |row| Ok(Meeting {
            id: row.get(0)?,
            title: row.get(1)?,
            held_at: row.get(2)?,
            action_items: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        }),
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, meeting_id, title, content, order_index FROM agenda_cards WHERE meeting_id=?1 ORDER BY order_index ASC"
    ).map_err(|e| e.to_string())?;

    let cards: Vec<AgendaCard> = stmt.query_map([&id], |row| {
        Ok(AgendaCard {
            id: row.get(0)?,
            meeting_id: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            order_index: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(MeetingWithCards { meeting, cards })
}

#[tauri::command]
pub fn get_meetings_list() -> Result<Vec<MeetingListItem>, String> {
    let db = DB.get().ok_or("DB not initialized")?;
    let conn = db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT m.id, m.title, m.held_at, m.updated_at, COUNT(a.id) as card_count
         FROM meetings m
         LEFT JOIN agenda_cards a ON a.meeting_id = m.id
         GROUP BY m.id
         ORDER BY m.updated_at DESC"
    ).map_err(|e| e.to_string())?;

    let items: Vec<MeetingListItem> = stmt.query_map([], |row| {
        Ok(MeetingListItem {
            id: row.get(0)?,
            title: row.get(1)?,
            held_at: row.get(2)?,
            updated_at: row.get(3)?,
            card_count: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(items)
}

#[tauri::command]
pub fn delete_meeting(id: String) -> Result<(), String> {
    let db = DB.get().ok_or("DB not initialized")?;
    let conn = db.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM meetings WHERE id=?1", [&id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM meetings_fts WHERE meeting_id=?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn search_meetings(query: String) -> Result<Vec<MeetingListItem>, String> {
    let db = DB.get().ok_or("DB not initialized")?;
    let conn = db.lock().map_err(|e| e.to_string())?;

    // Sanitize query for FTS5
    let safe_query = query.replace('"', "\"\"");
    let fts_query = format!("\"{}\"", safe_query);

    let mut stmt = conn.prepare(
        "SELECT m.id, m.title, m.held_at, m.updated_at, COUNT(a.id) as card_count
         FROM meetings_fts f
         JOIN meetings m ON m.id = f.meeting_id
         LEFT JOIN agenda_cards a ON a.meeting_id = m.id
         WHERE meetings_fts MATCH ?1
         GROUP BY m.id
         ORDER BY rank"
    ).map_err(|e| e.to_string())?;

    let items: Vec<MeetingListItem> = stmt.query_map([&fts_query], |row| {
        Ok(MeetingListItem {
            id: row.get(0)?,
            title: row.get(1)?,
            held_at: row.get(2)?,
            updated_at: row.get(3)?,
            card_count: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(items)
}

// ─── LLM commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_llm_connection(
    endpoint: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    let url = normalize_endpoint(&endpoint);
    let client = build_llm_client(&url)?;

    let body = serde_json::json!({
        "model": if model.is_empty() { "gpt-3.5-turbo".to_string() } else { model },
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 5
    });

    let mut req = client.post(&url).json(&body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            let status_u16 = status.as_u16();
            let body_text = resp.text().await.unwrap_or_default();
            let snippet = &body_text[..body_text.len().min(200)];

            if status.is_success() {
                Ok(format!("✅ 接続成功 (HTTP {})\n接続先: {}", status_u16, url))
            } else if status_u16 == 401 || status_u16 == 403 {
                Ok(format!("⚠️ 到達できました (HTTP {}) — API Key を確認してください\n接続先: {}", status_u16, url))
            } else if status_u16 == 404 {
                Ok(format!("⚠️ 到達できました (HTTP 404) — エンドポイントのパスを確認してください\n接続先: {}\n{}", url, snippet))
            } else {
                Ok(format!("⚠️ 到達できました (HTTP {})\n接続先: {}\n{}", status_u16, url, snippet))
            }
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("connection refused") {
                Err(format!("❌ 接続拒否 — LLMサービスが起動しているか確認してください\n接続先: {}", url))
            } else if msg.contains("timeout") || msg.contains("timed out") {
                Err(format!("❌ タイムアウト — ホスト・ポートが正しいか確認してください\n接続先: {}", url))
            } else {
                Err(format!("❌ 接続失敗: {}\n接続先: {}", msg, url))
            }
        }
    }
}

#[tauri::command]
pub async fn generate_summary_stream(
    app: AppHandle,
    endpoint: String,
    api_key: String,
    model: String,
    prompt: String,
) -> Result<(), String> {
    use futures_util::StreamExt;

    let endpoint = normalize_endpoint(&endpoint);
    let client = build_llm_client(&endpoint)?;

    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": true,
        "max_tokens": 2000
    });

    let mut req = client.post(&endpoint).json(&body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = req.send().await.map_err(|e| format!("リクエスト失敗: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, &text[..text.len().min(300)]));
    }

    let mut stream = response.bytes_stream();
    // Buffer for incomplete SSE lines that span multiple network chunks
    let mut remainder = String::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                remainder.push_str(&String::from_utf8_lossy(&chunk));

                // Process all complete lines (ending with \n)
                while let Some(newline_pos) = remainder.find('\n') {
                    let line = remainder[..newline_pos].trim_end_matches('\r').to_string();
                    remainder = remainder[newline_pos + 1..].to_string();

                    if let Some(data) = line.strip_prefix("data: ") {
                        let data = data.trim();
                        if data == "[DONE]" {
                            let _ = app.emit("llm-stream-chunk", serde_json::json!({"done": true}));
                            return Ok(());
                        }
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            // Some servers wrap errors inside the SSE stream
                            if let Some(err_msg) = json["error"]["message"].as_str() {
                                let _ = app.emit("llm-stream-chunk", serde_json::json!({"error": err_msg}));
                                return Err(format!("LLMエラー: {}", err_msg));
                            }
                            if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                                let _ = app.emit("llm-stream-chunk", serde_json::json!({"chunk": content}));
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let msg = format!("ストリーム読み取りエラー: {}", e);
                let _ = app.emit("llm-stream-chunk", serde_json::json!({"error": msg}));
                return Err(msg);
            }
        }
    }

    // Stream ended without [DONE] — treat as complete
    let _ = app.emit("llm-stream-chunk", serde_json::json!({"done": true}));
    Ok(())
}
