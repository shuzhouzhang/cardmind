import { invoke } from "@tauri-apps/api/core";
import type { CardRelation, Conversation, KnowledgeCard, KnowledgeGraph } from "./types";

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
  }
};
