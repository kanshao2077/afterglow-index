import { readFile, rename, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const CANDIDATES_PATH = new URL("data/generated/candidates.json", ROOT);
const CURATION_PATH = new URL("data/curation.json", ROOT);
const CATALOG_PATH = new URL("public/data/catalog.json", ROOT);

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

function editorState(rule = {}) {
  return {
    picked: Boolean(rule.editorPick),
    reason: rule.reason || "",
    rank: Number.isFinite(rule.rank) ? rule.rank : null,
  };
}

export async function buildCatalog() {
  const candidates = await readJson(CANDIDATES_PATH, { generatedAt: null, policy: {}, items: [] });
  const curation = await readJson(CURATION_PATH, { items: {} });
  const now = new Date();
  const archiveStart = new Date(`${candidates.policy?.startDate || "2026-08-01"}T00:00:00+08:00`);
  const currentWeek = Math.max(0, Math.floor((now - archiveStart) / (7 * 86_400_000)));
  const currentWeekStart = new Date(archiveStart.getTime() + currentWeek * 7 * 86_400_000);

  const items = candidates.items
    .filter((item) => item.machine?.status === "approved")
    .filter((item) => curation.items?.[item.id]?.publication !== "rejected")
    .map((item) => {
      const rule = curation.items?.[item.id] || {};
      return {
        id: item.id,
        title: item.title,
        creator: item.creator,
        summary: item.summary,
        duration: item.duration,
        sourceId: item.sourceId,
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl,
        coverUrl: item.cover?.local || "/assets/hero-spectrum.png",
        type: item.type,
        tools: item.tools,
        others: item.others,
        publishedAt: item.publishedAt,
        discoveredAt: item.discoveredAt,
        award: item.award,
        popularity: item.popularity,
        recognition: item.recognition,
        aspect: item.aspect,
        machine: item.machine,
        editor: editorState(rule),
      };
    })
    .sort((a, b) => {
      const rankA = a.editor.rank ?? Number.POSITIVE_INFINITY;
      const rankB = b.editor.rank ?? Number.POSITIVE_INFINITY;
      if (a.editor.picked && b.editor.picked && rankA !== rankB) return rankA - rankB;
      return new Date(b.discoveredAt) - new Date(a.discoveredAt) || a.title.localeCompare(b.title);
    });

  const weeklyCount = items.filter((item) => new Date(item.discoveredAt) >= currentWeekStart).length;
  const output = {
    generatedAt: candidates.generatedAt,
    policy: candidates.policy,
    stats: {
      total: items.length,
      weeklyCount,
      editorPickCount: items.filter((item) => item.editor.picked).length,
      awardCount: items.filter((item) => item.award).length,
      popularCount: items.filter((item) => item.popularity).length,
      sourceCount: new Set(items.map((item) => item.sourceId)).size,
    },
    items,
  };

  await writeJsonAtomic(CATALOG_PATH, output);
  console.log(`[catalog] published ${items.length} machine-approved works (${output.stats.editorPickCount} editor picks)`);
  return output;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  buildCatalog().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
