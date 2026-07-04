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
  relation_type: string;
  reason: string;
  confidence: number;
  created_at: string;
}

export interface KnowledgeGraph {
  nodes: Array<{
    id: string;
    label: string;
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
