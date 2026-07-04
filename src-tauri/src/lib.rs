mod extractor;
mod models;
mod openai;
mod repository;

use repository::CardMindRepository;
use std::path::PathBuf;
use tauri::{Manager, State};

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
fn list_relations(state: State<'_, AppState>) -> Result<Vec<models::CardRelation>, String> {
    state.repository()?.list_relations()
}

#[tauri::command]
fn get_graph(state: State<'_, AppState>) -> Result<models::KnowledgeGraph, String> {
    state.repository()?.get_graph()
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            list_relations,
            get_graph,
            get_card_relations,
            seed_sample_data,
            get_openai_status,
            save_openai_api_key,
            clear_openai_api_key,
            set_openai_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running CardMind");
}
