import {
  BookOpen,
  BrainCircuit,
  Database,
  FilePlus2,
  Home,
  KeyRound,
  Network,
  Download,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { GraphView } from "./GraphView";
import type {
  CardRelation,
  Conversation,
  ExtractedCardDraft,
  ExtractedRelationDraft,
  ExtractionPreview,
  KnowledgeCard,
  OpenAiStatus,
  RelationType
} from "./types";

type View = "home" | "import" | "cards" | "graph";

function formatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

function parseTags(value: string) {
  return value
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatTags(tags: string[]) {
  return tags.join(", ");
}

const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: "home", label: "首页", icon: Home },
  { id: "import", label: "导入", icon: FilePlus2 },
  { id: "cards", label: "卡片", icon: BookOpen },
  { id: "graph", label: "图谱", icon: Network }
];

const relationLabels: Record<RelationType, string> = {
  prerequisite: "前置",
  contains: "包含",
  related: "相关",
  contrast: "对比",
  application: "应用",
  source: "来源",
  supports: "支持"
};

const masteryLabels: Record<KnowledgeCard["mastery_status"], string> = {
  new: "新知识",
  learning: "学习中",
  mastered: "已掌握"
};

export function App() {
  const [activeView, setActiveView] = useState<View>("home");
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [relations, setRelations] = useState<CardRelation[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("就绪");
  const [openAiStatus, setOpenAiStatus] = useState<OpenAiStatus | null>(null);

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedCardId) ?? cards[0],
    [cards, selectedCardId]
  );

  async function refreshData() {
    const [nextCards, nextConversations, nextRelations, nextOpenAiStatus] = await Promise.all([
      api.listCards(),
      api.listConversations(),
      api.listRelations(),
      api.getOpenAiStatus()
    ]);
    setCards(nextCards);
    setConversations(nextConversations);
    setRelations(nextRelations);
    setOpenAiStatus(nextOpenAiStatus);
    if (!selectedCardId && nextCards[0]) {
      setSelectedCardId(nextCards[0].id);
    }
  }

  async function seedSampleData() {
    setStatus("正在加载示例数据...");
    try {
      const result = await api.seedSampleData();
      await refreshData();
      setStatus(`已加载示例数据：${result.cards.length} 张卡片，${result.relations.length} 条关系`);
      setActiveView("cards");
    } catch (error) {
      setStatus(formatErrorMessage(error, "加载示例数据失败"));
    }
  }

  useEffect(() => {
    refreshData().catch((error: unknown) => {
      setStatus(formatErrorMessage(error, "无法读取 CardMind 数据"));
    });
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BrainCircuit aria-hidden="true" />
          <div>
            <strong>CardMind</strong>
            <span>本地优先知识图谱</span>
          </div>
        </div>
        <nav className="nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeView === item.id ? "nav-button active" : "nav-button"}
                type="button"
                onClick={() => setActiveView(item.id)}
                title={item.label}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <OpenAiSettings
          status={openAiStatus}
          onStatusChange={(nextStatus, message) => {
            setOpenAiStatus(nextStatus);
            setStatus(message);
          }}
        />
        <div className="status">{status}</div>
      </aside>

      <main className="main">
        {activeView === "home" && (
          <HomeView
            cards={cards}
            conversations={conversations}
            relations={relations}
            onImport={() => setActiveView("import")}
            onSeedSample={seedSampleData}
          />
        )}
        {activeView === "import" && (
          <ImportView
            onDone={async (message) => {
              setStatus(message);
              await refreshData();
            }}
          />
        )}
        {activeView === "cards" && (
          <CardsView
            cards={cards}
            relations={relations}
            selectedCard={selectedCard}
            onSelect={(card) => setSelectedCardId(card.id)}
            onImport={() => setActiveView("import")}
            onSeedSample={seedSampleData}
            onChanged={async (message, nextSelectedCardId) => {
              setStatus(message);
              await refreshData();
              setSelectedCardId(nextSelectedCardId ?? null);
            }}
          />
        )}
        {activeView === "graph" && (
          <GraphView
            cards={cards}
            relations={relations}
            selectedCard={selectedCard}
            onSelectCard={(card) => setSelectedCardId(card.id)}
            onImport={() => setActiveView("import")}
            onSeedSample={seedSampleData}
          />
        )}
      </main>
    </div>
  );
}

function HomeView({
  cards,
  conversations,
  relations,
  onImport,
  onSeedSample
}: {
  cards: KnowledgeCard[];
  conversations: Conversation[];
  relations: CardRelation[];
  onImport: () => void;
  onSeedSample: () => void;
}) {
  const hasData = conversations.length > 0 || cards.length > 0;

  return (
    <section className="view dashboard-view">
      <div className="hero-panel">
        <div>
          <p className="eyebrow">CardMind</p>
          <h1>把 AI 对话沉淀为可连接的知识卡片</h1>
          <p className="lede">导入一段 AI 对话，抽取知识点，生成卡片和关系，再用图谱看见你的学习结构。</p>
        </div>
        <div className="hero-actions">
          <button className="primary-action" type="button" onClick={onImport}>
            <FilePlus2 aria-hidden="true" />
            导入第一段 AI 对话
          </button>
          {!hasData && (
            <button className="secondary-action" type="button" onClick={onSeedSample}>
              <Database aria-hidden="true" />
              加载示例数据
            </button>
          )}
        </div>
      </div>

      <div className="metrics" aria-label="知识库统计">
        <MetricCard label="对话数量" value={conversations.length} />
        <MetricCard label="知识卡片数量" value={cards.length} />
        <MetricCard label="关系数量" value={relations.length} />
      </div>

      {!hasData ? (
        <EmptyState
          title="你还没有导入任何对话"
          body="先导入一段 AI 对话生成知识卡片，或者加载示例数据直接体验卡片和图谱。"
          actionLabel="去导入"
          onAction={onImport}
          secondaryLabel="加载示例数据"
          onSecondary={onSeedSample}
        />
      ) : (
        <div className="dashboard-grid">
          <RecentPanel title="最近导入的对话" emptyText="还没有对话">
            {conversations.slice(0, 5).map((conversation) => (
              <div className="recent-item" key={conversation.id}>
                <strong>{conversation.title}</strong>
                <span>{conversation.source_type} · {formatDate(conversation.created_at)}</span>
              </div>
            ))}
          </RecentPanel>
          <RecentPanel title="最近生成的知识卡片" emptyText="还没有卡片">
            {cards.slice(0, 5).map((card) => (
              <div className="recent-item" key={card.id}>
                <strong>{card.title}</strong>
                <span>{card.summary}</span>
              </div>
            ))}
          </RecentPanel>
        </div>
      )}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{value}</span>
      <small>{label}</small>
    </div>
  );
}

function ImportView({ onDone }: { onDone: (message: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [preview, setPreview] = useState<ExtractionPreview | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function saveConversation() {
    setIsBusy(true);
    try {
      const created = await api.createConversation({
        title: title.trim() || undefined,
        raw_content: rawContent,
        source_type: "manual"
      });
      setConversation(created);
      setPreview(null);
      await onDone(`已保存对话：${created.title}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function previewCards() {
    if (!conversation) {
      return;
    }

    setIsBusy(true);
    try {
      const nextPreview = await api.previewExtraction(conversation.id);
      setPreview(nextPreview);
      await onDone(
        nextPreview.warning ??
          `已生成预览：${nextPreview.cards.length} 张卡片，${nextPreview.relations.length} 条关系`
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmCards() {
    if (!conversation || !preview) {
      return;
    }

    setIsBusy(true);
    try {
      const result = await api.confirmExtraction({
        conversation_id: conversation.id,
        cards: preview.cards,
        relations: preview.relations
      });
      await onDone(`已保存 ${result.cards.length} 张知识卡片和 ${result.relations.length} 条关系`);
      setPreview(null);
      setConversation(null);
    } finally {
      setIsBusy(false);
    }
  }

  function updatePreviewCard(index: number, nextCard: ExtractedCardDraft) {
    setPreview((current) =>
      current
        ? {
            ...current,
            cards: current.cards.map((card, cardIndex) => (cardIndex === index ? nextCard : card))
          }
        : current
    );
  }

  function updatePreviewRelation(index: number, nextRelation: ExtractedRelationDraft) {
    setPreview((current) =>
      current
        ? {
            ...current,
            relations: current.relations.map((relation, relationIndex) =>
              relationIndex === index ? nextRelation : relation
            )
          }
        : current
    );
  }

  return (
    <section className="view import-view">
      <div className="section-head">
        <div>
          <p className="eyebrow">导入</p>
          <h2>粘贴一段 AI 对话</h2>
        </div>
        <button className="primary-action" type="button" disabled={isBusy || rawContent.trim().length === 0} onClick={saveConversation}>
          <FilePlus2 aria-hidden="true" />
          保存对话
        </button>
      </div>

      <div className="import-layout">
        <div className="import-editor">
          <label className="field-label" htmlFor="conversation-title">标题</label>
          <input
            id="conversation-title"
            className="text-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：本地优先知识系统讨论"
          />
          <label className="field-label" htmlFor="conversation-content">AI 对话内容</label>
          <textarea
            id="conversation-content"
            className="conversation-input"
            value={rawContent}
            onChange={(event) => setRawContent(event.target.value)}
            placeholder="把 ChatGPT、Claude 或其他 AI 对话粘贴到这里..."
          />
          <div className="import-actions">
            <span>{conversation ? `已保存来源：${conversation.id}` : "保存后可以开始抽取知识卡片"}</span>
            <button className="secondary-action" type="button" disabled={isBusy || !conversation} onClick={previewCards}>
              <Sparkles aria-hidden="true" />
              开始抽取知识卡片
            </button>
          </div>
        </div>

        <PreviewPanel
          preview={preview}
          isBusy={isBusy}
          onConfirm={confirmCards}
          onCardChange={updatePreviewCard}
          onRelationChange={updatePreviewRelation}
        />
      </div>
    </section>
  );
}

function PreviewPanel({
  preview,
  isBusy,
  onConfirm,
  onCardChange,
  onRelationChange
}: {
  preview: ExtractionPreview | null;
  isBusy: boolean;
  onConfirm: () => void;
  onCardChange: (index: number, card: ExtractedCardDraft) => void;
  onRelationChange: (index: number, relation: ExtractedRelationDraft) => void;
}) {
  if (!preview) {
    return (
      <aside className="preview-panel empty-state">
        <h3>等待抽取</h3>
        <p>保存对话后点击“开始抽取知识卡片”，这里会展示 AI 生成的卡片预览。</p>
      </aside>
    );
  }

  return (
    <aside className="preview-panel">
      <div className="section-head compact">
        <div>
          <p className="eyebrow">{preview.provider === "openai" ? "OpenAI 抽取" : "本地 mock 抽取"}</p>
          <h3>{preview.cards.length} 张卡片预览</h3>
        </div>
      </div>
      {preview.warning && <p className="warning-text">{preview.warning}</p>}
      <div className="preview-list">
        {preview.cards.map((card, index) => (
          <PreviewCard
            key={`${card.title}-${index}`}
            card={card}
            onChange={(nextCard) => onCardChange(index, nextCard)}
          />
        ))}
      </div>
      {preview.relations.length > 0 && (
        <div className="relation-preview">
          <h4>关系预览</h4>
          {preview.relations.map((relation, index) => (
            <PreviewRelation
              key={`${relation.source_title}-${relation.target_title}-${relation.relation_type}-${index}`}
              relation={relation}
              onChange={(nextRelation) => onRelationChange(index, nextRelation)}
            />
          ))}
        </div>
      )}
      <button className="primary-action full-width" type="button" disabled={isBusy} onClick={onConfirm}>
        确认保存这些卡片
      </button>
    </aside>
  );
}

function PreviewCard({
  card,
  onChange
}: {
  card: ExtractedCardDraft;
  onChange: (card: ExtractedCardDraft) => void;
}) {
  return (
    <div className="preview-card">
      <input
        className="text-input"
        value={card.title}
        onChange={(event) => onChange({ ...card, title: event.target.value })}
        placeholder="卡片标题"
      />
      <input
        className="text-input"
        value={card.summary}
        onChange={(event) => onChange({ ...card, summary: event.target.value })}
        placeholder="一句话解释"
      />
      <textarea
        className="compact-textarea"
        value={card.content}
        onChange={(event) => onChange({ ...card, content: event.target.value })}
        placeholder="完整内容"
      />
      <div className="inline-fields">
        <input
          className="text-input"
          value={card.type}
          onChange={(event) => onChange({ ...card, type: event.target.value })}
          placeholder="类型"
        />
        <input
          className="text-input"
          value={formatTags(card.tags)}
          onChange={(event) => onChange({ ...card, tags: parseTags(event.target.value) })}
          placeholder="标签，用逗号分隔"
        />
      </div>
    </div>
  );
}

function PreviewRelation({
  relation,
  onChange
}: {
  relation: ExtractedRelationDraft;
  onChange: (relation: ExtractedRelationDraft) => void;
}) {
  return (
    <div className="relation-editor">
      <input
        className="text-input"
        value={relation.source_title}
        onChange={(event) => onChange({ ...relation, source_title: event.target.value })}
        placeholder="来源卡片标题"
      />
      <select
        value={relation.relation_type}
        onChange={(event) => onChange({ ...relation, relation_type: event.target.value as RelationType })}
      >
        {Object.entries(relationLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        className="text-input"
        value={relation.target_title}
        onChange={(event) => onChange({ ...relation, target_title: event.target.value })}
        placeholder="目标卡片标题"
      />
      <input
        className="text-input"
        value={relation.reason}
        onChange={(event) => onChange({ ...relation, reason: event.target.value })}
        placeholder="关系理由"
      />
    </div>
  );
}

function CardsView({
  cards,
  relations,
  selectedCard,
  onSelect,
  onImport,
  onSeedSample,
  onChanged
}: {
  cards: KnowledgeCard[];
  relations: CardRelation[];
  selectedCard?: KnowledgeCard;
  onSelect: (card: KnowledgeCard) => void;
  onImport: () => void;
  onSeedSample: () => void;
  onChanged: (message: string, nextSelectedCardId?: string | null) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [visibleCards, setVisibleCards] = useState<KnowledgeCard[]>(cards);
  const [searchEngine, setSearchEngine] = useState<string>("本地列表");
  const [exportMarkdown, setExportMarkdown] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setVisibleCards(cards);
  }, [cards]);

  async function runSearch(nextQuery = query, nextTag = tagFilter) {
    setIsSearching(true);
    try {
      const result = await api.searchCards({ query: nextQuery, tag: nextTag || undefined });
      setVisibleCards(result.cards);
      setSearchEngine(result.engine === "fts5" ? "SQLite FTS5" : "LIKE");
    } finally {
      setIsSearching(false);
    }
  }

  async function exportAll() {
    const markdown = await api.exportAllCardsMarkdown();
    setExportMarkdown(markdown);
  }

  async function exportAllToFile() {
    const path = await api.exportAllCardsMarkdownFile();
    await onChanged(`已导出全部卡片到：${path}`, selectedCard?.id);
  }

  async function exportOne(card: KnowledgeCard) {
    const markdown = await api.exportCardMarkdown(card.id);
    setExportMarkdown(markdown);
  }

  async function exportOneToFile(card: KnowledgeCard) {
    const path = await api.exportCardMarkdownFile(card.id);
    await onChanged(`已导出卡片到：${path}`, card.id);
  }

  async function saveCard(card: KnowledgeCard) {
    const updated = await api.updateCard({
      id: card.id,
      title: card.title,
      summary: card.summary,
      content: card.content,
      type: card.type,
      tags: card.tags,
      mastery_status: card.mastery_status
    });
    await onChanged(`已更新卡片：${updated.title}`, updated.id);
  }

  async function deleteCard(card: KnowledgeCard) {
    await api.deleteCard(card.id);
    const nextCard = cards.find((item) => item.id !== card.id);
    await onChanged(`已删除卡片：${card.title}`, nextCard?.id ?? null);
  }

  if (cards.length === 0) {
    return (
      <section className="view">
        <EmptyState
          title="还没有知识卡片"
          body="导入一段 AI 对话并确认保存抽取结果后，知识卡片会出现在这里。"
          actionLabel="去导入"
          onAction={onImport}
          secondaryLabel="加载示例数据"
          onSecondary={onSeedSample}
        />
      </section>
    );
  }

  return (
    <section className="view cards-layout">
      <div className="card-list">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">卡片</p>
            <h2>{visibleCards.length} / {cards.length} 张知识卡片</h2>
          </div>
          <div className="toolbar-actions">
            <button className="secondary-action" type="button" onClick={exportAll}>
              <Download aria-hidden="true" />
              预览全部
            </button>
            <button className="primary-action" type="button" onClick={exportAllToFile}>
              <Save aria-hidden="true" />
              导出文件
            </button>
          </div>
        </div>
        <div className="search-panel">
          <div className="search-row">
            <Search aria-hidden="true" />
            <input
              className="text-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  runSearch();
                }
              }}
              placeholder="搜索标题、摘要或内容，例如 benchmark / Reactor / 简历"
            />
            <input
              className="tag-input"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="标签过滤"
            />
            <button className="primary-action" type="button" disabled={isSearching} onClick={() => runSearch()}>
              搜索
            </button>
          </div>
          <small>搜索引擎：{searchEngine}</small>
        </div>
        <div className="card-grid">
          {visibleCards.map((card) => (
            <button key={card.id} className="knowledge-card" type="button" onClick={() => onSelect(card)}>
              <div className="card-title-row">
                <span className="card-type">{card.type}</span>
                <small>{masteryLabels[card.mastery_status]}</small>
              </div>
              <strong>{card.title}</strong>
              <p>{card.summary}</p>
              <div className="tag-row">
                {card.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <small className="source-line">来源：{card.source_conversation_id}</small>
            </button>
          ))}
        </div>
        {visibleCards.length === 0 && <div className="empty-state">没有匹配的知识卡片。</div>}
        {exportMarkdown && (
          <div className="export-panel">
            <div className="section-head compact">
              <h3>Markdown 导出预览</h3>
              <button className="secondary-action" type="button" onClick={() => setExportMarkdown("")}>关闭</button>
            </div>
            <textarea readOnly value={exportMarkdown} />
          </div>
        )}
      </div>
      <CardDetail
        card={selectedCard}
        cards={cards}
        relations={relations}
        onExport={exportOne}
        onExportFile={exportOneToFile}
        onSave={saveCard}
        onDelete={deleteCard}
      />
    </section>
  );
}

export function CardDetail({
  card,
  cards = [],
  relations = []
  ,
  onExport,
  onExportFile,
  onSave,
  onDelete
}: {
  card?: KnowledgeCard;
  cards?: KnowledgeCard[];
  relations?: CardRelation[];
  onExport?: (card: KnowledgeCard) => void;
  onExportFile?: (card: KnowledgeCard) => void;
  onSave?: (card: KnowledgeCard) => Promise<void>;
  onDelete?: (card: KnowledgeCard) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<KnowledgeCard | null>(card ?? null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setDraft(card ?? null);
    setIsEditing(false);
  }, [card?.id]);

  if (!card) {
    return <aside className="detail-panel empty-state">选择一张卡片查看详情。</aside>;
  }

  const currentCard = card;
  const visibleCard = isEditing && draft ? draft : card;
  const relatedRelations = relations.filter(
    (relation) => relation.source_card_id === currentCard.id || relation.target_card_id === currentCard.id
  );

  async function saveDraft() {
    if (!draft || !onSave) {
      return;
    }

    setIsBusy(true);
    try {
      await onSave(draft);
      setIsEditing(false);
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteCurrentCard() {
    if (!onDelete) {
      return;
    }

    const confirmed = window.confirm(`确定删除知识卡片“${currentCard.title}”吗？相关关系也会被删除。`);
    if (!confirmed) {
      return;
    }

    setIsBusy(true);
    try {
      await onDelete(currentCard);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <aside className="detail-panel">
      {isEditing && draft ? (
        <div className="edit-form">
          <label className="field-label" htmlFor="card-title">标题</label>
          <input
            id="card-title"
            className="text-input"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <label className="field-label" htmlFor="card-summary">一句话解释</label>
          <input
            id="card-summary"
            className="text-input"
            value={draft.summary}
            onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
          />
          <label className="field-label" htmlFor="card-content">完整内容</label>
          <textarea
            id="card-content"
            className="compact-textarea tall"
            value={draft.content}
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
          />
          <div className="inline-fields">
            <div>
              <label className="field-label" htmlFor="card-type">类型</label>
              <input
                id="card-type"
                className="text-input"
                value={draft.type}
                onChange={(event) => setDraft({ ...draft, type: event.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="card-mastery">掌握状态</label>
              <select
                id="card-mastery"
                value={draft.mastery_status}
                onChange={(event) =>
                  setDraft({ ...draft, mastery_status: event.target.value as KnowledgeCard["mastery_status"] })
                }
              >
                {Object.entries(masteryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="field-label" htmlFor="card-tags">标签</label>
          <input
            id="card-tags"
            className="text-input"
            value={formatTags(draft.tags)}
            onChange={(event) => setDraft({ ...draft, tags: parseTags(event.target.value) })}
            placeholder="标签，用逗号分隔"
          />
          <div className="detail-actions">
            <button className="primary-action" type="button" disabled={isBusy} onClick={saveDraft}>
              <Save aria-hidden="true" />
              保存
            </button>
            <button className="secondary-action" type="button" disabled={isBusy} onClick={() => setIsEditing(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <span className="card-type">{visibleCard.type}</span>
          <h2>{visibleCard.title}</h2>
          <div className="detail-actions">
            <button className="secondary-action" type="button" onClick={() => setIsEditing(true)}>
              编辑
            </button>
            {onExport && (
              <button className="secondary-action" type="button" onClick={() => onExport(card)}>
                <Download aria-hidden="true" />
                预览
              </button>
            )}
            {onExportFile && (
              <button className="primary-action" type="button" onClick={() => onExportFile(card)}>
                <Save aria-hidden="true" />
                导出文件
              </button>
            )}
            {onDelete && (
              <button className="danger-action" type="button" disabled={isBusy} onClick={deleteCurrentCard}>
                <Trash2 aria-hidden="true" />
                删除
              </button>
            )}
          </div>
          <p className="summary">{visibleCard.summary}</p>
          <p>{visibleCard.content}</p>
          <div className="tag-row">
            {visibleCard.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <dl>
            <div>
              <dt>掌握状态</dt>
              <dd>{masteryLabels[visibleCard.mastery_status]}</dd>
            </div>
            <div>
              <dt>来源对话</dt>
              <dd>{visibleCard.source_conversation_id}</dd>
            </div>
          </dl>
        </>
      )}
      <div className="related-section">
        <h3>相关关系</h3>
        {relatedRelations.length === 0 ? (
          <p>暂无相关卡片。</p>
        ) : (
          relatedRelations.map((relation) => {
            const otherId = relation.source_card_id === card.id ? relation.target_card_id : relation.source_card_id;
            const otherCard = cards.find((item) => item.id === otherId);
            return (
              <div className="relation-item" key={relation.id}>
                <strong>{relationLabels[relation.relation_type]}</strong>
                <span>{otherCard?.title ?? otherId}</span>
                <small>{relation.reason}</small>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function OpenAiSettings({
  status,
  onStatusChange
}: {
  status: OpenAiStatus | null;
  onStatusChange: (status: OpenAiStatus, message: string) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function saveKey() {
    if (!apiKey.trim()) {
      onStatusChange(status ?? { has_api_key: false, model: "gpt-5.4-mini" }, "请先粘贴 OpenAI API Key。");
      return;
    }

    setIsBusy(true);
    try {
      const nextStatus = await api.saveOpenAiApiKey(apiKey);
      setApiKey("");
      onStatusChange(nextStatus, "OpenAI API Key 已保存到系统凭据。");
    } catch (error) {
      onStatusChange(
        status ?? { has_api_key: false, model: "gpt-5.4-mini" },
        `OpenAI API Key 保存失败：${formatErrorMessage(
          error,
          "无法写入 Windows Credential Manager，请改用环境变量 OPENAI_API_KEY。"
        )}`
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function clearKey() {
    setIsBusy(true);
    try {
      const nextStatus = await api.clearOpenAiApiKey();
      onStatusChange(nextStatus, "OpenAI API Key 已清除。");
    } catch (error) {
      onStatusChange(
        status ?? { has_api_key: false, model: "gpt-5.4-mini" },
        `OpenAI API Key 清除失败：${formatErrorMessage(error, "无法访问 Windows Credential Manager。")}`
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function setModel(model: string) {
    setIsBusy(true);
    try {
      const nextStatus = await api.setOpenAiModel(model);
      onStatusChange(nextStatus, `OpenAI 模型已切换为 ${nextStatus.model}`);
    } catch (error) {
      onStatusChange(
        status ?? { has_api_key: false, model },
        `OpenAI 模型切换失败：${formatErrorMessage(error, "无法保存模型设置。")}`
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="openai-box">
      <div className="openai-title">
        <Settings2 aria-hidden="true" />
        <strong>OpenAI</strong>
      </div>
      <span className={status?.has_api_key ? "key-status connected" : "key-status"}>
        {status?.has_api_key ? `已连接 · ${status.key_source}` : "未配置 API Key"}
      </span>
      <select
        value={status?.model ?? "gpt-5.4-mini"}
        disabled={isBusy}
        onChange={(event) => setModel(event.target.value)}
      >
        <option value="gpt-5.4-mini">gpt-5.4-mini</option>
        <option value="gpt-5.5">gpt-5.5</option>
      </select>
      <input
        className="sidebar-input"
        type="password"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="粘贴 OpenAI API Key"
      />
      <div className="sidebar-actions">
        <button type="button" disabled={isBusy || apiKey.trim().length === 0} onClick={saveKey} title="保存 API Key">
          <KeyRound aria-hidden="true" />
        </button>
        <button type="button" disabled={isBusy || !status?.has_api_key} onClick={clearKey}>
          清除
        </button>
      </div>
      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
        获取 API Key
      </a>
    </div>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="empty-state rich-empty">
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="empty-actions">
        <button className="primary-action" type="button" onClick={onAction}>{actionLabel}</button>
        {secondaryLabel && onSecondary && (
          <button className="secondary-action" type="button" onClick={onSecondary}>{secondaryLabel}</button>
        )}
      </div>
    </div>
  );
}

function RecentPanel({ title, emptyText, children }: { title: string; emptyText: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="recent-panel">
      <h2>{title}</h2>
      {hasChildren ? children : <p>{emptyText}</p>}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export { masteryLabels, relationLabels };
