# 開発手順書

## 目次

1. [開発環境構築](#1-開発環境構築)
2. [プロジェクト構成](#2-プロジェクト構成)
3. [開発フロー](#3-開発フロー)
4. [アーキテクチャ詳解](#4-アーキテクチャ詳解)
5. [データベース](#5-データベース)
6. [IPC コマンド一覧](#6-ipc-コマンド一覧)
7. [トラブルシューティング](#7-トラブルシューティング)
8. [ビルドとリリース](#8-ビルドとリリース)

---

## 1. 開発環境構築

### 1-1. ツールインストール

#### Rust

```bash
# Windows (PowerShell)
winget install Rustlang.Rustup
# または https://rustup.rs からインストーラをダウンロード

rustup update stable
```

#### Node.js

```bash
winget install OpenJS.NodeJS.LTS
# または https://nodejs.org からインストール
```

#### Windows 限定: Visual Studio Build Tools

Rust のコンパイルに C++ ビルドツールが必要です。

```
winget install Microsoft.VisualStudio.2022.BuildTools
```

インストール時に「C++ によるデスクトップ開発」を選択してください。

### 1-2. リポジトリのセットアップ

```bash
git clone <repo-url>
cd gijimemo
npm install
```

### 1-3. 動作確認

```bash
# フロントエンドのみビルド確認
npm run build

# TypeScript 型チェック
npx tsc --noEmit

# Rust コンパイルチェック（ビルドなし・高速）
cd src-tauri && cargo check

# アプリ起動（フロントエンド + Tauri を同時起動）
npm run tauri dev
```

---

## 2. プロジェクト構成

```
gijimemo/
├── src/                        # React フロントエンド
│   ├── main.tsx                # エントリポイント
│   ├── index.css               # Tailwind ベーススタイル
│   ├── App.tsx                 # ルートコンポーネント（ページルーティング、透明度制御）
│   ├── components/
│   │   ├── TitleBar.tsx        # カスタムタイトルバー（ドラッグ、ウィンドウ操作）
│   │   └── AgendaCard.tsx      # 論点カードコンポーネント
│   ├── pages/
│   │   ├── EditorPage.tsx      # メイン議事録エディタ
│   │   ├── SettingsPage.tsx    # LLM・ウィンドウ設定画面
│   │   └── SearchPage.tsx      # 全文検索・一覧画面
│   ├── store/
│   │   ├── appStore.ts         # ページ遷移状態（Zustand）
│   │   ├── settingsStore.ts    # 設定状態（Zustand）
│   │   └── editorStore.ts      # 議事録編集状態（Zustand）
│   └── utils/
│       └── nanoid.ts           # UUID 生成ユーティリティ
│
├── src-tauri/                  # Tauri / Rust バックエンド
│   ├── src/
│   │   ├── main.rs             # エントリポイント（Windows サブシステム設定）
│   │   ├── lib.rs              # Tauri ビルダー、プラグイン登録、IPC ハンドラ登録
│   │   ├── db.rs               # SQLite 初期化・スキーマ定義
│   │   └── commands.rs         # IPC コマンド実装・reqwest クライアント
│   ├── capabilities/
│   │   └── default.json        # Tauri ACL パーミッション定義
│   ├── icons/                  # アプリアイコン（各プラットフォーム向け）
│   ├── Cargo.toml              # Rust 依存関係
│   ├── build.rs                # Tauri ビルドスクリプト
│   └── tauri.conf.json         # Tauri 設定（ウィンドウ、バンドル等）
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── README.md
└── DEVELOPMENT.md              # 本ファイル
```

---

## 3. 開発フロー

### 3-1. 通常の開発サイクル

```bash
npm run tauri dev
```

- Vite の開発サーバー（port 1420）が起動し、ホットリロードが有効になります
- Rust 側のコードを変更した場合は**アプリが自動で再コンパイル・再起動**されます
- フロントエンドのコードを変更した場合は**ブラウザのホットリロード**が適用されます

### 3-2. フロントエンドのみ確認

Tauri なしで UI の確認をしたい場合：

```bash
npm run dev
# ブラウザで http://localhost:1420 を開く
```

> Tauri API（`invoke`, `listen` 等）はブラウザ環境では動作しません。
> 呼び出し箇所でエラーになる場合は `window.__TAURI__` の有無で分岐する必要があります。

### 3-3. Rust のみチェック

```bash
cd src-tauri
cargo check          # 型チェック（高速）
cargo clippy         # Lint
cargo fmt            # フォーマット
```

---

## 4. アーキテクチャ詳解

### 4-1. ウィンドウ構成

```
tauri.conf.json
  decorations: false   → ネイティブタイトルバーなし
  transparent: true    → ウィンドウ背景を透過
  alwaysOnTop: true    → 常に最前面（起動時デフォルト）
```

フロントエンド側で `data-tauri-drag-region` 属性を持つ `<div>` がドラッグ移動を担います（[TitleBar.tsx](src/components/TitleBar.tsx)）。

### 4-2. 透明度の自動制御

```
App.tsx
  getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    document.documentElement.style.opacity = focused ? "1" : settings.inactive_opacity
  })
```

CSS `opacity` をルート要素に適用することで、ウィンドウ全体を半透明化します。

### 4-3. 状態管理（Zustand）

```
appStore      currentPage: "editor" | "settings" | "search"
              → TitleBar のナビゲーションで切り替え

settingsStore settings: Settings
              → 起動時に DB から loadSettings()
              → SettingsPage で編集・saveSettings()

editorStore   meeting + cards + isDirty + llmResult
              → EditorPage で編集
              → saveMeeting() → invoke("save_meeting")
              → loadMeeting(id) → invoke("get_meeting")
```

### 4-4. Tauri IPC 通信

```
フロントエンド (TypeScript)          Rust
─────────────────────────────────────────────────────
invoke("get_settings")          →  get_settings()
invoke("save_settings", {...})  →  save_settings(settings)
invoke("save_meeting", {...})   →  save_meeting(meeting, cards)
invoke("get_meeting", {id})     →  get_meeting(id)
invoke("get_meetings_list")     →  get_meetings_list()
invoke("delete_meeting", {id})  →  delete_meeting(id)
invoke("search_meetings", {q})  →  search_meetings(query)
invoke("test_llm_connection")   →  test_llm_connection(endpoint, api_key)
invoke("generate_summary_stream")→  generate_summary_stream(...)

Rust → フロントエンド（イベント）
  app.emit("llm-stream-chunk", {chunk, done})
  listen("llm-stream-chunk", handler)  ← EditorPage.tsx
```

### 4-5. LLM ストリーミングフロー

```
[EditorPage] invoke("generate_summary_stream")
    │
    ▼ [Rust: tokio async]
reqwest::Client（no_proxy）
    │  POST {endpoint}
    │  body: { model, messages, stream: true }
    │
    ▼ SSE ストリーム受信
remainder バッファで行境界をまたいで蓄積
    │  "data: {...delta.content...}\n" を解析
    ▼
app.emit("llm-stream-chunk", {chunk: "文字列", done: false})
    ↓ × N
app.emit("llm-stream-chunk", {done: true})
    │
    ▼ [React: listen("llm-stream-chunk")]
appendLlmResult(chunk) → リアルタイム表示
```

---

## 5. データベース

### スキーマ

```sql
-- 議事録
CREATE TABLE meetings (
    id          TEXT PRIMARY KEY,       -- UUID
    title       TEXT NOT NULL DEFAULT '',
    held_at     TEXT NOT NULL DEFAULT '',
    action_items TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,          -- RFC3339
    updated_at  TEXT NOT NULL           -- RFC3339
);

-- アジェンダカード（論点）
CREATE TABLE agenda_cards (
    id          TEXT PRIMARY KEY,       -- UUID
    meeting_id  TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

-- 設定（シングルトン、id=1 固定）
CREATE TABLE settings (
    id               INTEGER PRIMARY KEY CHECK (id = 1),
    llm_api_key      TEXT    NOT NULL DEFAULT '',
    llm_endpoint     TEXT    NOT NULL DEFAULT '',
    llm_model        TEXT    NOT NULL DEFAULT 'gpt-4o-mini',
    prompt_template  TEXT    NOT NULL DEFAULT '...',
    always_on_top    INTEGER NOT NULL DEFAULT 1,
    auto_transparent INTEGER NOT NULL DEFAULT 1,
    inactive_opacity REAL    NOT NULL DEFAULT 0.6
);

-- 全文検索インデックス（FTS5）
CREATE VIRTUAL TABLE meetings_fts USING fts5(
    meeting_id UNINDEXED,   -- 検索対象外（JOIN キーとして使用）
    title,                  -- 議事録タイトル
    content,                -- 全カードのテキストを結合した内容
    tokenize='unicode61'    -- 日本語 Unicode 対応
);
```

### データ保存場所

```
Windows: %APPDATA%\com.gijimemo.app\gijimemo.db
macOS:   ~/Library/Application Support/com.gijimemo.app/gijimemo.db
Linux:   ~/.local/share/com.gijimemo.app/gijimemo.db
```

### マイグレーション方針

現状はアプリ起動時に `ALTER TABLE ... ADD COLUMN` を実行し、すでにカラムが存在するエラーを無視する方式です。

```rust
// db.rs
let _ = conn.execute_batch(
    "ALTER TABLE settings ADD COLUMN llm_model TEXT NOT NULL DEFAULT 'gpt-4o-mini';"
);
```

カラムを追加する際はこのブロックに追記してください。

---

## 6. IPC コマンド一覧

### `get_settings() → Settings`

設定を DB から取得します。

### `save_settings(settings: Settings) → ()`

設定を DB に保存します。

### `save_meeting(meeting: Meeting, cards: Vec<AgendaCard>) → String`

議事録とカードをトランザクション内で保存し、`meeting.id` を返します。
- `id` が空の場合は新規 UUID を発行
- カードは一度全削除して再挿入（order_index の整合性を保つため）
- FTS5 インデックスを同時に更新

### `get_meeting(id: String) → MeetingWithCards`

指定 ID の議事録とカード一覧（order_index 昇順）を返します。

### `get_meetings_list() → Vec<MeetingListItem>`

全議事録の一覧（updated_at 降順）を返します。

### `delete_meeting(id: String) → ()`

議事録を削除します。CASCADE によりカードも削除されます。FTS5 インデックスも削除します。

### `search_meetings(query: String) → Vec<MeetingListItem>`

FTS5 全文検索を実行します。結果は関連度（`rank`）順です。
クエリはフレーズ検索（`"..."` でラップ）されます。

### `test_llm_connection(endpoint: String, api_key: String) → String`

最小リクエストで接続テストを行い、結果文字列を返します。
プロキシをバイパスして直接接続します。

### `generate_summary_stream(endpoint, api_key, model, prompt) → ()`

SSE ストリーミングでLLM APIを呼び出し、チャンクを `llm-stream-chunk` イベントで逐次フロントエンドに送信します。
プロキシをバイパスして直接接続します。

---

## 7. トラブルシューティング

### `cargo check` でエラーが出る

```bash
# Rust ツールチェーンを最新に更新
rustup update stable

# ロックファイルを無視して依存を再取得
cd src-tauri && cargo update
```

### `npm run tauri dev` でウィンドウが開かない

1. ポート 1420 が他のプロセスに使われていないか確認
   ```bash
   netstat -ano | findstr 1420    # Windows
   lsof -i :1420                  # macOS/Linux
   ```
2. WebView2 ランタイムがインストールされているか確認（Windows）

### アプリが透過にならない

- Windows 11 ではほぼ問題なし
- Windows 10 では「システム > ディスプレイ > 透明効果」が ON になっているか確認

### LLM 接続テストが失敗する

| エラー | 原因 | 対処 |
|--------|------|------|
| `接続失敗: ...connection refused` | エンドポイントが起動していない | LLM サービスの起動を確認 |
| `HTTP 401` | API Key が間違い | Key を確認 |
| `HTTP 404` | エンドポイント URL が間違い | `/v1/chat/completions` まで含めているか確認 |
| タイムアウト | プロキシを経由している | URL が正しいか確認（no_proxy は自動適用済み）|

### DB が壊れた場合

```bash
# DB ファイルを削除するとアプリ起動時に再作成されます（データは消えます）
# Windows
Remove-Item "$env:APPDATA\com.gijimemo.app\gijimemo.db"
```

---

## 8. ビルドとリリース

### プロダクションビルド

```bash
npm run tauri build
```

#### 成果物の場所

| プラットフォーム | 形式 | パス |
|----------------|------|------|
| Windows | `.msi` インストーラ | `src-tauri/target/release/bundle/msi/` |
| Windows | `.exe` 単体 | `src-tauri/target/release/bundle/nsis/` |
| macOS | `.dmg` | `src-tauri/target/release/bundle/dmg/` |
| macOS | `.app` | `src-tauri/target/release/bundle/macos/` |
| Linux | `.deb` | `src-tauri/target/release/bundle/deb/` |
| Linux | `.AppImage` | `src-tauri/target/release/bundle/appimage/` |

### アイコンの差し替え

`src-tauri/icons/` 以下のファイルを差し替えてください。
Tauri 公式ツールで一括生成できます。

```bash
# 1024x1024 の PNG を用意した上で実行
npx tauri icon path/to/icon.png
```

### バージョンの更新

```
package.json          → "version"
src-tauri/Cargo.toml  → [package] version
src-tauri/tauri.conf.json → "version"
```

3 箇所を揃えてからビルドしてください。
