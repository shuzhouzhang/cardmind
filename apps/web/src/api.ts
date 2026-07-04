import { invoke } from "@tauri-apps/api/core";
import type {
  CardRelation,
  Conversation,
  ExtractedCardDraft,
  ExtractedRelationDraft,
  ExtractionPreview,
  KnowledgeCard,
  KnowledgeGraph,
  OpenAiStatus
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    },
    ...options
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function getRequiredCard(id: string) {
  const card = await invoke<KnowledgeCard | null>("get_card", { id });
  if (!card) {
    throw new Error("Knowledge card not found");
  }

  return card;
}

export const api = {
  createConversation(input: { raw_content: string; source_type?: string; title?: string }) {
    if (isTauriRuntime()) {
      return invoke<Conversation>("create_conversation", { input });
    }

    return request<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  listConversations() {
    if (isTauriRuntime()) {
      return invoke<Conversation[]>("list_conversations");
    }

    return request<Conversation[]>("/api/conversations");
  },
  extractConversation(id: string) {
    if (isTauriRuntime()) {
      return invoke<{ cards: KnowledgeCard[]; relations: CardRelation[] }>("extract_conversation", { id });
    }

    return request<{ cards: KnowledgeCard[]; relations: CardRelation[] }>(`/api/conversations/${id}/extract`, {
      method: "POST"
    });
  },
  previewExtraction(id: string): Promise<ExtractionPreview> {
    if (isTauriRuntime()) {
      return invoke<ExtractionPreview>("preview_extraction", { id });
    }

    return this.extractConversation(id).then((result) => ({
      cards: result.cards,
      relations: result.relations.map((relation) => ({
        source_title: relation.source_card_id,
        target_title: relation.target_card_id,
        relation_type: relation.relation_type,
        reason: relation.reason,
        confidence: relation.confidence
      })),
      provider: "legacy",
      warning: undefined
    }));
  },
  confirmExtraction(input: {
    conversation_id: string;
    cards: ExtractedCardDraft[];
    relations: ExtractedRelationDraft[];
  }) {
    if (isTauriRuntime()) {
      return invoke<{ cards: KnowledgeCard[]; relations: CardRelation[] }>("confirm_extraction", { input });
    }

    return Promise.resolve({ cards: [], relations: [] });
  },
  listCards() {
    if (isTauriRuntime()) {
      return invoke<KnowledgeCard[]>("list_cards");
    }

    return request<KnowledgeCard[]>("/api/cards");
  },
  getCard(id: string) {
    if (isTauriRuntime()) {
      return getRequiredCard(id);
    }

    return request<KnowledgeCard>(`/api/cards/${id}`);
  },
  getGraph() {
    if (isTauriRuntime()) {
      return invoke<KnowledgeGraph>("get_graph");
    }

    return request<KnowledgeGraph>("/api/graph");
  },
  listRelations() {
    if (isTauriRuntime()) {
      return invoke<CardRelation[]>("list_relations");
    }

    return request<CardRelation[]>("/api/relations");
  },
  getCardRelations(cardId: string) {
    if (isTauriRuntime()) {
      return invoke<CardRelation[]>("get_card_relations", { cardId });
    }

    return this.listRelations().then((relations) =>
      relations.filter((relation) => relation.source_card_id === cardId || relation.target_card_id === cardId)
    );
  },
  seedSampleData() {
    if (isTauriRuntime()) {
      return invoke<{ cards: KnowledgeCard[]; relations: CardRelation[] }>("seed_sample_data");
    }

    return Promise.reject(new Error("示例数据只能在桌面版中加载。"));
  },
  getOpenAiStatus() {
    if (isTauriRuntime()) {
      return invoke<OpenAiStatus>("get_openai_status");
    }

    return Promise.resolve({ has_api_key: false, model: "gpt-5.4-mini" });
  },
  saveOpenAiApiKey(apiKey: string) {
    if (isTauriRuntime()) {
      return invoke<OpenAiStatus>("save_openai_api_key", { input: { api_key: apiKey } });
    }

    return Promise.resolve({ has_api_key: false, model: "gpt-5.4-mini" });
  },
  clearOpenAiApiKey() {
    if (isTauriRuntime()) {
      return invoke<OpenAiStatus>("clear_openai_api_key");
    }

    return Promise.resolve({ has_api_key: false, model: "gpt-5.4-mini" });
  },
  setOpenAiModel(model: string) {
    if (isTauriRuntime()) {
      return invoke<OpenAiStatus>("set_openai_model", { input: { model } });
    }

    return Promise.resolve({ has_api_key: false, model });
  }
};
