mod extractor;
mod models;
mod openai;
mod repository;

use repository::CardMindRepository;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

#[derive(Clone)]
struct AppState {
    db_path: PathBuf,
}

impl AppState {
    fn repository(&self) -> Result<CardMindRepository, String> {
        CardMindRepository::open(self.db_path.clone()).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn create_conversation(
    state: State<'_, AppState>,
    input: models::CreateConversationInput,
) -> Result<models::Conversation, String> {
    state.repository()?.create_conversation(input)
}

#[tauri::command]
fn list_conversations(state: State<'_, AppState>) -> Result<Vec<models::Conversation>, String> {
    state.repository()?.list_conversations()
}

#[tauri::command]
fn get_conversation(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<models::Conversation>, String> {
    state.repository()?.get_conversation(&id)
}

#[tauri::command]
fn extract_conversation(
    state: State<'_, AppState>,
    id: String,
) -> Result<models::PersistedExtraction, String> {
    let mut repository = state.repository()?;
    repository.extract_conversation(&id)
}

#[tauri::command]
fn preview_extraction(
    state: State<'_, AppState>,
    id: String,
) -> Result<models::ExtractionPreview, String> {
    state.repository()?.preview_extraction(&id)
}

#[tauri::command]
fn confirm_extraction(
    state: State<'_, AppState>,
    input: models::ConfirmExtractionInput,
) -> Result<models::PersistedExtraction, String> {
    let mut repository = state.repository()?;
    repository.confirm_extraction(input)
}

#[tauri::command]
fn list_cards(state: State<'_, AppState>) -> Result<Vec<models::KnowledgeCard>, String> {
    state.repository()?.list_cards()
}

#[tauri::command]
fn get_card(state: State<'_, AppState>, id: String) -> Result<Option<models::KnowledgeCard>, String> {
    state.repository()?.get_card(&id)
}

#[tauri::command]
fn update_card(
    state: State<'_, AppState>,
    input: models::UpdateCardInput,
) -> Result<models::KnowledgeCard, String> {
    state.repository()?.update_card(input)
}

#[tauri::command]
fn delete_card(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.repository()?.delete_card(&id)
}

#[tauri::command]
fn merge_cards(
    state: State<'_, AppState>,
    input: models::MergeCardsInput,
) -> Result<models::KnowledgeCard, String> {
    state.repository()?.merge_cards(input)
}

#[tauri::command]
fn search_cards(
    state: State<'_, AppState>,
    input: models::SearchCardsInput,
) -> Result<models::SearchCardsResult, String> {
    state.repository()?.search_cards(input)
}

#[tauri::command]
fn list_relations(state: State<'_, AppState>) -> Result<Vec<models::CardRelation>, String> {
    state.repository()?.list_relations()
}

#[tauri::command]
fn create_relation(
    state: State<'_, AppState>,
    input: models::CreateRelationInput,
) -> Result<models::CardRelation, String> {
    state.repository()?.create_relation(input)
}

#[tauri::command]
fn update_relation(
    state: State<'_, AppState>,
    input: models::UpdateRelationInput,
) -> Result<models::CardRelation, String> {
    state.repository()?.update_relation(input)
}

#[tauri::command]
fn delete_relation(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.repository()?.delete_relation(&id)
}

#[tauri::command]
fn get_graph(state: State<'_, AppState>) -> Result<models::KnowledgeGraph, String> {
    state.repository()?.get_graph()
}

#[tauri::command]
fn export_card_markdown(state: State<'_, AppState>, id: String) -> Result<String, String> {
    state.repository()?.export_card_markdown(&id)
}

#[tauri::command]
fn export_all_cards_markdown(state: State<'_, AppState>) -> Result<String, String> {
    state.repository()?.export_all_cards_markdown()
}

#[tauri::command]
fn export_card_markdown_file(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    state
        .repository()?
        .export_card_markdown_file(&id, export_dir(&app)?)
}

#[tauri::command]
fn export_all_cards_markdown_file(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state
        .repository()?
        .export_all_cards_markdown_file(export_dir(&app)?)
}

#[tauri::command]
fn create_database_backup(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<models::BackupInfo, String> {
    state.repository()?.create_database_backup(backup_dir(&app)?)
}

#[tauri::command]
fn list_database_backups(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<models::BackupInfo>, String> {
    state.repository()?.list_database_backups(backup_dir(&app)?)
}

#[tauri::command]
fn restore_database_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let backup_path = PathBuf::from(path);
    if !backup_path.exists() {
        return Err("备份文件不存在。".to_string());
    }

    let safety_dir = backup_dir(&app)?;
    std::fs::create_dir_all(&safety_dir).map_err(|error| error.to_string())?;
    let safety_path = safety_dir.join(format!(
        "cardmind-before-restore-{}.sqlite",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    ));
    std::fs::copy(&state.db_path, safety_path).map_err(|error| error.to_string())?;
    std::fs::copy(backup_path, &state.db_path).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_card_relations(
    state: State<'_, AppState>,
    card_id: String,
) -> Result<Vec<models::CardRelation>, String> {
    state.repository()?.get_card_relations(&card_id)
}

#[tauri::command]
fn seed_sample_data(state: State<'_, AppState>) -> Result<models::PersistedExtraction, String> {
    let mut repository = state.repository()?;
    repository.seed_sample_data()
}

#[tauri::command]
fn get_openai_status(state: State<'_, AppState>) -> Result<models::OpenAiStatus, String> {
    state.repository()?.openai_status()
}

#[tauri::command]
fn test_openai_connection(
    state: State<'_, AppState>,
) -> Result<models::OpenAiConnectionTest, String> {
    state.repository()?.test_openai_connection()
}

#[tauri::command]
fn save_openai_api_key(
    state: State<'_, AppState>,
    input: models::SaveOpenAiApiKeyInput,
) -> Result<models::OpenAiStatus, String> {
    state.repository()?.save_openai_api_key(&input.api_key)
}

#[tauri::command]
fn clear_openai_api_key(state: State<'_, AppState>) -> Result<models::OpenAiStatus, String> {
    state.repository()?.clear_openai_api_key()
}

#[tauri::command]
fn set_openai_model(
    state: State<'_, AppState>,
    input: models::SetOpenAiModelInput,
) -> Result<models::OpenAiStatus, String> {
    state.repository()?.set_openai_model(&input.model)
}

fn export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let e_drive_exports = PathBuf::from(r"E:\CardMind\exports");
    if PathBuf::from(r"E:\").exists() {
        return Ok(e_drive_exports);
    }

    Ok(app
        .path()
        .document_dir()
        .map_err(|error| format!("无法定位 Documents 目录：{error}"))?
        .join("CardMind")
        .join("exports"))
}

fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .document_dir()
        .map_err(|error| format!("无法定位 Documents 目录：{error}"))?
        .join("CardMind")
        .join("backups"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|error| format!("Unable to create app data directory: {error}"))?;

            let db_path = app_data_dir.join("cardmind.sqlite");
            CardMindRepository::open(db_path.clone())
                .map_err(|error| format!("Unable to initialize database: {error}"))?;

            app.manage(AppState { db_path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_conversation,
            list_conversations,
            get_conversation,
            extract_conversation,
            preview_extraction,
            confirm_extraction,
            list_cards,
            get_card,
            update_card,
            delete_card,
            merge_cards,
            search_cards,
            list_relations,
            create_relation,
            update_relation,
            delete_relation,
            get_graph,
            export_card_markdown,
            export_all_cards_markdown,
            export_card_markdown_file,
            export_all_cards_markdown_file,
            create_database_backup,
            list_database_backups,
            restore_database_backup,
            get_card_relations,
            seed_sample_data,
            get_openai_status,
            test_openai_connection,
            save_openai_api_key,
            clear_openai_api_key,
            set_openai_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running CardMind");
}
