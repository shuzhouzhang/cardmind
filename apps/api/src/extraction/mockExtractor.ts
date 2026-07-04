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
  relation_type: "prerequisite" | "contains" | "related" | "contrast" | "application" | "source";
  reason: string;
  confidence: number;
}

export interface ExtractionResult {
  cards: ExtractedCardDraft[];
  relations: ExtractedRelationDraft[];
}

// Replace this service with an LLM-backed extractor later; API and database layers depend only on this return shape.
export function extractKnowledgeCards(_conversationText: string): ExtractionResult {
  return {
    cards: [],
    relations: []
  };
}
