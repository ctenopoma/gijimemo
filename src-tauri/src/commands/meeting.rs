use tauri::State;
use uuid::Uuid;
use chrono::Utc;
use std::collections::HashMap;

use crate::db::AppDb;
use super::{Meeting, AgendaCard, CardImage, MeetingWithCards, MeetingListItem};

#[tauri::command]
pub fn save_meeting(db: State<'_, AppDb>, meeting: Meeting, cards: Vec<AgendaCard>) -> Result<String, String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

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

    // Delete existing cards (and images via CASCADE)
    tx.execute("DELETE FROM agenda_cards WHERE meeting_id=?1", [&meeting_id])
        .map_err(|e| e.to_string())?;

    // Insert cards and their images
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

        for img in &card.images {
            let img_id = if img.id.is_empty() {
                Uuid::new_v4().to_string()
            } else {
                img.id.clone()
            };
            tx.execute(
                "INSERT INTO card_images (id, card_id, data, order_index) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![img_id, card_id, img.data, img.order_index],
            ).map_err(|e| e.to_string())?;
        }
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
pub fn get_meeting(db: State<'_, AppDb>, id: String) -> Result<MeetingWithCards, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

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

    // Fetch all cards
    let mut card_stmt = conn.prepare(
        "SELECT id, meeting_id, title, content, order_index FROM agenda_cards WHERE meeting_id=?1 ORDER BY order_index ASC"
    ).map_err(|e| e.to_string())?;

    let cards: Vec<AgendaCard> = card_stmt.query_map([&id], |row| {
        Ok(AgendaCard {
            id: row.get(0)?,
            meeting_id: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            order_index: row.get(4)?,
            images: vec![],
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    // Batch-fetch all images for this meeting's cards in one query
    let card_ids: Vec<String> = cards.iter().map(|c| c.id.clone()).collect();
    let mut images_by_card: HashMap<String, Vec<CardImage>> = HashMap::new();

    if !card_ids.is_empty() {
        let placeholders: String = card_ids.iter().enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(",");

        let query = format!(
            "SELECT id, card_id, data, order_index FROM card_images WHERE card_id IN ({}) ORDER BY order_index ASC",
            placeholders
        );
        let mut img_stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

        let params: Vec<&dyn rusqlite::types::ToSql> = card_ids.iter()
            .map(|id| id as &dyn rusqlite::types::ToSql)
            .collect();

        let img_rows = img_stmt.query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(1)?, // card_id
                CardImage {
                    id: row.get(0)?,
                    data: row.get(2)?,
                    order_index: row.get(3)?,
                },
            ))
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

        for (card_id, image) in img_rows {
            images_by_card.entry(card_id).or_default().push(image);
        }
    }

    let cards_with_images: Vec<AgendaCard> = cards.into_iter().map(|mut card| {
        card.images = images_by_card.remove(&card.id).unwrap_or_default();
        card
    }).collect();

    Ok(MeetingWithCards { meeting, cards: cards_with_images })
}

#[tauri::command]
pub fn get_meetings_list(db: State<'_, AppDb>) -> Result<Vec<MeetingListItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

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
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn delete_meeting(db: State<'_, AppDb>, id: String) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM meetings WHERE id=?1", [&id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM meetings_fts WHERE meeting_id=?1", [&id])
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn search_meetings(db: State<'_, AppDb>, query: String) -> Result<Vec<MeetingListItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Sanitize: strip FTS5 special operators and wrap each token in double quotes
    let safe_query: String = query
        .chars()
        .filter(|c| !matches!(c, '"' | '*' | '+' | '-' | '(' | ')' | '{' | '}' | '^' | '~'))
        .collect();
    let fts_query: String = safe_query
        .split_whitespace()
        .filter(|token| {
            let upper = token.to_uppercase();
            !matches!(upper.as_str(), "AND" | "OR" | "NOT" | "NEAR")
        })
        .map(|token| format!("\"{}\"", token))
        .collect::<Vec<_>>()
        .join(" ");

    if fts_query.is_empty() {
        return Ok(vec![]);
    }

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
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(items)
}
