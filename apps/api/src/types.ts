export type RelationType =
  | "prerequisite"
  | "contains"
  | "related"
  | "contrast"
  | "application"
  | "source";

export type MasteryStatus = "new" | "learning" | "mastered";

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
  mastery_status: MasteryStatus;
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

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  summary: string;
  tags: string[];
  mastery_status: MasteryStatus;
  source_conversation_id: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: RelationType;
  reason: string;
  confidence: number;
}
