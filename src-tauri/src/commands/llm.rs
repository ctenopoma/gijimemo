use tauri::{AppHandle, Emitter};
use super::{build_llm_client, normalize_endpoint, ensure_chat_completions_url};

#[tauri::command]
pub async fn call_llm_oneshot(
    endpoint: String,
    api_key: String,
    model: String,
    prompt: String,
) -> Result<String, String> {
    let url = ensure_chat_completions_url(&normalize_endpoint(&endpoint));
    let client = build_llm_client(&url)?;

    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1000
    });

    let mut req = client.post(&url).json(&body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = req.send().await.map_err(|e| format!("リクエスト失敗: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, &text[..text.len().min(300)]));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("JSONパース失敗: {}", e))?;

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(content)
}

#[tauri::command]
pub async fn test_llm_connection(
    endpoint: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    let url = ensure_chat_completions_url(&normalize_endpoint(&endpoint));
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
                Ok(format!("接続成功 (HTTP {})\n接続先: {}", status_u16, url))
            } else if status_u16 == 401 || status_u16 == 403 {
                Ok(format!("到達できました (HTTP {}) — API Key を確認してください\n接続先: {}", status_u16, url))
            } else if status_u16 == 404 {
                Ok(format!("到達できました (HTTP 404) — エンドポイントのパスを確認してください\n接続先: {}\n{}", url, snippet))
            } else {
                Ok(format!("到達できました (HTTP {})\n接続先: {}\n{}", status_u16, url, snippet))
            }
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("connection refused") {
                Err(format!("接続拒否 — LLMサービスが起動しているか確認してください\n接続先: {}", url))
            } else if msg.contains("timeout") || msg.contains("timed out") {
                Err(format!("タイムアウト — ホスト・ポートが正しいか確認してください\n接続先: {}", url))
            } else {
                Err(format!("接続失敗: {}\n接続先: {}", msg, url))
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

    let endpoint = ensure_chat_completions_url(&normalize_endpoint(&endpoint));
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
    let mut remainder = String::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                remainder.push_str(&String::from_utf8_lossy(&chunk));

                // Process all complete lines
                while let Some(newline_pos) = remainder.find('\n') {
                    let line = remainder[..newline_pos].trim_end_matches('\r').to_string();
                    // Remove the processed line: drain bytes [0..newline_pos+1]
                    remainder.drain(..newline_pos + 1);

                    if let Some(data) = line.strip_prefix("data: ") {
                        let data = data.trim();
                        if data == "[DONE]" {
                            let _ = app.emit("llm-stream-chunk", serde_json::json!({"done": true}));
                            return Ok(());
                        }
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
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

    // Stream ended without [DONE]
    let _ = app.emit("llm-stream-chunk", serde_json::json!({"done": true}));
    Ok(())
}
