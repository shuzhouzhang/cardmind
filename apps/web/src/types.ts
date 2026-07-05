export interface Conversation {
  id: string;
  title: string;
  raw_content: string;
  source_type: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeCard {
  id: string;
  title: string;
  summary: string;
  content: string;
  type: string;
  tags: string[];
  mastery_status: "new" | "learning" | "mastered";
  source_conversation_id: string;
  created_at: string;
  updated_at: string;
}

export interface CardRelation {
  id: string;
  source_card_id: string;
  target_card_id: string;
  relation_type: RelationType;
  reason: string;
  confidence: number;
  created_at: string;
}

export interface CreateRelationInput {
  source_card_id: string;
  target_card_id: string;
  relation_type: RelationType;
  reason: string;
  confidence: number;
}

export interface UpdateRelationInput {
  id: string;
  relation_type: RelationType;
  reason: string;
  confidence: number;
}

export type RelationType =
  | "prerequisite"
  | "contains"
  | "related"
  | "contrast"
  | "application"
  | "source"
  | "supports";

export interface ExtractedCardDraft {
  title: string;
  summary: string;
  content: string;
  type: string;
  tags: string[];
}

export interface ExtractedRelationDraft {
  source_title: string;
  target_title: string;
  relation_type: RelationType;
  reason: string;
  confidence: number;
}

export interface ExtractionPreview {
  cards: ExtractedCardDraft[];
  relations: ExtractedRelationDraft[];
  provider: "openai" | "mock" | string;
  warning?: string | null;
}

export interface OpenAiStatus {
  has_api_key: boolean;
  key_source?: string | null;
  model: string;
}

export interface SearchCardsResult {
  cards: KnowledgeCard[];
  engine: "fts5" | "like" | string;
}

export interface BackupInfo {
  path: string;
  filename: string;
  created_at: string;
}

export interface UpdateCardInput {
  id: string;
  title: string;
  summary: string;
  content: string;
  type: string;
  tags: string[];
  mastery_status: KnowledgeCard["mastery_status"];
}

export interface MergeCardsInput {
  source_card_id: string;
  target_card_id: string;
}

export interface KnowledgeGraph {
  nodes: Array<{
    id: string;
    label: RelationType;
    type: string;
    summary: string;
    tags: string[];
    mastery_status: KnowledgeCard["mastery_status"];
    source_conversation_id: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
    reason: string;
    confidence: number;
  }>;
}
