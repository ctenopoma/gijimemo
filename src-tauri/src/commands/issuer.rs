const ISSUER_DB_FILENAME: &str = "issuer.db";

#[tauri::command]
pub fn export_issue_to_db(
    db_path: String,
    title: String,
    body: String,
    assignee: String,
    created_by: String,
) -> Result<i32, String> {
    let path = std::path::PathBuf::from(&db_path);

    // Validate: path must be an existing directory
    if !path.is_dir() {
        return Err(format!(
            "指定されたパスはディレクトリではありません: {}",
            path.display()
        ));
    }

    let full_path = path.join(ISSUER_DB_FILENAME);

    // Verify the resolved path is still under the intended directory
    let canonical_dir = path.canonicalize()
        .map_err(|e| format!("パスの正規化に失敗: {}", e))?;
    let canonical_file = full_path.canonicalize()
        .map_err(|_| format!("対象のデータベースが見つかりません: {}", full_path.display()))?;
    if !canonical_file.starts_with(&canonical_dir) {
        return Err("不正なパスが指定されました".to_string());
    }

    let mut conn = rusqlite::Connection::open(&full_path)
        .map_err(|e| format!("DBオープン失敗: {}", e))?;

    let now = chrono::Local::now().to_rfc3339();

    // Use a transaction to prevent race conditions on ID generation
    let tx = conn.transaction().map_err(|e| format!("トランザクション開始失敗: {}", e))?;

    let next_id: i32 = tx
        .query_row(
            "SELECT COALESCE(MAX(id), 0) + 1 FROM issues",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("ID採番失敗: {}", e))?;

    tx.execute(
        "INSERT INTO issues (id, title, body, status, created_by, assignee, created_at, updated_at, is_deleted) \
         VALUES (?1, ?2, ?3, 'OPEN', ?4, ?5, ?6, ?6, 0)",
        rusqlite::params![next_id, title, body, created_by, assignee, now],
    )
    .map_err(|e| format!("INSERT失敗: {}", e))?;

    tx.commit().map_err(|e| format!("コミット失敗: {}", e))?;

    Ok(next_id)
}
