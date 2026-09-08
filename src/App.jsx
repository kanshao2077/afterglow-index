import { useEffect, useMemo, useRef, useState } from "react";

const FILTER_GROUPS = [
  { id: "type", label: "TYPE" },
  { id: "tools", label: "TOOLS" },
  { id: "source", label: "SOURCE" },
  { id: "others", label: "OTHERS" },
  { id: "time", label: "TIME" },
];

const OTHER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "machine", label: "机器发现" },
  { value: "award", label: "获奖作品" },
  { value: "editor", label: "编辑精选" },
];

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
const BASE_URL = import.meta.env.BASE_URL || "/";

const SIGNAL_LABELS = {
  "official-award-source": "官方奖项",
  "creator-attributed": "作者署名",
  "description-present": "描述完整",
  "cover-extracted": "封面已抓取",
  "source-linked": "原作可追溯",
  "audience-signal": "公开热度",
  "recognition-evidence": "行业记录",
};

function assetPath(value) {
  if (!value || !value.startsWith("/")) return value;
  return `${BASE_URL}${value.slice(1)}`;
}

function visibleText(value = "") {
  return String(value).replace(/[—–]/g, "-");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort(collator.compare);
}

function normalizeItem(item, index) {
  const cover = item.cover?.local || item.coverUrl || item.cover?.remote || "/assets/hero-spectrum.png";
  const discoveredAt = item.discoveredAt || item.publishedAt || "2026-08-01";
  return {
    id: item.id || `work-${index + 1}`,
    title: visibleText(item.title || "Untitled work"),
    creator: visibleText(item.creator || item.author || "Unknown creator"),
    summary: visibleText(item.summary || item.description || "由机器发现并收录的生成影像作品。"),
    sourceUrl: item.sourceUrl || item.url || "#",
    sourceId: item.sourceId || "unknown-source",
    sourceName: visibleText(item.sourceName || "来源未注明"),
    cover: assetPath(cover),
    type: item.type || "影像",
    tools: Array.isArray(item.tools) ? item.tools : item.tool ? [item.tool] : [],
    others: Array.isArray(item.others) ? item.others : [],
    publishedAt: item.publishedAt || "",
    discoveredAt,
    award: item.award || null,
    popularity: item.popularity || null,
    recognition: item.recognition || null,
    machine: item.machine || { status: "approved", signals: ["source-verified"] },
    editor: item.editor || { picked: false, reason: "", rank: null },
    aspect: item.aspect || ["landscape", "portrait", "wide"][index % 3],
  };
}

function monthLabel(value) {
  const [year, month] = String(value).split("-");
  return year && month ? `${year}.${month}` : value;
}

function formatDate(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatCount(value) {
  const count = Number(value || 0);
  if (count >= 10_000) return `${(count / 10_000).toFixed(count >= 1_000_000 ? 0 : 1)} 万`;
  return new Intl.NumberFormat("zh-CN").format(count);
}

function getFilterOptions(group, items) {
  if (group === "type") {
    return [{ value: "all", label: "全部" }, ...unique(items.map((item) => item.type)).map((value) => ({ value, label: value }))];
  }

  if (group === "tools") {
    return [{ value: "all", label: "全部" }, ...unique(items.flatMap((item) => item.tools)).map((value) => ({ value, label: value }))];
  }

  if (group === "source") {
    return [{ value: "all", label: "全部" }, ...unique(items.map((item) => item.sourceName)).map((value) => ({ value, label: value }))];
  }

  if (group === "others") return OTHER_OPTIONS;

  const months = unique(items.map((item) => item.discoveredAt.slice(0, 7))).reverse();
  return [{ value: "all", label: "全部" }, ...months.map((value) => ({ value, label: monthLabel(value) }))];
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
    return item.machine?.status !== "rejected";
  }
  return true;
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
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}

function WorkCard({ item, index, onOpen }) {
  const cardRef = useRef(null);
  useGridSpan(cardRef);

  return (
    <article ref={cardRef} className={`work-card work-card--${item.aspect}`}>
      <button className="work-card__button" type="button" onClick={() => onOpen(item)}>
        <span className="work-card__media">
          <img
            src={item.cover}
            alt={`${item.title} 封面`}
            loading={index < 8 ? "eager" : "lazy"}
            onError={(event) => {
              const fallback = assetPath("/assets/hero-spectrum.png");
              if (event.currentTarget.src !== new URL(fallback, window.location.href).href) {
                event.currentTarget.src = fallback;
              }
            }}
          />
        </span>

        <span className="work-card__source">{item.sourceName}</span>
        <span className="work-card__heading">
          <strong>{item.title}</strong>
          {item.editor?.picked ? <span className="editor-mark">EDITOR'S PICK</span> : null}
        </span>
        <span className="work-card__meta">
          <span>{item.creator}</span>
          <span>{item.tools.join(" / ") || "工具未注明"}</span>
        </span>
        <span className="work-card__summary">{item.summary}</span>
        {item.popularity ? (
          <span className="work-card__signal work-card__signal--popular">
            热门记录 / {formatCount(item.popularity.views)}播放 / {formatDate(item.popularity.capturedAt)}采集
          </span>
        ) : item.award ? (
          <span className="work-card__award">
            {visibleText(item.award.name)} / {item.award.year} / {visibleText(item.award.result)}
          </span>
        ) : item.recognition ? (
          <span className="work-card__signal">{visibleText(item.recognition.label)} / {monthLabel(item.discoveredAt.slice(0, 7))}</span>
        ) : (
          <span className="work-card__origin">MACHINE FOUND / {monthLabel(item.discoveredAt.slice(0, 7))}</span>
        )}
      </button>
    </article>
  );
}

function WorkDialog({ item, onClose }) {
  const dialogRef = useRef(null);

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
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.currentTarget === event.target) event.currentTarget.close();
      }}
    >
      <div className="work-dialog__panel">
        <button className="work-dialog__close" type="button" onClick={() => dialogRef.current?.close()}>
          CLOSE
        </button>
        <div className="work-dialog__media">
          <img src={item.cover} alt={`${item.title} 封面`} />
        </div>
        <div className="work-dialog__body">
          <p className="eyebrow">{item.type} / {item.sourceName}</p>
          <h2>{item.title}</h2>
          <p className="work-dialog__creator">{item.creator}</p>
          <p className="work-dialog__summary">{item.summary}</p>

          <dl className="work-dialog__facts">
            <div>
              <dt>作品来源</dt>
              <dd>{item.sourceName}</dd>
            </div>
            <div>
              <dt>发布时间</dt>
              <dd>{formatDate(item.publishedAt)}</dd>
            </div>
            <div>
              <dt>归档时间</dt>
              <dd>{formatDate(item.discoveredAt)}</dd>
            </div>
            <div>
              <dt>使用工具</dt>
              <dd>{item.tools.join(" / ") || "未注明"}</dd>
            </div>
            <div>
              <dt>入选信号</dt>
              <dd>{item.machine?.signals?.map((signal) => SIGNAL_LABELS[signal] || signal).join(" / ") || "来源完整"}</dd>
            </div>
            {item.editor?.picked ? (
              <div>
                <dt>编辑选择</dt>
                <dd>{item.editor.reason || "已加入编辑精选"}</dd>
              </div>
            ) : null}
          </dl>

          {item.award ? (
            <section className="award-proof">
              <p>AWARD EVIDENCE</p>
              <strong>{visibleText(item.award.name)} / {item.award.year} / {visibleText(item.award.result)}</strong>
              <span>核验于 {formatDate(item.award.verifiedAt)}</span>
              {item.award.evidenceUrl ? (
                <a href={item.award.evidenceUrl} target="_blank" rel="noreferrer">
                  查看官方获奖记录
                </a>
              ) : null}
            </section>
          ) : null}

          {item.popularity ? (
            <section className="recognition-proof">
              <p>POPULARITY SNAPSHOT</p>
              <strong>{formatCount(item.popularity.views)} 播放 / {formatCount(item.popularity.likes)} 点赞</strong>
              <span>数据采集于 {formatDate(item.popularity.capturedAt)}，以来源页实时数据为准</span>
            </section>
          ) : item.recognition ? (
            <section className="recognition-proof">
              <p>ARCHIVE NOTE</p>
              <strong>{visibleText(item.recognition.label)}</strong>
              <span>由机器根据来源完整度与行业记录纳入，不等同于编辑精选</span>
            </section>
          ) : null}

          {item.sourceUrl !== "#" ? (
            <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
              查看原作与作者来源
            </a>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

export function App() {
  const [catalog, setCatalog] = useState({ items: [], generatedAt: null, stats: {} });
  const [status, setStatus] = useState("loading");
  const [activeGroup, setActiveGroup] = useState("type");
  const [activeValue, setActiveValue] = useState("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch(assetPath("/data/catalog.json"), { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`catalog ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data.items) ? data.items.map(normalizeItem) : [];
        setCatalog({ ...data, items });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const options = useMemo(() => getFilterOptions(activeGroup, catalog.items), [activeGroup, catalog.items]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return catalog.items.filter((item) => {
      if (!matchesFilter(item, activeGroup, activeValue)) return false;
      if (!needle) return true;
      return [item.title, item.creator, item.summary, item.type, item.sourceName, item.recognition?.label, ...item.tools]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(needle);
    });
  }, [activeGroup, activeValue, catalog.items, query]);

  const total = catalog.stats?.total || catalog.items.length;
  const weeklyCount = catalog.stats?.weeklyCount ?? catalog.items.filter((item) => {
    const now = new Date();
    const discovered = new Date(item.discoveredAt);
    return now.getTime() - discovered.getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const selectGroup = (group) => {
    setActiveGroup(group);
    setActiveValue("all");
  };

  return (
    <main className="site-shell">
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-lockup__cn">余光档案</span>
          <span className="brand-lockup__en">AFTERGLOW INDEX</span>
        </div>
        <div className="archive-stats" aria-label="档案统计">
          <span>ARCHIVED {String(total).padStart(3, "0")}</span>
          <span>SINCE 2026.08</span>
          <span>UPDATED {formatDate(catalog.generatedAt)}</span>
        </div>
      </header>

      <section className="hero" aria-labelledby="archive-title">
        <img className="hero__spectrum" src={assetPath("/assets/hero-spectrum.png")} alt="" />
        <p className="hero__kicker">GENERATIVE CULTURE INDEX / SINCE 2026.08</p>
        <h1 id="archive-title">
          <span>{total} 件作品，</span>
          <span>构成生成时代的视觉档案</span>
        </h1>
      </section>

      <section className="archive-controls" aria-label="作品筛选">
        <div className="filter-groups" role="tablist" aria-label="筛选维度">
          {FILTER_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={activeGroup === group.id}
              className={activeGroup === group.id ? "is-active" : ""}
              onClick={() => selectGroup(group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <div className="filter-options" aria-label={`${activeGroup} 筛选`}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={activeValue === option.value}
                className={activeValue === option.value ? "is-active" : ""}
                onClick={() => setActiveValue(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className={`search-control ${searchOpen ? "is-open" : ""}`}>
            {searchOpen ? (
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchOpen(false);
                    setQuery("");
                  }
                }}
                aria-label="搜索作品、作者或工具"
                placeholder="搜索作品 / 作者 / 工具"
              />
            ) : null}
            <button
              type="button"
              aria-expanded={searchOpen}
              onClick={() => {
                if (searchOpen && query) setQuery("");
                else setSearchOpen((value) => !value);
              }}
            >
              {searchOpen && query ? "CLEAR" : searchOpen ? "CLOSE" : "SEARCH"}
            </button>
          </div>
        </div>

        <div className="result-line" aria-live="polite">
          <span>{visibleItems.length} WORKS / {catalog.stats?.sourceCount || 0} SOURCES</span>
          <span>本周机器新发现 {weeklyCount} 件</span>
        </div>
      </section>

      {status === "loading" ? (
        <section className="skeleton-grid" aria-label="正在读取作品档案" aria-live="polite">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="skeleton-card" key={index}>
              <span className="skeleton-card__media" />
              <span className="skeleton-card__line" />
              <span className="skeleton-card__line skeleton-card__line--short" />
            </div>
          ))}
        </section>
      ) : null}

      {status === "error" ? (
        <section className="archive-state archive-state--error" role="alert">
          <p>ARCHIVE OFFLINE</p>
          <span>目录还没有生成，请先运行 npm run sync。</span>
        </section>
      ) : null}

      {status === "ready" && visibleItems.length === 0 ? (
        <section className="archive-state">
          <p>NO MATCH</p>
          <span>当前筛选没有作品，换一个条件试试。</span>
        </section>
      ) : null}

      {status === "ready" && visibleItems.length > 0 ? (
        <section className="work-grid" aria-label="AIGC 作品档案">
          {visibleItems.map((item, index) => (
            <WorkCard key={item.id} item={item} index={index} onOpen={setSelectedItem} />
          ))}
        </section>
      ) : null}

      <footer className="site-footer">
        <p>AFTERGLOW INDEX</p>
        <p>机器负责发现，编辑负责留下。</p>
        <a href="#archive-title">BACK TO TOP</a>
      </footer>

      <WorkDialog item={selectedItem} onClose={() => setSelectedItem(null)} />
    </main>
  );
}
