import {
  BookOpen,
  BrainCircuit,
  Database,
  FilePlus2,
  Home,
  KeyRound,
  Network,
  Settings2,
  Sparkles
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
      setStatus(error instanceof Error ? error.message : "加载示例数据失败");
    }
  }

  useEffect(() => {
    refreshData().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "无法读取 CardMind 数据");
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
    } finally {
      setIsBusy(false);
    }
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

        <PreviewPanel preview={preview} isBusy={isBusy} onConfirm={confirmCards} />
      </div>
    </section>
  );
}

function PreviewPanel({
  preview,
  isBusy,
  onConfirm
}: {
  preview: ExtractionPreview | null;
  isBusy: boolean;
  onConfirm: () => void;
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
        {preview.cards.map((card) => (
          <PreviewCard key={card.title} card={card} />
        ))}
      </div>
      {preview.relations.length > 0 && (
        <div className="relation-preview">
          <h4>关系预览</h4>
          {preview.relations.map((relation) => (
            <span key={`${relation.source_title}-${relation.target_title}-${relation.relation_type}`}>
              {relation.source_title} · {relationLabels[relation.relation_type]} · {relation.target_title}
            </span>
          ))}
        </div>
      )}
      <button className="primary-action full-width" type="button" disabled={isBusy} onClick={onConfirm}>
        确认保存这些卡片
      </button>
    </aside>
  );
}

function PreviewCard({ card }: { card: ExtractedCardDraft }) {
  return (
    <div className="preview-card">
      <span className="card-type">{card.type}</span>
      <strong>{card.title}</strong>
      <p>{card.summary}</p>
      <div className="tag-row">
        {card.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

function CardsView({
  cards,
  relations,
  selectedCard,
  onSelect,
  onImport,
  onSeedSample
}: {
  cards: KnowledgeCard[];
  relations: CardRelation[];
  selectedCard?: KnowledgeCard;
  onSelect: (card: KnowledgeCard) => void;
  onImport: () => void;
  onSeedSample: () => void;
}) {
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
            <h2>{cards.length} 张知识卡片</h2>
          </div>
        </div>
        <div className="card-grid">
          {cards.map((card) => (
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
      </div>
      <CardDetail card={selectedCard} cards={cards} relations={relations} />
    </section>
  );
}

export function CardDetail({
  card,
  cards = [],
  relations = []
}: {
  card?: KnowledgeCard;
  cards?: KnowledgeCard[];
  relations?: CardRelation[];
}) {
  if (!card) {
    return <aside className="detail-panel empty-state">选择一张卡片查看详情。</aside>;
  }

  const relatedRelations = relations.filter(
    (relation) => relation.source_card_id === card.id || relation.target_card_id === card.id
  );

  return (
    <aside className="detail-panel">
      <span className="card-type">{card.type}</span>
      <h2>{card.title}</h2>
      <p className="summary">{card.summary}</p>
      <p>{card.content}</p>
      <div className="tag-row">
        {card.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <dl>
        <div>
          <dt>掌握状态</dt>
          <dd>{masteryLabels[card.mastery_status]}</dd>
        </div>
        <div>
          <dt>来源对话</dt>
          <dd>{card.source_conversation_id}</dd>
        </div>
      </dl>
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
    setIsBusy(true);
    try {
      const nextStatus = await api.saveOpenAiApiKey(apiKey);
      setApiKey("");
      onStatusChange(nextStatus, "OpenAI API Key 已保存到系统凭据。");
    } finally {
      setIsBusy(false);
    }
  }

  async function clearKey() {
    setIsBusy(true);
    try {
      const nextStatus = await api.clearOpenAiApiKey();
      onStatusChange(nextStatus, "OpenAI API Key 已清除。");
    } finally {
      setIsBusy(false);
    }
  }

  async function setModel(model: string) {
    const nextStatus = await api.setOpenAiModel(model);
    onStatusChange(nextStatus, `OpenAI 模型已切换为 ${nextStatus.model}`);
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
      <select value={status?.model ?? "gpt-5.4-mini"} onChange={(event) => setModel(event.target.value)}>
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
