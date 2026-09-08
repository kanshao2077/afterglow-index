import { readFile, rename, writeFile } from "node:fs/promises";
import { buildCatalog } from "./build-catalog.mjs";

const ROOT = new URL("../", import.meta.url);
const CANDIDATES_PATH = new URL("data/generated/candidates.json", ROOT);
const CURATION_PATH = new URL("data/curation.json", ROOT);
const [command = "list", id, ...rest] = process.argv.slice(2);

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

function usage() {
  console.log(`
用法：
  npm run curate -- list
  npm run curate -- star <id> [精选理由]
  npm run curate -- unstar <id>
  npm run curate -- reason <id> <精选理由>
  npm run curate -- rank <id> <数字>
  npm run curate -- reject <id>
  npm run curate -- approve <id>
`);
}

async function main() {
  const candidates = await readJson(CANDIDATES_PATH, { items: [] });
  const curation = await readJson(CURATION_PATH, { version: 1, updatedAt: null, items: {} });

  if (command === "list") {
    for (const item of candidates.items) {
      const rule = curation.items[item.id] || {};
      const flags = [
        item.machine?.status === "approved" ? "MACHINE" : "REVIEW",
        item.award ? "AWARD" : null,
        rule.editorPick ? "EDITOR" : null,
        rule.publication === "rejected" ? "HIDDEN" : null,
      ].filter(Boolean);
      console.log(`${item.id}\n  ${item.title} — ${item.creator}\n  [${flags.join(" / ")}]${rule.reason ? ` ${rule.reason}` : ""}`);
    }
    return;
  }

  if (!id || !candidates.items.some((item) => item.id === id)) {
    usage();
    throw new Error(`未找到作品 id：${id || "(空)"}`);
  }

  const current = curation.items[id] || {};
  if (command === "star") {
    current.editorPick = true;
    if (rest.length) current.reason = rest.join(" ");
  } else if (command === "unstar") {
    current.editorPick = false;
  } else if (command === "reason") {
    if (!rest.length) throw new Error("reason 需要一段精选理由");
    current.reason = rest.join(" ");
  } else if (command === "rank") {
    const rank = Number(rest[0]);
    if (!Number.isFinite(rank)) throw new Error("rank 必须是数字");
    current.rank = rank;
  } else if (command === "reject") {
    current.publication = "rejected";
  } else if (command === "approve") {
    current.publication = "approved";
  } else {
    usage();
    throw new Error(`未知命令：${command}`);
  }

  current.updatedAt = new Date().toISOString();
  curation.items[id] = current;
  curation.updatedAt = current.updatedAt;
  await writeJsonAtomic(CURATION_PATH, curation);
  await buildCatalog();
  console.log(`[curate] ${command}: ${id}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
