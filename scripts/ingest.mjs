import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOT = new URL("../", import.meta.url);
const SOURCES_PATH = new URL("data/sources.json", ROOT);
const CANDIDATES_PATH = new URL("data/generated/candidates.json", ROOT);
const COVERS_DIR = new URL("public/covers/", ROOT);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  const temporary = new URL(`${path.pathname}.tmp`, path);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function decodeEntities(value = "") {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
      const radix = entity[1]?.toLowerCase() === "x" ? 16 : 10;
      const raw = radix === 16 ? entity.slice(2) : entity.slice(1);
      return String.fromCodePoint(Number.parseInt(raw, radix));
    })
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripTags(value = "") {
  return decodeEntities(value.replace(/<!--.*?-->/gs, "").replace(/<[^>]+>/g, " "));
}

export function isFuturePublication(value, now = new Date()) {
  if (!value) return false;
  const published = new Date(value);
  return !Number.isNaN(published.getTime()) && published > now;
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function canonicalize(value) {
  const url = new URL(value);
  url.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => {
    url.searchParams.delete(key);
  });
  return url.toString();
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "::1", "0.0.0.0"].includes(host)) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function safeUrl(value, allowedHosts, baseUrl) {
  if (!value) return null;
  const url = new URL(decodeEntities(value), baseUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`unsupported protocol: ${url.protocol}`);
  if (isPrivateHostname(url.hostname)) throw new Error(`private host rejected: ${url.hostname}`);
  if (!allowedHosts.includes(url.hostname)) throw new Error(`host not allowed: ${url.hostname}`);
  return url;
}

function metaContent(html, attribute, value) {
  const first = new RegExp(`<meta[^>]+${attribute}=["']${value}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const reversed = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${value}["'][^>]*>`, "i");
  return html.match(first)?.[1] || html.match(reversed)?.[1] || null;
}

function jsonLdImage(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, source] of scripts) {
    try {
      const nodes = Array.isArray(JSON.parse(source)) ? JSON.parse(source) : [JSON.parse(source)];
      for (const node of nodes) {
        const image = Array.isArray(node?.image) ? node.image[0] : node?.image;
        if (typeof image === "string") return image;
        if (image?.url) return image.url;
      }
    } catch {
      // Invalid third-party JSON-LD is ignored; later cover strategies still run.
    }
  }
  return null;
}

function extractCover({ coverOverride, html, baseUrl, allowedHosts }) {
  const candidates = [
    ["manual-override", coverOverride],
    ["og:image", metaContent(html, "property", "og:image")],
    ["twitter:image", metaContent(html, "name", "twitter:image")],
    ["json-ld", jsonLdImage(html)],
    ["first-image", html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]],
  ];

  for (const [strategy, value] of candidates) {
    try {
      const url = safeUrl(value, allowedHosts, baseUrl);
      if (url) return { url: url.toString(), strategy };
    } catch {
      // A rejected candidate does not block the remaining extraction strategies.
    }
  }
  return null;
}

async function fetchWithTimeout(url, options = {}, consume = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AfterglowIndexBot/0.1 (+metadata-and-thumbnail-only)",
        ...options.headers,
      },
    });
    return consume ? await consume(response) : response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, allowedHosts) {
  const safe = safeUrl(url, allowedHosts, url);
  return fetchWithTimeout(safe, {}, async (response) => {
    if (!response.ok) throw new Error(`source returned ${response.status}`);
    safeUrl(response.url, allowedHosts, safe);
    return response.text();
  });
}

async function fetchJson(url, allowedHosts) {
  const safe = safeUrl(url, allowedHosts, url);
  return fetchWithTimeout(safe, { headers: { accept: "application/json" } }, async (response) => {
    if (!response.ok) throw new Error(`source returned ${response.status}`);
    safeUrl(response.url, allowedHosts, safe);
    return response.json();
  });
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function inferTools(value = "", defaults = []) {
  const haystack = value.toLowerCase();
  const matches = [
    ["seedance", "Seedance"],
    ["小云雀", "Seedance"],
    ["即梦", "Dreamina"],
    ["kling", "Kling"],
    ["可灵", "Kling"],
    ["sora", "Sora"],
    ["midjourney", "Midjourney"],
    ["dall-e", "DALL-E"],
    ["dall·e", "DALL-E"],
    ["runway", "Runway"],
    ["hailuo", "Hailuo"],
    ["海螺", "Hailuo"],
    ["suno", "Suno"],
    ["elevenlabs", "ElevenLabs"],
  ].filter(([needle]) => haystack.includes(needle)).map(([, label]) => label);
  return [...new Set([...matches, ...defaults])];
}

function parseRunway(source, html) {
  const marker = '<div class="flex flex-col items-start cursor-pointer group">';
  const chunks = html.split(marker).slice(1);
  const works = [];
  let awardYear = 2025;

  for (const fragment of chunks) {
    if (!source.years.includes(awardYear)) break;

    const title = stripTags(fragment.match(/class="rw-h6[^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const creator = stripTags(fragment.match(/class="rw-bodycopy2[^>]*>by[\s\S]*?([\p{L}\p{N}][\s\S]*?)<\/div>/iu)?.[1]);
    const summaryEn = stripTags(fragment.match(/class="rw-bodycopy2\s+mt-2[^>]*>([\s\S]*?)<\/div>/i)?.[1])
      || source.defaultSummaryEn
      || "";
    const italicValues = [...fragment.matchAll(/<div class="text-\[15px\][^>]*italic[^>]*>([\s\S]*?)<\/div>/gi)]
      .map((match) => stripTags(match[1]));
    const duration = italicValues.find((value) => /^\d+:\d{2}$/.test(value)) || "";
    const explicitResult = italicValues.find((value) => !/^\d+:\d{2}$/.test(value));
    const cover = extractCover({ html: fragment, baseUrl: source.url, allowedHosts: source.allowedHosts });

    if (title && creator && cover) {
      const summaryZh = source.summaryZh?.[title] || source.defaultSummary || "";
      const id = `runway-aiff-${awardYear}-${slugify(title)}`;
      works.push({
        id,
        title,
        creator,
        summary: summaryZh || summaryEn,
        summaryZh,
        summaryEn,
        duration,
        sourceId: source.id,
        sourceName: source.name,
        sourceNameEn: source.nameEn || source.name,
        sourceUrl: source.url,
        coverUrl: cover.url,
        coverStrategy: cover.strategy,
        type: source.defaultType,
        tools: source.defaultTools,
        others: ["机器发现", "获奖作品"],
        publishedAt: `${awardYear}-01-01`,
        award: {
          name: source.awardName,
          year: awardYear,
          result: explicitResult || "Winner",
          evidenceUrl: source.evidenceUrl,
          verifiedAt: new Date().toISOString(),
        },
        aspect: cover.url.includes("/posters/") ? "poster" : "landscape",
        fragment,
      });
    }

    if (fragment.includes("AIFF 2024")) awardYear = 2024;
    if (fragment.includes("AIFF 2023")) awardYear = 2023;
    if (fragment.includes("AIFF 2022")) break;
    if (works.length >= source.maxItems) break;
  }

  return works;
}

function parseProjectOdyssey(source, html) {
  const chunks = html.split(/class="w-layout-grid award_row(?: offset)?"/).slice(1);
  const works = [];

  for (const fragment of chunks) {
    const heading = stripTags(fragment.match(/<h2 class="heading-19">([\s\S]*?)<\/h2>/i)?.[1]);
    const match = heading.match(/^(.*?)\s+By\s+(.+)$/i);
    const cover = extractCover({ html: fragment, baseUrl: source.url, allowedHosts: source.allowedHosts });
    if (!match || !cover) continue;

    const title = match[1].trim();
    const creator = match[2].trim();
    works.push({
      id: `${source.id}-${slugify(title)}`,
      title,
      creator,
      summary: source.defaultSummary,
      summaryZh: source.defaultSummary,
      summaryEn: source.defaultSummaryEn,
      duration: "",
      sourceId: source.id,
      sourceName: source.name,
      sourceNameEn: source.nameEn || source.name,
      sourceUrl: source.url,
      coverUrl: cover.url,
      coverStrategy: cover.strategy,
      type: source.defaultType,
      tools: source.defaultTools,
      others: ["机器发现", "获奖作品"],
      publishedAt: source.publishedAt,
      award: {
        name: source.awardName,
        year: source.awardYear,
        result: "Award Winner",
        evidenceUrl: source.evidenceUrl,
        verifiedAt: new Date().toISOString(),
      },
      aspect: "landscape",
    });

    if (works.length >= source.maxItems) break;
  }

  return works;
}

async function parseBilibiliHot(source) {
  const ranking = await fetchJson(source.url, source.allowedHosts);
  const ranked = Array.isArray(ranking?.data?.list) ? ranking.data.list : [];
  const uniqueSeeds = planBilibiliCandidates(source, ranked);
  const works = [];

  for (const seed of uniqueSeeds) {
    try {
      const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(seed.bvid)}`;
      const payload = await fetchJson(apiUrl, source.allowedHosts);
      const item = payload?.data;
      if (!item?.bvid || item.state < 0) continue;

      const stats = item.stat || {};
      const seeded = source.seedBvids.some((entry) => entry.bvid === item.bvid);
      if (!seeded && Number(stats.view || 0) < source.minimumViews) continue;

      const sourceUrl = `https://www.bilibili.com/video/${item.bvid}/`;
      const coverUrl = String(item.pic || "").replace(/^http:/, "https:");
      const summary = stripTags(seed.summary || item.desc || "")
        || source.defaultSummary
        || "从公开热榜与创作者原发页发现的 AIGC 影像作品。";
      const title = stripTags(seed.title || item.title);
      const tools = inferTools(`${title} ${summary}`, seed.tools || source.defaultTools);
      works.push({
        id: `bilibili-${item.bvid.toLowerCase()}`,
        title,
        creator: stripTags(seed.creator || item.owner?.name || "Unknown creator"),
        summary: summary.slice(0, 220),
        summaryZh: summary.slice(0, 220),
        summaryEn: stripTags(seed.summaryEn || source.defaultSummaryEn || "").slice(0, 220),
        duration: formatDuration(item.duration),
        sourceId: source.id,
        sourceName: source.name,
        sourceNameEn: source.nameEn || source.name,
        sourceUrl,
        coverUrl,
        coverStrategy: "platform-api",
        type: seed.type || source.defaultType,
        tools,
        others: ["机器发现", "热门作品"],
        publishedAt: new Date(Number(item.pubdate) * 1000).toISOString(),
        popularity: {
          platform: "Bilibili",
          views: Number(stats.view || 0),
          likes: Number(stats.like || 0),
          favorites: Number(stats.favorite || 0),
          capturedAt: new Date().toISOString(),
        },
        recognition: {
          kind: "popular",
          label: "Bilibili 热门",
          evidenceUrl: sourceUrl,
        },
        aspect: "landscape",
      });
    } catch (error) {
      console.warn(`[bilibili] ${seed.bvid}: ${error.message}`);
    }
  }

  return works.slice(0, source.maxItems);
}

export function planBilibiliCandidates(source, ranked) {
  const terms = source.discoveryTerms.map((value) => value.toLowerCase());
  const pinned = [...new Map(
    source.seedBvids.map((item) => [String(item.bvid).toLowerCase(), { ...item, discoveryPool: "seed" }]),
  ).values()];
  const pinnedIds = new Set(pinned.map((item) => String(item.bvid).toLowerCase()));
  const dynamicLimit = Math.max(0, source.maxItems - pinned.length);
  const discovered = ranked
    .filter((item) => item?.bvid && terms.some((term) => `${item.title || ""} ${item.desc || ""}`.toLowerCase().includes(term)))
    .filter((item) => !pinnedIds.has(String(item.bvid).toLowerCase()))
    .map((item) => ({ bvid: item.bvid, discoveryPool: "dynamic" }));
  const uniqueDiscovered = [...new Map(
    discovered.map((item) => [String(item.bvid).toLowerCase(), item]),
  ).values()];

  return [...pinned, ...uniqueDiscovered.slice(0, dynamicLimit)];
}

async function parseSeededSource(source) {
  const works = [];

  for (const seed of source.items) {
    try {
      let metadata = {};
      let pageHtml = "";
      if (seed.coverOverride) {
        metadata = {};
      } else if (seed.provider === "youtube") {
        metadata = await fetchJson(
          `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(seed.url)}`,
          source.allowedHosts,
        );
      } else if (seed.provider === "vimeo") {
        metadata = await fetchJson(
          `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(seed.url)}`,
          source.allowedHosts,
        );
      } else {
        pageHtml = await fetchText(seed.url, source.allowedHosts);
      }

      const cover = extractCover({
        coverOverride: seed.coverOverride || metadata.thumbnail_url,
        html: pageHtml,
        baseUrl: seed.url,
        allowedHosts: source.allowedHosts,
      });
      const title = stripTags(seed.title || metadata.title || metaContent(pageHtml, "property", "og:title") || "");
      const creator = stripTags(seed.creator || metadata.author_name || "");
      if (!title || !creator || !cover) throw new Error("seed metadata incomplete");

      const fallbackSummary = stripTags(
        metadata.description || metaContent(pageHtml, "property", "og:description") || source.defaultSummary || "",
      ).slice(0, 240);
      const summaryZh = stripTags(seed.summaryZh || seed.summary || source.defaultSummary || "").slice(0, 240);
      const summaryEn = stripTags(seed.summaryEn || source.defaultSummaryEn || (!summaryZh ? fallbackSummary : "")).slice(0, 240);

      works.push({
        id: seed.id || `${source.id}-${slugify(title)}`,
        title,
        creator,
        summary: summaryZh || summaryEn || fallbackSummary,
        summaryZh,
        summaryEn,
        duration: seed.duration || formatDuration(metadata.duration),
        sourceId: source.id,
        sourceName: source.name,
        sourceNameEn: source.nameEn || source.name,
        sourceUrl: seed.url,
        coverUrl: cover.url,
        coverStrategy: cover.strategy,
        type: seed.type || source.defaultType,
        tools: inferTools(`${seed.summary || ""} ${metadata.description || ""}`, seed.tools || source.defaultTools),
        others: ["机器发现", seed.awardResult ? "获奖作品" : seed.popularity ? "热门作品" : "重要作品"],
        publishedAt: seed.publishedAt,
        award: seed.awardResult ? {
          name: source.awardName,
          year: source.awardYear,
          result: seed.awardResult,
          evidenceUrl: source.evidenceUrl,
          verifiedAt: seed.verifiedAt || source.verifiedAt,
        } : undefined,
        popularity: seed.popularity,
        recognition: seed.recognition || (!seed.awardResult ? {
          kind: "landmark",
          label: source.recognitionLabel || "行业重要作品",
          evidenceUrl: seed.evidenceUrl || seed.url,
        } : undefined),
        aspect: seed.aspect || "landscape",
      });
    } catch (error) {
      console.warn(`[seed] ${seed.url}: ${error.message}`);
    }
  }

  return works;
}

function scoreCandidate(item, requiredFields) {
  const missing = requiredFields.filter((field) => !item[field]);
  let score = 0;
  const signals = [];
  if (item.award?.evidenceUrl) {
    score += 4;
    signals.push("official-award-source");
  }
  if (item.creator) {
    score += 2;
    signals.push("creator-attributed");
  }
  if (item.summary) {
    score += 2;
    signals.push("description-present");
  }
  if (item.coverUrl) {
    score += 2;
    signals.push("cover-extracted");
  }
  if (item.sourceUrl) {
    score += 1;
    signals.push("source-linked");
  }
  if (item.popularity?.views >= 100_000 || item.popularity?.likes >= 50_000) {
    score += 3;
    signals.push("audience-signal");
  }
  if (item.recognition?.evidenceUrl) {
    score += 1;
    signals.push("recognition-evidence");
  }
  return { score, signals, missing };
}

export function distributeDiscoveryDates(items, startDate, existingItems, weeklyRange) {
  const start = new Date(`${startDate}T00:00:00+08:00`);
  const now = new Date();
  const weekCount = Math.max(1, Math.floor((now - start) / (7 * 86_400_000)) + 1);
  const existingRaw = new Map(existingItems.map((item) => [item.id, item.discoveredAt]));
  const normalizeDiscoveryDate = (item, value) => {
    const discovered = new Date(value);
    const published = new Date(item.publishedAt);
    if (Number.isNaN(discovered.getTime())) return now.toISOString();
    if (!Number.isNaN(published.getTime()) && discovered < published) discovered.setTime(published.getTime());
    if (discovered > now) discovered.setTime(now.getTime());
    return discovered.toISOString();
  };
  const existing = new Map(items.flatMap((item) => {
    const value = existingRaw.get(item.id);
    return value ? [[item.id, normalizeDiscoveryDate(item, value)]] : [];
  }));
  const counts = Array.from({ length: weekCount }, () => 0);
  const target = Math.max(weeklyRange.min, Math.min(weeklyRange.max, Math.round(items.length / weekCount)));

  for (const item of items) {
    const value = existing.get(item.id);
    if (!value) continue;
    const week = Math.max(0, Math.min(weekCount - 1, Math.floor((new Date(value) - start) / (7 * 86_400_000))));
    counts[week] += 1;
  }

  return items.map((item) => {
    if (existing.has(item.id)) return { ...item, discoveredAt: existing.get(item.id) };

    // Once an archive exists, a newly discovered work belongs to the current
    // collection window instead of being backfilled into an older empty slot.
    if (existingItems.length) return { ...item, discoveredAt: now.toISOString() };

    let week = counts.findIndex((count) => count < target);
    if (week < 0) week = counts.indexOf(Math.min(...counts));
    const offset = counts[week];
    counts[week] += 1;

    const date = new Date(start);
    date.setDate(date.getDate() + week * 7 + Math.min(offset, 6));
    const published = new Date(item.publishedAt);
    if (!Number.isNaN(published.getTime()) && date < published) date.setTime(published.getTime());
    if (date > now) date.setTime(now.getTime());
    return { ...item, discoveredAt: date.toISOString() };
  });
}

export function retainArchiveHistory(collected, previousItems, activeSourceIds) {
  const active = activeSourceIds instanceof Set ? activeSourceIds : new Set(activeSourceIds);
  const collectedIds = new Set(collected.map((item) => item.id));
  const retained = previousItems.filter((item) => active.has(item.sourceId) && !collectedIds.has(item.id));
  return [...collected, ...retained];
}

export function stabilizeAwardVerification(item, previousItem, source) {
  if (!item.award) return item;
  const verifiedAt = previousItem?.award?.verifiedAt || item.award.verifiedAt || source?.verifiedAt;
  if (!verifiedAt) {
    const { verifiedAt: ignored, ...award } = item.award;
    return { ...item, award };
  }
  return { ...item, award: { ...item.award, verifiedAt } };
}

export function buildCoverRecord(item, previousItem, localCover, refreshed) {
  const retainedPrevious = Boolean(localCover && previousItem?.cover && !refreshed);
  return {
    local: localCover,
    remote: retainedPrevious ? previousItem.cover.remote : item.coverUrl,
    strategy: retainedPrevious ? previousItem.cover.strategy : item.coverStrategy,
  };
}

export function finalizeCandidate(item, previousItem, localCover, coverRefreshed) {
  const { fragment, ...serializable } = item;
  const machine = localCover ? serializable.machine : {
    ...serializable.machine,
    status: "review",
    missing: [...new Set([...(serializable.machine?.missing || []), "cover.local"])],
  };
  return {
    ...serializable,
    machine,
    cover: buildCoverRecord(item, previousItem, localCover, coverRefreshed),
  };
}

function extensionFor(contentType, url) {
  const type = contentType.split(";")[0].trim().toLowerCase();
  const known = {
    "image/avif": ".avif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  if (known[type]) return known[type];
  const extension = extname(new URL(url).pathname).toLowerCase();
  return [".avif", ".jpeg", ".jpg", ".png", ".webp"].includes(extension) ? extension : null;
}

async function downloadCover(item, allowedHosts) {
  const safe = safeUrl(item.coverUrl, allowedHosts, item.sourceUrl);
  const { bytes, contentType, finalUrl } = await fetchWithTimeout(
    safe,
    { headers: { accept: "image/avif,image/webp,image/png,image/jpeg" } },
    async (response) => {
      if (!response.ok) throw new Error(`cover returned ${response.status}`);
      safeUrl(response.url, allowedHosts, safe);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) throw new Error(`cover MIME rejected: ${contentType || "missing"}`);
      const announcedSize = Number(response.headers.get("content-length") || 0);
      if (announcedSize > MAX_IMAGE_BYTES) throw new Error(`cover too large: ${announcedSize}`);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType,
        finalUrl: response.url,
      };
    },
  );
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`cover too large: ${bytes.byteLength}`);
  const extension = extensionFor(contentType, finalUrl);
  if (!extension) throw new Error(`cover extension rejected: ${contentType}`);

  await mkdir(COVERS_DIR, { recursive: true });
  const filename = `${item.id}${extension}`;
  const destination = new URL(filename, COVERS_DIR);
  const temporary = new URL(`${filename}.tmp`, COVERS_DIR);
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  return `/covers/${filename}`;
}

async function main() {
  const config = await readJson(SOURCES_PATH, null);
  if (!config) throw new Error("data/sources.json is missing");
  const previous = await readJson(CANDIDATES_PATH, { generatedAt: null, items: [] });
  const previousById = new Map(previous.items.map((item) => [item.id, item]));
  const sourcesById = new Map(config.sources.map((source) => [source.id, source]));
  const collected = [];

  for (const source of config.sources) {
    try {
      let parsed = [];
      if (source.adapter === "bilibili-hot-ranking") {
        parsed = await parseBilibiliHot(source);
      } else if (source.adapter === "seeded-oembed") {
        parsed = await parseSeededSource(source);
      } else {
        const html = await fetchText(source.url, source.allowedHosts);
        if (source.adapter === "runway-aiff-screening") parsed = parseRunway(source, html);
        if (source.adapter === "project-odyssey-awards") parsed = parseProjectOdyssey(source, html);
      }
      if (!parsed.length) throw new Error("adapter returned no items");
      collected.push(...parsed);
      console.log(`[ingest] ${source.id}: ${parsed.length} candidates`);
    } catch (error) {
      console.warn(`[ingest] ${source.id} failed; keeping last-known-good: ${error.message}`);
    }
  }

  const archiveCandidates = retainArchiveHistory(collected, previous.items, new Set(sourcesById.keys()));

  const deduped = new Map();
  for (const candidate of archiveCandidates) {
    const item = stabilizeAwardVerification(candidate, previousById.get(candidate.id), sourcesById.get(candidate.sourceId));
    const fingerprint = createHash("sha256")
      .update(`${item.title.trim().toLowerCase()}\u0000${item.creator.trim().toLowerCase()}`)
      .digest("hex");
    if (!deduped.has(fingerprint)) deduped.set(fingerprint, { ...item, fingerprint, sourceUrl: canonicalize(item.sourceUrl) });
  }

  const scored = [...deduped.values()]
    .filter((item) => !isFuturePublication(item.publishedAt))
    .map((item) => {
      const result = scoreCandidate(item, config.machineRules.requiredFields);
      return {
        ...item,
        machine: {
          status: result.missing.length === 0 && result.score >= config.machineRules.minimumSignalScore ? "approved" : "review",
          score: result.score,
          signals: result.signals,
          missing: result.missing,
        },
      };
    })
    .filter((item) => item.machine.status === "approved")
    .sort((a, b) => b.machine.score - a.machine.score || a.title.localeCompare(b.title));

  const stablePreviousItems = previous.policy?.assignmentVersion === 2 ? previous.items : [];
  // weeklyRange controls date distribution, never the cumulative size of the archive.
  const dated = distributeDiscoveryDates(scored, config.startDate, stablePreviousItems, config.weeklyRange);
  const output = [];

  for (const item of dated) {
    const previousItem = previousById.get(item.id);
    let localCover = previousItem?.cover?.local || null;
    let coverIsCurrent = false;
    let coverRefreshed = false;
    if (localCover && previousItem?.cover?.remote === item.coverUrl) {
      try {
        coverIsCurrent = (await stat(new URL(`public${localCover}`, ROOT))).isFile();
      } catch {
        coverIsCurrent = false;
      }
    }

    if (!coverIsCurrent) {
      try {
        const source = config.sources.find((entry) => entry.id === item.sourceId);
        localCover = await downloadCover(item, source.allowedHosts);
        coverRefreshed = true;
      } catch (error) {
        console.warn(`[cover] ${item.id}: ${error.message}${localCover ? "; kept previous" : ""}`);
      }
    }

    output.push(finalizeCandidate(item, previousItem, localCover, coverRefreshed));
  }

  if (!output.length && previous.items.length) {
    console.warn("[ingest] no fresh output; candidates.json left unchanged");
    return;
  }

  await writeJsonAtomic(CANDIDATES_PATH, {
    generatedAt: new Date().toISOString(),
    policy: {
      assignmentVersion: 2,
      startDate: config.startDate,
      weeklyTarget: config.weeklyTarget,
      weeklyRange: config.weeklyRange,
    },
    items: output,
  });

  const covers = await Promise.all(
    output.filter((item) => item.cover.local).map((item) => stat(new URL(`public${item.cover.local}`, ROOT))),
  );
  const approvedCount = output.filter((item) => item.machine?.status === "approved").length;
  console.log(`[ingest] wrote ${output.length} candidates (${approvedCount} approved) and ${covers.length} local covers`);
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
