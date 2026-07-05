use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct CreateConversationInput {
    pub title: Option<String>,
    pub raw_content: String,
    pub source_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub raw_content: String,
    pub source_type: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct KnowledgeCard {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub content: String,
    pub r#type: String,
    pub tags: Vec<String>,
    pub mastery_status: String,
    pub source_conversation_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardRelation {
    pub id: String,
    pub source_card_id: String,
    pub target_card_id: String,
    pub relation_type: String,
    pub reason: String,
    pub confidence: f64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedCardDraft {
    pub title: String,
    pub summary: String,
    pub content: String,
    pub r#type: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedRelationDraft {
    pub source_title: String,
    pub target_title: String,
    pub relation_type: String,
    pub reason: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionResult {
    pub cards: Vec<ExtractedCardDraft>,
    pub relations: Vec<ExtractedRelationDraft>,
}

#[derive(Debug, Serialize)]
pub struct PersistedExtraction {
    pub cards: Vec<KnowledgeCard>,
    pub relations: Vec<CardRelation>,
}

#[derive(Debug, Serialize)]
pub struct ExtractionPreview {
    pub cards: Vec<ExtractedCardDraft>,
    pub relations: Vec<ExtractedRelationDraft>,
    pub provider: String,
    pub warning: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmExtractionInput {
    pub conversation_id: String,
    pub cards: Vec<ExtractedCardDraft>,
    pub relations: Vec<ExtractedRelationDraft>,
}

#[derive(Debug, Serialize)]
pub struct OpenAiStatus {
    pub has_api_key: bool,
    pub key_source: Option<String>,
    pub model: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveOpenAiApiKeyInput {
    pub api_key: String,
}

#[derive(Debug, Deserialize)]
pub struct SetOpenAiModelInput {
    pub model: String,
}

#[derive(Debug, Deserialize)]
pub struct SearchCardsInput {
    pub query: String,
    pub tag: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCardInput {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub content: String,
    pub r#type: String,
    pub tags: Vec<String>,
    pub mastery_status: String,
}

#[derive(Debug, Serialize)]
pub struct SearchCardsResult {
    pub cards: Vec<KnowledgeCard>,
    pub engine: String,
}

#[derive(Debug, Serialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub r#type: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub mastery_status: String,
    pub source_conversation_id: String,
}

#[derive(Debug, Serialize)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: String,
    pub reason: String,
    pub confidence: f64,
}

#[derive(Debug, Serialize)]
pub struct KnowledgeGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}
