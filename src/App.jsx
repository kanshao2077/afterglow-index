import { useEffect, useMemo, useRef, useState } from "react";

const PAGE_SIZE = 24;
const BILIBILI_SOURCE_ID = "bilibili-hot-aigc";
const BASE_URL = import.meta.env.BASE_URL || "/";

const FILTER_GROUPS = [
  { id: "type", label: { zh: "类型", en: "TYPE" } },
  { id: "tools", label: { zh: "工具", en: "TOOLS" } },
  { id: "source", label: { zh: "来源", en: "SOURCE" } },
  { id: "others", label: { zh: "信号", en: "SIGNALS" } },
  { id: "time", label: { zh: "时间", en: "TIME" } },
];

const OTHER_OPTIONS = [
  { value: "all", label: { zh: "全部", en: "All" } },
  { value: "machine", label: { zh: "机器发现", en: "Machine found" } },
  { value: "popular", label: { zh: "热门作品", en: "Popular works" } },
  { value: "award", label: { zh: "获奖作品", en: "Award winners" } },
  { value: "editor", label: { zh: "编辑精选", en: "Editor's picks" } },
];

const TYPE_LABELS = {
  "AI 影片": { zh: "AI 影片", en: "AI Film" },
  "AI 短片": { zh: "AI 短片", en: "AI Short" },
};

const SIGNAL_LABELS = {
  "official-award-source": { zh: "官方奖项", en: "Official award" },
  "creator-attributed": { zh: "作者署名", en: "Creator credited" },
  "description-present": { zh: "描述完整", en: "Description present" },
  "cover-extracted": { zh: "封面已抓取", en: "Cover captured" },
  "source-linked": { zh: "原作可追溯", en: "Source linked" },
  "audience-signal": { zh: "公开热度", en: "Public interest" },
  "recognition-evidence": { zh: "行业记录", en: "Industry record" },
};

const COPY = {
  zh: {
    archived: "已归档",
    since: "始于",
    updated: "更新",
    notRecorded: "未记录",
    archiveStats: "档案统计",
    language: "切换网站语言",
    heroKicker: "生成文化索引 / 始于 2026.08",
    heroLineOne: (total) => `${total} 件作品，`,
    heroLineTwo: "构成生成时代的视觉档案",
    skip: "跳到作品档案",
    filters: "作品筛选",
    filterDimensions: "筛选维度",
    filterOptions: (group) => `${group} 筛选`,
    all: "全部",
    searchLabel: "搜索作品、作者或工具",
    searchPlaceholder: "搜索作品 / 作者 / 工具…",
    search: "搜索",
    closeSearch: "关闭",
    clearSearch: "清空",
    result: (shown, total, sources) => `已显示 ${shown} / ${total} 件作品 / ${sources} 个来源`,
    weekly: (count) => `近 7 日机器新发现 ${count} 件`,
    loading: "正在读取作品档案…",
    errorTitle: "档案暂时无法读取",
    errorBody: "请检查网络后重新读取。",
    retry: "重新读取",
    emptyTitle: "没有匹配作品",
    emptyBody: "当前筛选或搜索没有结果。",
    reset: "重置筛选",
    grid: "AIGC 作品档案",
    loadMore: (count) => `加载更多（剩余 ${count} 件）`,
    footer: "机器负责发现，编辑负责留下。",
    backToTop: "返回顶部",
    untitled: "未命名作品",
    unknownCreator: "作者未注明",
    unknownSource: "来源未注明",
    unknownType: "影像",
    summaryMissing: "该作品暂无简介。",
    toolsMissing: "工具未注明",
    editorPick: "编辑精选",
    popularRecord: "热门记录",
    machineFound: "机器发现",
    openWork: (title) => `查看作品《${title}》详情`,
    coverAlt: (title) => `《${title}》封面`,
    closeDialog: "关闭作品详情",
    close: "关闭",
    source: "作品来源",
    published: "发布时间",
    discovered: "归档时间",
    tools: "使用工具",
    signals: "入选信号",
    sourceComplete: "来源完整",
    editorChoice: "编辑选择",
    editorChoiceFallback: "已加入编辑精选",
    awardEvidence: "获奖依据",
    verifiedAt: (date) => `核验于 ${date}`,
    officialAward: "查看官方获奖记录",
    popularitySnapshot: "热度快照",
    capturedAt: (date) => `数据采集于 ${date}，以来源页实时数据为准`,
    archiveNote: "归档备注",
    archiveNoteBody: "由机器根据来源完整度与行业记录纳入，不等同于编辑精选",
    originalSource: "查看原作与作者来源",
    views: "播放",
    likes: "点赞",
    favorites: "收藏",
    shares: "分享",
    collected: "采集",
  },
  en: {
    archived: "ARCHIVED",
    since: "SINCE",
    updated: "UPDATED",
    notRecorded: "Not recorded",
    archiveStats: "Archive statistics",
    language: "Change site language",
    heroKicker: "GENERATIVE CULTURE INDEX / SINCE 2026.08",
    heroLineOne: (total) => `${total} WORKS,`,
    heroLineTwo: "A VISUAL ARCHIVE OF THE GENERATIVE ERA",
    skip: "Skip to the work archive",
    filters: "Work filters",
    filterDimensions: "Filter dimensions",
    filterOptions: (group) => `${group} filters`,
    all: "All",
    searchLabel: "Search works, creators, or tools",
    searchPlaceholder: "Search works / creators / tools…",
    search: "SEARCH",
    closeSearch: "CLOSE",
    clearSearch: "CLEAR",
    result: (shown, total, sources) => `SHOWING ${shown} / ${total} WORKS / ${sources} SOURCES`,
    weekly: (count) => `${count} MACHINE FINDS IN 7 DAYS`,
    loading: "Loading the work archive…",
    errorTitle: "ARCHIVE UNAVAILABLE",
    errorBody: "Check your connection, then try loading the catalog again.",
    retry: "RETRY",
    emptyTitle: "NO MATCHES",
    emptyBody: "No works match the current filters or search.",
    reset: "RESET FILTERS",
    grid: "AIGC work archive",
    loadMore: (count) => `LOAD MORE (${count} REMAINING)`,
    footer: "Machines discover. Editors decide what remains.",
    backToTop: "BACK TO TOP",
    untitled: "Untitled work",
    unknownCreator: "Unknown creator",
    unknownSource: "Source not listed",
    unknownType: "Moving image",
    summaryMissing: "No description is available for this work.",
    toolsMissing: "Tools not listed",
    editorPick: "EDITOR'S PICK",
    popularRecord: "POPULAR RECORD",
    machineFound: "MACHINE FOUND",
    openWork: (title) => `Open details for ${title}`,
    coverAlt: (title) => `${title} cover`,
    closeDialog: "Close work details",
    close: "CLOSE",
    source: "Source",
    published: "Published",
    discovered: "Archived",
    tools: "Tools",
    signals: "Selection signals",
    sourceComplete: "Source complete",
    editorChoice: "Editor's choice",
    editorChoiceFallback: "Added to the editor's picks",
    awardEvidence: "AWARD EVIDENCE",
    verifiedAt: (date) => `Verified ${date}`,
    officialAward: "View official award record",
    popularitySnapshot: "POPULARITY SNAPSHOT",
    capturedAt: (date) => `Captured ${date}. Live figures may have changed.`,
    archiveNote: "ARCHIVE NOTE",
    archiveNoteBody: "Included by the machine using source completeness and industry records. This is not an editor's pick.",
    originalSource: "View original work and creator source",
    views: "views",
    likes: "likes",
    favorites: "favorites",
    shares: "shares",
    collected: "captured",
  },
};

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
const validGroups = new Set(FILTER_GROUPS.map((group) => group.id));

function assetPath(value) {
  if (!value || !value.startsWith("/")) return value;
  return `${BASE_URL}${value.slice(1)}`;
}

function visibleText(value = "") {
  return String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort(collator.compare);
}

function readUrlState() {
  if (typeof window === "undefined") {
    return { language: "zh", activeGroup: "type", activeValue: "all", query: "", selectedId: "" };
  }

  const params = new URLSearchParams(window.location.search);
  const activeGroup = validGroups.has(params.get("group")) ? params.get("group") : "type";
  return {
    language: params.get("lang") === "en" ? "en" : "zh",
    activeGroup,
    activeValue: params.get("filter") || "all",
    query: params.get("q") || "",
    selectedId: params.get("work") || "",
  };
}

function normalizeItem(item, index) {
  const cover = item.cover?.local || item.coverUrl || item.cover?.remote || "/assets/hero-spectrum.png";
  const discoveredAt = item.discoveredAt || item.publishedAt || "2026-08-01";
  return {
    id: item.id || `work-${index + 1}`,
    title: visibleText(item.title),
    creator: visibleText(item.creator || item.author),
    summary: visibleText(item.summary || item.description),
    summaryZh: visibleText(item.summaryZh),
    summaryEn: visibleText(item.summaryEn),
    sourceUrl: item.sourceUrl || item.url || "#",
    sourceId: item.sourceId || "unknown-source",
    sourceName: visibleText(item.sourceName),
    sourceNameEn: visibleText(item.sourceNameEn),
    cover: assetPath(cover),
    type: item.type || "",
    tools: Array.isArray(item.tools) ? item.tools : item.tool ? [item.tool] : [],
    others: Array.isArray(item.others) ? item.others : [],
    publishedAt: item.publishedAt || "",
    discoveredAt,
    award: item.award || null,
    popularity: item.popularity || null,
    recognition: item.recognition || null,
    machine: item.machine || { status: "approved", signals: ["source-linked"] },
    editor: item.editor || { picked: false, reason: "", rank: null },
  };
}

function monthLabel(value) {
  const [year, month] = String(value).split("-");
  return year && month ? `${year}.${month}` : value;
}

function formatDate(value, language) {
  if (!value) return COPY[language].notRecorded;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return visibleText(value);
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatCount(value, language) {
  const count = Number(value);
  if (!Number.isFinite(count)) return "";
  if (language === "zh") {
    if (count >= 10_000) return `${(count / 10_000).toFixed(count >= 1_000_000 ? 0 : 1)} 万`;
    return new Intl.NumberFormat("zh-CN").format(count);
  }
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}

function getPopularityMetrics(popularity, language, limit = Number.POSITIVE_INFINITY) {
  if (!popularity) return [];
  const copy = COPY[language];
  return [
    ["views", copy.views],
    ["likes", copy.likes],
    ["favorites", copy.favorites],
    ["shares", copy.shares],
  ].flatMap(([key, label]) => {
    const value = Number(popularity[key]);
    if (!Number.isFinite(value) || value <= 0) return [];
    const formatted = formatCount(value, language);
    return [language === "zh" ? `${formatted}${label}` : `${formatted} ${label}`];
  }).slice(0, limit);
}

function getSummary(item, language) {
  return (language === "zh" ? item.summaryZh : item.summaryEn) || item.summary || COPY[language].summaryMissing;
}

function getTypeLabel(type, language) {
  if (!type) return COPY[language].unknownType;
  return TYPE_LABELS[type]?.[language] || type;
}

function getSourceName(item, language) {
  return (language === "en" ? item.sourceNameEn : item.sourceName) || item.sourceName || COPY[language].unknownSource;
}

function getSignalLabel(signal, language) {
  return SIGNAL_LABELS[signal]?.[language] || visibleText(signal);
}

function getFilterOptions(group, items, language) {
  const allOption = { value: "all", label: COPY[language].all };

  if (group === "type") {
    return [
      allOption,
      ...unique(items.map((item) => item.type)).map((value) => ({
        value,
        label: getTypeLabel(value, language),
      })),
    ];
  }

  if (group === "tools") {
    return [allOption, ...unique(items.flatMap((item) => item.tools)).map((value) => ({ value, label: value }))];
  }

  if (group === "source") {
    const sources = [...new Map(
      items
        .filter((item) => item.sourceName)
        .map((item) => [item.sourceName, {
          value: item.sourceName,
          label: getSourceName(item, language),
          sourceId: item.sourceId,
        }]),
    ).values()];
    sources.sort((a, b) => {
      if (a.sourceId === BILIBILI_SOURCE_ID) return -1;
      if (b.sourceId === BILIBILI_SOURCE_ID) return 1;
      return collator.compare(a.label, b.label);
    });
    return [allOption, ...sources];
  }

  if (group === "others") {
    return OTHER_OPTIONS.map((option) => ({ value: option.value, label: option.label[language] }));
  }

  const months = unique(items.map((item) => item.discoveredAt.slice(0, 7))).reverse();
  return [allOption, ...months.map((value) => ({ value, label: monthLabel(value) }))];
}

function matchesFilter(item, group, value) {
  if (value === "all") return true;
  if (group === "type") return item.type === value;
  if (group === "tools") return item.tools.includes(value);
  if (group === "source") return item.sourceName === value;
  if (group === "time") return item.discoveredAt.startsWith(value);
  if (group === "others") {
    if (value === "editor") return Boolean(item.editor?.picked);
    if (value === "award") return Boolean(item.award);
    if (value === "popular") return Boolean(item.popularity);
    return item.machine?.status !== "rejected";
  }
  return true;
}

function setFallbackCover(event) {
  if (event.currentTarget.dataset.fallbackApplied === "true") return;
  event.currentTarget.dataset.fallbackApplied = "true";
  event.currentTarget.src = assetPath("/assets/hero-spectrum.png");
}

function useGridSpan(ref) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const resize = () => {
      const height = element.getBoundingClientRect().height;
      element.style.setProperty("--row-span", Math.ceil((height + 4) / 8));
    };

    resize();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}

function WorkCard({ item, index, language, onOpen }) {
  const cardRef = useRef(null);
  const copy = COPY[language];
  const title = item.title || copy.untitled;
  const popularityMetrics = getPopularityMetrics(item.popularity, language, 2);
  useGridSpan(cardRef);

  return (
    <article ref={cardRef} className="work-card">
      <button
        className="work-card__button"
        type="button"
        aria-label={copy.openWork(title)}
        onClick={() => onOpen(item.id)}
      >
        <span className="work-card__media">
          <img
            src={item.cover}
            alt={copy.coverAlt(title)}
            width="1600"
            height="900"
            loading={index < 4 ? "eager" : "lazy"}
            fetchPriority={index < 4 ? "high" : "auto"}
            decoding="async"
            onError={setFallbackCover}
          />
        </span>

        <span className="work-card__source" translate="no">{getSourceName(item, language)}</span>
        <span className="work-card__heading">
          <strong translate="no">{title}</strong>
          {item.editor?.picked ? <span className="editor-mark">{copy.editorPick}</span> : null}
        </span>
        <span className="work-card__meta">
          <span translate="no">{item.creator || copy.unknownCreator}</span>
          <span translate="no">{item.tools.join(" / ") || copy.toolsMissing}</span>
        </span>
        <span className="work-card__summary">{getSummary(item, language)}</span>
        {item.popularity && popularityMetrics.length > 0 ? (
          <span className="work-card__signal work-card__signal--popular">
            {[copy.popularRecord, ...popularityMetrics, item.popularity.capturedAt
              ? `${formatDate(item.popularity.capturedAt, language)} ${copy.collected}`
              : null].filter(Boolean).join(" / ")}
          </span>
        ) : item.award ? (
          <span className="work-card__award">
            {visibleText(item.award.name)} / {item.award.year} / {visibleText(item.award.result)}
          </span>
        ) : item.recognition ? (
          <span className="work-card__signal">
            {visibleText(item.recognition.label)} / {monthLabel(item.discoveredAt.slice(0, 7))}
          </span>
        ) : (
          <span className="work-card__origin">{copy.machineFound} / {monthLabel(item.discoveredAt.slice(0, 7))}</span>
        )}
      </button>
    </article>
  );
}

function WorkDialog({ item, language, onClose }) {
  const dialogRef = useRef(null);
  const copy = COPY[language];
  const title = item?.title || copy.untitled;
  const popularityMetrics = getPopularityMetrics(item?.popularity, language);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !item) return undefined;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [item]);

  if (!item) return null;

  return (
    <dialog
      ref={dialogRef}
      className="work-dialog"
      aria-labelledby="work-dialog-title"
      aria-describedby="work-dialog-summary"
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.currentTarget === event.target) event.currentTarget.close();
      }}
    >
      <div className="work-dialog__panel">
        <button
          className="work-dialog__close"
          type="button"
          aria-label={copy.closeDialog}
          onClick={() => dialogRef.current?.close()}
        >
          {copy.close}
        </button>
        <div className="work-dialog__media">
          <img
            src={item.cover}
            alt={copy.coverAlt(title)}
            width="1600"
            height="900"
            decoding="async"
            onError={setFallbackCover}
          />
        </div>
        <div className="work-dialog__body">
          <p className="eyebrow">
            {getTypeLabel(item.type, language)} / <span translate="no">{getSourceName(item, language)}</span>
          </p>
          <h2 id="work-dialog-title" translate="no">{title}</h2>
          <p className="work-dialog__creator" translate="no">{item.creator || copy.unknownCreator}</p>
          <p id="work-dialog-summary" className="work-dialog__summary">{getSummary(item, language)}</p>

          <dl className="work-dialog__facts">
            <div>
              <dt>{copy.source}</dt>
              <dd translate="no">{getSourceName(item, language)}</dd>
            </div>
            <div>
              <dt>{copy.published}</dt>
              <dd>{formatDate(item.publishedAt, language)}</dd>
            </div>
            <div>
              <dt>{copy.discovered}</dt>
              <dd>{formatDate(item.discoveredAt, language)}</dd>
            </div>
            <div>
              <dt>{copy.tools}</dt>
              <dd translate="no">{item.tools.join(" / ") || copy.toolsMissing}</dd>
            </div>
            <div>
              <dt>{copy.signals}</dt>
              <dd>{item.machine?.signals?.map((signal) => getSignalLabel(signal, language)).join(" / ") || copy.sourceComplete}</dd>
            </div>
            {item.editor?.picked ? (
              <div>
                <dt>{copy.editorChoice}</dt>
                <dd>{item.editor.reason || copy.editorChoiceFallback}</dd>
              </div>
            ) : null}
          </dl>

          {item.award ? (
            <section className="award-proof">
              <p>{copy.awardEvidence}</p>
              <strong>{visibleText(item.award.name)} / {item.award.year} / {visibleText(item.award.result)}</strong>
              <span>{copy.verifiedAt(formatDate(item.award.verifiedAt, language))}</span>
              {item.award.evidenceUrl ? (
                <a href={item.award.evidenceUrl} target="_blank" rel="noreferrer">
                  {copy.officialAward}
                </a>
              ) : null}
            </section>
          ) : null}

          {item.popularity && popularityMetrics.length > 0 ? (
            <section className="recognition-proof">
              <p>{copy.popularitySnapshot}</p>
              <strong>{popularityMetrics.join(" / ")}</strong>
              {item.popularity.capturedAt ? (
                <span>{copy.capturedAt(formatDate(item.popularity.capturedAt, language))}</span>
              ) : null}
            </section>
          ) : item.recognition ? (
            <section className="recognition-proof">
              <p>{copy.archiveNote}</p>
              <strong>{visibleText(item.recognition.label)}</strong>
              <span>{copy.archiveNoteBody}</span>
            </section>
          ) : null}

          {item.sourceUrl !== "#" ? (
            <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
              {copy.originalSource}
            </a>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

export function App() {
  const initialUrlState = useMemo(readUrlState, []);
  const [catalog, setCatalog] = useState({ items: [], generatedAt: null, stats: {} });
  const [status, setStatus] = useState("loading");
  const [requestVersion, setRequestVersion] = useState(0);
  const [language, setLanguage] = useState(initialUrlState.language);
  const [activeGroup, setActiveGroup] = useState(initialUrlState.activeGroup);
  const [activeValue, setActiveValue] = useState(initialUrlState.activeValue);
  const [query, setQuery] = useState(initialUrlState.query);
  const [searchOpen, setSearchOpen] = useState(Boolean(initialUrlState.query));
  const [selectedId, setSelectedId] = useState(initialUrlState.selectedId);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchRef = useRef(null);
  const searchToggleRef = useRef(null);
  const copy = COPY[language];

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch(assetPath("/data/catalog.json"), { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`catalog ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const items = Array.isArray(data.items)
          ? data.items
            .map(normalizeItem)
            .sort((a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime())
          : [];
        setCatalog({ ...data, items });
        setStatus("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, [requestVersion]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeGroup, activeValue, query]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = language === "zh" ? "余光档案 | AFTERGLOW INDEX" : "AFTERGLOW INDEX | Generative Culture Archive";
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onPopState = () => {
      const next = readUrlState();
      setLanguage(next.language);
      setActiveGroup(next.activeGroup);
      setActiveValue(next.activeValue);
      setQuery(next.query);
      setSearchOpen(Boolean(next.query));
      setSelectedId(next.selectedId);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (language === "en") url.searchParams.set("lang", "en");
    else url.searchParams.delete("lang");
    if (activeGroup !== "type" || activeValue !== "all") url.searchParams.set("group", activeGroup);
    else url.searchParams.delete("group");
    if (activeValue !== "all") url.searchParams.set("filter", activeValue);
    else url.searchParams.delete("filter");
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (selectedId) url.searchParams.set("work", selectedId);
    else url.searchParams.delete("work");

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, "", nextUrl);
  }, [activeGroup, activeValue, language, query, selectedId]);

  const options = useMemo(
    () => getFilterOptions(activeGroup, catalog.items, language),
    [activeGroup, catalog.items, language],
  );

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(language === "zh" ? "zh-CN" : "en");
    return catalog.items.filter((item) => {
      if (!matchesFilter(item, activeGroup, activeValue)) return false;
      if (!needle) return true;
      return [
        item.title,
        item.creator,
        item.summary,
        item.summaryZh,
        item.summaryEn,
        item.type,
        item.sourceName,
        item.sourceNameEn,
        item.recognition?.label,
        ...item.tools,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase(language === "zh" ? "zh-CN" : "en")
        .includes(needle);
    });
  }, [activeGroup, activeValue, catalog.items, language, query]);

  const displayedItems = visibleItems.slice(0, visibleCount);
  const selectedItem = catalog.items.find((item) => item.id === selectedId) || null;
  const total = catalog.stats?.total ?? catalog.items.length;
  const sourceCount = unique(visibleItems.map((item) => item.sourceId)).length;
  const weeklyCount = catalog.stats?.weeklyCount ?? catalog.items.filter((item) => {
    const now = new Date();
    const discovered = new Date(item.discoveredAt);
    return now.getTime() - discovered.getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;
  const remainingCount = Math.max(0, visibleItems.length - displayedItems.length);

  useEffect(() => {
    if (status === "ready" && selectedId && !selectedItem) setSelectedId("");
  }, [selectedId, selectedItem, status]);

  const selectGroup = (group) => {
    setActiveGroup(group);
    setActiveValue("all");
  };

  const resetFilters = () => {
    setActiveGroup("type");
    setActiveValue("all");
    setQuery("");
    setSearchOpen(false);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <>
      <a className="skip-link" href="#main-content">{copy.skip}</a>
      <main
        id="main-content"
        className="site-shell"
        data-language={language}
        tabIndex="-1"
        aria-busy={status === "loading"}
      >
        <header className="masthead">
          <div className="brand-lockup" translate="no">
            <span className="brand-lockup__cn">余光档案</span>
            <span className="brand-lockup__en">AFTERGLOW INDEX</span>
          </div>
          <div className="masthead__meta">
            <div className="archive-stats" aria-label={copy.archiveStats}>
              <span>{copy.archived} {String(total).padStart(3, "0")}</span>
              <span>{copy.since} 2026.08</span>
              <span>{copy.updated} {formatDate(catalog.generatedAt, language)}</span>
            </div>
            <div className="language-switch" role="group" aria-label={copy.language}>
              <button
                type="button"
                aria-pressed={language === "zh"}
                className={language === "zh" ? "is-active" : ""}
                onClick={() => setLanguage("zh")}
              >
                中
              </button>
              <span aria-hidden="true">/</span>
              <button
                type="button"
                aria-pressed={language === "en"}
                className={language === "en" ? "is-active" : ""}
                onClick={() => setLanguage("en")}
              >
                EN
              </button>
            </div>
          </div>
        </header>

        <section className="hero" aria-labelledby="archive-title">
          <img
            className="hero__spectrum"
            src={assetPath("/assets/hero-spectrum.png")}
            alt=""
            width="1440"
            height="360"
            fetchPriority="high"
            decoding="async"
            aria-hidden="true"
          />
          <p className="hero__kicker">{copy.heroKicker}</p>
          <h1 id="archive-title">
            <span>{copy.heroLineOne(total)}</span>
            {language === "en" ? (
              <>
                <span>A VISUAL ARCHIVE OF</span>
                <span>THE GENERATIVE ERA</span>
              </>
            ) : <span>{copy.heroLineTwo}</span>}
          </h1>
        </section>

        <section className="archive-controls" aria-label={copy.filters}>
          <div className="filter-groups" role="group" aria-label={copy.filterDimensions}>
            {FILTER_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={activeGroup === group.id}
                aria-controls="archive-grid"
                className={activeGroup === group.id ? "is-active" : ""}
                onClick={() => selectGroup(group.id)}
              >
                {group.label[language]}
              </button>
            ))}
          </div>

          <div className="filter-row">
            <div className="filter-options" role="group" aria-label={copy.filterOptions(FILTER_GROUPS.find((group) => group.id === activeGroup)?.label[language] || activeGroup)}>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={activeValue === option.value}
                  aria-controls="archive-grid"
                  className={activeValue === option.value ? "is-active" : ""}
                  onClick={() => setActiveValue(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className={`search-control ${searchOpen ? "is-open" : ""}`}>
              {searchOpen ? (
                <>
                  <label className="sr-only" htmlFor="archive-search">{copy.searchLabel}</label>
                  <input
                    id="archive-search"
                    ref={searchRef}
                    name="archive-search"
                    type="search"
                    autoComplete="off"
                    spellCheck="false"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setSearchOpen(false);
                        setQuery("");
                        window.requestAnimationFrame(() => searchToggleRef.current?.focus());
                      }
                    }}
                    aria-controls="archive-grid"
                    placeholder={copy.searchPlaceholder}
                  />
                </>
              ) : null}
              <button
                ref={searchToggleRef}
                type="button"
                aria-expanded={searchOpen}
                aria-controls={searchOpen ? "archive-search" : undefined}
                onClick={() => {
                  if (searchOpen && query) setQuery("");
                  else setSearchOpen((value) => !value);
                }}
              >
                {searchOpen && query ? copy.clearSearch : searchOpen ? copy.closeSearch : copy.search}
              </button>
            </div>
          </div>

          <div className="result-line" aria-live="polite">
            <span>{copy.result(displayedItems.length, visibleItems.length, sourceCount)}</span>
            <span>{copy.weekly(weeklyCount)}</span>
          </div>
        </section>

        {status === "loading" ? (
          <section className="skeleton-grid" role="status" aria-live="polite">
            <span className="sr-only">{copy.loading}</span>
            {Array.from({ length: 8 }, (_, index) => (
              <div className="skeleton-card" key={index} aria-hidden="true">
                <span className="skeleton-card__media" />
                <span className="skeleton-card__line" />
                <span className="skeleton-card__line skeleton-card__line--short" />
              </div>
            ))}
          </section>
        ) : null}

        {status === "error" ? (
          <section className="archive-state archive-state--error" role="alert">
            <p>{copy.errorTitle}</p>
            <span>{copy.errorBody}</span>
            <button className="archive-action" type="button" onClick={() => setRequestVersion((value) => value + 1)}>
              {copy.retry}
            </button>
          </section>
        ) : null}

        {status === "ready" && visibleItems.length === 0 ? (
          <section className="archive-state">
            <p>{copy.emptyTitle}</p>
            <span>{copy.emptyBody}</span>
            <button className="archive-action" type="button" onClick={resetFilters}>
              {copy.reset}
            </button>
          </section>
        ) : null}

        {status === "ready" && visibleItems.length > 0 ? (
          <>
            <section
              key={`${activeGroup}:${activeValue}`}
              id="archive-grid"
              className="work-grid"
              aria-label={copy.grid}
            >
              {displayedItems.map((item, index) => (
                <WorkCard
                  key={item.id}
                  item={item}
                  index={index}
                  language={language}
                  onOpen={setSelectedId}
                />
              ))}
            </section>
            {remainingCount > 0 ? (
              <div className="load-more">
                <button
                  className="archive-action"
                  type="button"
                  aria-controls="archive-grid"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  {copy.loadMore(remainingCount)}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        <footer className="site-footer">
          <p translate="no">AFTERGLOW INDEX</p>
          <p>{copy.footer}</p>
          <a href="#archive-title">{copy.backToTop}</a>
        </footer>

        <WorkDialog item={selectedItem} language={language} onClose={() => setSelectedId("")} />
      </main>
    </>
  );
}
