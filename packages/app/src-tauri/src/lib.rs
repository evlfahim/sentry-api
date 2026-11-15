//! Tauri app library for sentry-api desktop.
//!
//! The UI uses the browser-safe part of `@sentry-api/core` (request building,
//! history, diffing). The commands below provide the host capabilities the
//! webview cannot do itself: sending HTTP requests without CORS limits,
//! reading collection folders, and persisting history to the app data dir.

use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Manager;

const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_REDIRECTS: usize = 5;
const HISTORY_FILE: &str = "history.json";
const COLLECTION_FILE: &str = "collection.json";

/// Mirrors `RequestOptions` from the core library.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    method: String,
    url: String,
    #[serde(default)]
    headers: Option<HashMap<String, String>>,
    #[serde(default)]
    query: Option<HashMap<String, String>>,
    #[serde(default)]
    body: Option<Value>,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

/// Raw response handed back to the UI, which converts it into a core `Response`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
    duration_ms: u64,
}

/// Sends an HTTP request. Any HTTP status is a successful result; only
/// transport failures (DNS, connection, timeout, invalid input) are errors.
#[tauri::command]
async fn send_http_request(request: HttpRequest) -> Result<HttpResponse, String> {
    let method = reqwest::Method::from_bytes(request.method.trim().to_uppercase().as_bytes())
        .map_err(|_| format!("Invalid HTTP method: {}", request.method))?;

    let url = request.url.trim();
    if url.is_empty() {
        return Err("URL is required".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(
            request.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS),
        ))
        .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
        .build()
        .map_err(describe_error)?;

    let mut builder = client.request(method, url);

    if let Some(query) = request.query.filter(|q| !q.is_empty()) {
        builder = builder.query(&query);
    }

    let headers = request.headers.unwrap_or_default();
    let has_content_type = headers
        .keys()
        .any(|k| k.eq_ignore_ascii_case("content-type"));
    for (name, value) in &headers {
        builder = builder.header(name.as_str(), value.as_str());
    }

    match request.body {
        None | Some(Value::Null) => {}
        Some(Value::String(text)) => {
            builder = builder.body(text);
        }
        Some(other) => {
            if !has_content_type {
                builder = builder.header("Content-Type", "application/json");
            }
            let json = serde_json::to_string(&other).map_err(|e| e.to_string())?;
            builder = builder.body(json);
        }
    }

    let start = Instant::now();
    let response = builder.send().await.map_err(describe_error)?;
    let status = response.status();

    let mut response_headers: HashMap<String, String> = HashMap::new();
    for (name, value) in response.headers() {
        let value = String::from_utf8_lossy(value.as_bytes()).into_owned();
        match response_headers.get_mut(name.as_str()) {
            Some(existing) => {
                existing.push_str(", ");
                existing.push_str(&value);
            }
            None => {
                response_headers.insert(name.as_str().to_string(), value);
            }
        }
    }

    let bytes = response.bytes().await.map_err(describe_error)?;
    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(HttpResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers: response_headers,
        body: String::from_utf8_lossy(&bytes).into_owned(),
        duration_ms,
    })
}

fn describe_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        return "Request timeout".to_string();
    }
    let mut message = error.to_string();
    let mut source = std::error::Error::source(&error);
    while let Some(inner) = source {
        message.push_str(": ");
        message.push_str(&inner.to_string());
        source = inner.source();
    }
    message
}

/// Lists collections in `base_path`, using the same one-file-per-request
/// layout as the core library: each collection is a folder containing
/// `collection.json` plus one JSON file per request (subfolders allowed).
/// If `base_path` is itself a collection folder it is returned on its own.
#[tauri::command]
fn list_collections(base_path: String) -> Result<Vec<Value>, String> {
    read_collections(Path::new(&base_path))
}

fn read_collections(base: &Path) -> Result<Vec<Value>, String> {
    if !base.is_dir() {
        return Err(format!("Not a folder: {}", base.display()));
    }

    if base.join(COLLECTION_FILE).is_file() {
        return Ok(read_collection(base).into_iter().collect());
    }

    let mut collections = Vec::new();
    for dir in sorted_entries(base)? {
        if dir.is_dir() && dir.join(COLLECTION_FILE).is_file() {
            // Skip corrupted collections, like the core library does.
            if let Ok(collection) = read_collection(&dir) {
                collections.push(collection);
            }
        }
    }
    Ok(collections)
}

fn read_collection(folder: &Path) -> Result<Value, String> {
    let meta_path = folder.join(COLLECTION_FILE);
    let text = fs::read_to_string(&meta_path)
        .map_err(|e| format!("{}: {e}", meta_path.display()))?;
    let mut meta: Value = serde_json::from_str(&text)
        .map_err(|e| format!("{}: {e}", meta_path.display()))?;
    let object = meta
        .as_object_mut()
        .ok_or_else(|| format!("{}: expected a JSON object", meta_path.display()))?;

    let folder_name = folder
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    object
        .entry("id")
        .or_insert_with(|| Value::String(folder_name.clone()));
    object
        .entry("name")
        .or_insert_with(|| Value::String(folder_name));

    let mut requests = Vec::new();
    read_request_files(folder, &mut requests)?;
    object.insert("requests".to_string(), Value::Array(requests));
    object.insert(
        "path".to_string(),
        Value::String(folder.to_string_lossy().into_owned()),
    );

    Ok(meta)
}

fn read_request_files(folder: &Path, requests: &mut Vec<Value>) -> Result<(), String> {
    for entry in sorted_entries(folder)? {
        if entry.is_dir() {
            read_request_files(&entry, requests)?;
            continue;
        }
        let is_request = entry.extension().map_or(false, |ext| ext == "json")
            && entry.file_name().map_or(false, |name| name != COLLECTION_FILE);
        if !is_request {
            continue;
        }
        // Unreadable or invalid request files are skipped so one bad file
        // does not hide the rest of the collection.
        let Ok(text) = fs::read_to_string(&entry) else {
            continue;
        };
        let Ok(mut request) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        if let Some(object) = request.as_object_mut() {
            if !object.contains_key("id") {
                let stem = entry
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                object.insert("id".to_string(), Value::String(stem));
            }
            requests.push(request);
        }
    }
    Ok(())
}

fn sorted_entries(folder: &Path) -> Result<Vec<PathBuf>, String> {
    let mut entries: Vec<PathBuf> = fs::read_dir(folder)
        .map_err(|e| format!("{}: {e}", folder.display()))?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .collect();
    entries.sort();
    Ok(entries)
}

fn history_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(HISTORY_FILE))
}

/// Returns the serialized history store, or `None` if nothing was saved yet.
#[tauri::command]
fn load_history(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = history_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

/// Persists the serialized history store (produced by core `serializeHistory`).
#[tauri::command]
fn save_history(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = history_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    fs::write(&path, contents).map_err(|e| format!("{}: {e}", path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            send_http_request,
            list_collections,
            load_history,
            save_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running sentry-api");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sentry-api-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_one_file_per_request_collections() {
        let base = temp_dir("collections");
        let users = base.join("users");
        fs::create_dir_all(users.join("admin")).unwrap();
        fs::write(
            users.join(COLLECTION_FILE),
            r#"{"id":"users","name":"Users","updated":"2026-01-01T00:00:00.000Z"}"#,
        )
        .unwrap();
        fs::write(
            users.join("list.json"),
            r#"{"id":"list","name":"List users","method":"GET","url":"{{baseUrl}}/users","updated":"2026-01-01T00:00:00.000Z"}"#,
        )
        .unwrap();
        fs::write(
            users.join("admin").join("create.json"),
            r#"{"name":"Create","method":"POST","url":"/admin","updated":"2026-01-01T00:00:00.000Z"}"#,
        )
        .unwrap();
        fs::write(users.join("broken.json"), "{not json").unwrap();
        // Folder without collection.json is ignored.
        fs::create_dir_all(base.join("not-a-collection")).unwrap();

        let collections = read_collections(&base).unwrap();
        assert_eq!(collections.len(), 1);
        let users = &collections[0];
        assert_eq!(users["name"], "Users");
        let requests = users["requests"].as_array().unwrap();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0]["id"], "create");
        assert_eq!(requests[1]["id"], "list");

        // Opening the collection folder directly returns just that collection.
        let direct = read_collections(&base.join("users")).unwrap();
        assert_eq!(direct.len(), 1);
        assert_eq!(direct[0]["id"], "users");

        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn missing_folder_is_an_error() {
        let base = temp_dir("missing").join("does-not-exist");
        assert!(read_collections(&base).is_err());
    }
}
