import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { test } from "node:test";

import catalog from "../public/data/catalog.json" with { type: "json" };
import sources from "../data/sources.json" with { type: "json" };
import {
  buildCoverRecord,
  distributeDiscoveryDates,
  finalizeCandidate,
  isFuturePublication,
  planBilibiliCandidates,
  retainArchiveHistory,
  stabilizeAwardVerification,
  stripTags,
} from "../scripts/ingest.mjs";

test("publishes a multi-source machine-discovered catalog", () => {
  assert.ok(catalog.stats.total >= 45);
  assert.ok(catalog.stats.sourceCount >= 9);
  assert.ok(Number.isInteger(catalog.stats.weeklyCount) && catalog.stats.weeklyCount >= 0);
  assert.ok(catalog.stats.awardCount > 0);
  assert.ok(catalog.stats.popularCount > 0);
});

test("keeps the cumulative archive and retains records through partial source shrink", () => {
  for (const id of ["ai-film-landmarks-air-head", "ai-film-landmarks-the-hardest-part", "ai-film-landmarks-the-frost"]) {
    assert.ok(catalog.items.some((item) => item.id === id), `historical work disappeared: ${id}`);
  }

  const current = [{ id: "fresh", sourceId: "source-a", value: "fresh" }];
  const previous = [
    { id: "fresh", sourceId: "source-a", value: "old" },
    { id: "missing-this-run", sourceId: "source-a" },
    { id: "retired-source", sourceId: "source-b" },
  ];
  const retained = retainArchiveHistory(current, previous, new Set(["source-a"]));
  assert.deepEqual(retained.map((item) => item.id), ["fresh", "missing-this-run"]);
  assert.equal(retained[0].value, "fresh");
});

test("reserves Bilibili ranking slots beyond pinned seeds and supplies bilingual fallbacks", () => {
  const bilibili = sources.sources.find((source) => source.id === "bilibili-hot-aigc");
  const runway = sources.sources.find((source) => source.id === "runway-aiff-screening-room");
  const ranked = [
    { bvid: bilibili.seedBvids[0].bvid, title: "AIGC duplicate seed", desc: "" },
    { bvid: "BVdynamic001", title: "AI短片 dynamic one", desc: "" },
    { bvid: "BVdynamic002", title: "AIGC dynamic two", desc: "" },
    { bvid: "BVdynamic003", title: "Seedance dynamic three", desc: "" },
    { bvid: "BVdynamic004", title: "可灵 dynamic four", desc: "" },
  ];
  const planned = planBilibiliCandidates(bilibili, ranked);
  const plannedIds = planned.map((item) => item.bvid);

  for (const seed of bilibili.seedBvids) assert.ok(plannedIds.includes(seed.bvid));
  assert.equal(planned.filter((item) => item.discoveryPool === "dynamic").length, 3);
  assert.equal(planned.length, bilibili.maxItems);
  assert.ok(bilibili.defaultSummary && bilibili.defaultSummaryEn);
  assert.ok(runway.defaultSummary && runway.defaultSummaryEn);
});

test("keeps retryable cover metadata and stable evidence timestamps", () => {
  const item = { coverUrl: "https://images.example/new.jpg", coverStrategy: "og:image" };
  const previous = {
    cover: { local: "/covers/work.jpg", remote: "https://images.example/old.jpg", strategy: "manual-override" },
    award: { verifiedAt: "2026-08-01T00:00:00.000Z" },
  };
  const failedRefresh = buildCoverRecord(item, previous, previous.cover.local, false);
  const successfulRefresh = buildCoverRecord(item, previous, previous.cover.local, true);

  assert.equal(failedRefresh.remote, previous.cover.remote);
  assert.equal(failedRefresh.strategy, previous.cover.strategy);
  assert.equal(successfulRefresh.remote, item.coverUrl);

  const stable = stabilizeAwardVerification(
    { award: { result: "Winner", verifiedAt: "2026-09-01T00:00:00.000Z" } },
    previous,
    { verifiedAt: "2026-07-01T00:00:00.000Z" },
  );
  const configured = stabilizeAwardVerification(
    { award: { result: "Winner" } },
    null,
    { verifiedAt: "2026-07-01T00:00:00.000Z" },
  );
  assert.equal(stable.award.verifiedAt, previous.award.verifiedAt);
  assert.equal(configured.award.verifiedAt, "2026-07-01T00:00:00.000Z");

  const approved = { id: "work", machine: { status: "approved", missing: [] }, coverUrl: item.coverUrl };
  assert.equal(finalizeCandidate(approved, null, "/covers/work.jpg", true).machine.status, "approved");
  const pending = finalizeCandidate(approved, null, null, false);
  assert.equal(pending.machine.status, "review");
  assert.ok(pending.machine.missing.includes("cover.local"));
});

test("never archives a work before publication and dates later discoveries in the current window", () => {
  const existing = {
    id: "existing-work",
    title: "Existing",
    publishedAt: "2026-09-08T10:04:40.000Z",
    discoveredAt: "2026-08-06T16:00:00.000Z",
  };
  const fresh = {
    id: "fresh-work",
    title: "Fresh",
    publishedAt: "2025-01-01T00:00:00.000Z",
  };
  const before = Date.now();
  const dated = distributeDiscoveryDates(
    [existing, fresh],
    "2026-08-01",
    [existing],
    { min: 5, max: 9 },
  );
  const after = Date.now();

  assert.ok(new Date(dated[0].discoveredAt) >= new Date(existing.publishedAt));
  assert.ok(new Date(dated[1].discoveredAt).getTime() >= before);
  assert.ok(new Date(dated[1].discoveredAt).getTime() <= after);
  assert.equal(isFuturePublication("2099-01-01", new Date("2026-09-12")), true);
  assert.equal(isFuturePublication("2026-09-08", new Date("2026-09-12")), false);
  assert.equal(stripTags("DNA \u200D"), "DNA");
});

test("keeps newly verified official award sources", () => {
  const hiddenTremor = catalog.items.find((item) => item.title === "The Hidden Tremor");
  const lostAndFound = catalog.items.find((item) => item.title === "Lost & Found");

  assert.equal(hiddenTremor?.award?.result, "Best AI Experimental Award");
  assert.match(hiddenTremor?.award?.evidenceUrl || "", /^https:\/\/aifilm\.jp\//);
  assert.equal(lostAndFound?.award?.result, "Best Storytelling Award");
  assert.match(lostAndFound?.award?.evidenceUrl || "", /^https:\/\/www\.pib\.gov\.in\//);
});

test("publishes bilingual descriptions and a traceable Douyin breakout source", () => {
  const peony = catalog.items.find((item) => item.id === "douyin-viral-aigc-peony-chronicle");
  const lapse = catalog.items.find((item) => item.title === "LAPSE");

  assert.match(peony?.creator || "", /刘雨晴/);
  assert.match(peony?.sourceUrl || "", /^https:\/\/www\.douyin\.com\/video\//);
  assert.ok(peony?.popularity?.likes >= 50_000);
  assert.ok(peony?.popularity?.capturedAt);
  assert.match(lapse?.summaryZh || "", /孤独|归属/);

  for (const item of catalog.items) {
    assert.ok(item.summaryZh, `missing Chinese description: ${item.id}`);
    assert.ok(item.summaryEn, `missing English description: ${item.id}`);
  }
});

test("keeps required viral works and their source links", () => {
  const zombie = catalog.items.find((item) => item.title.includes("丧尸清道夫"));
  const askThePeople = catalog.items.find((item) => item.title.includes("写成了妖"));
  assert.equal(zombie?.creator, "Mx-Shell");
  assert.match(zombie?.sourceUrl || "", /^https:\/\/www\.bilibili\.com\/video\//);
  assert.equal(askThePeople?.creator, "青瓜蛋丶");
  assert.ok(zombie?.popularity?.capturedAt);
  assert.ok(askThePeople?.popularity?.capturedAt);
});

test("uses unique records and local cover files", async () => {
  const ids = new Set();
  const fingerprints = new Set();
  for (const item of catalog.items) {
    assert.ok(item.id && item.title && item.creator && item.sourceUrl);
    assert.doesNotMatch(`${item.title}${item.creator}`, /[\u200B-\u200D\uFEFF]/u, `zero-width text: ${item.id}`);
    assert.ok(!ids.has(item.id), `duplicate id: ${item.id}`);
    ids.add(item.id);

    const fingerprint = `${item.title.trim().toLowerCase()}\u0000${item.creator.trim().toLowerCase()}`;
    assert.ok(!fingerprints.has(fingerprint), `duplicate work: ${item.title}`);
    fingerprints.add(fingerprint);

    if (item.publishedAt) {
      assert.ok(
        new Date(item.discoveredAt) >= new Date(item.publishedAt),
        `archive date predates publication: ${item.id}`,
      );
    }
    assert.match(item.coverUrl, /^\/covers\//);
    assert.ok((await stat(new URL(`../public${item.coverUrl}`, import.meta.url))).isFile());
  }
});
