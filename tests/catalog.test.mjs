import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { test } from "node:test";

import catalog from "../public/data/catalog.json" with { type: "json" };

test("publishes a multi-source machine-discovered catalog", () => {
  assert.ok(catalog.stats.total >= 45);
  assert.ok(catalog.stats.sourceCount >= 6);
  assert.ok(catalog.stats.weeklyCount >= catalog.policy.weeklyRange.min);
  assert.ok(catalog.stats.weeklyCount <= catalog.policy.weeklyRange.max);
  assert.ok(catalog.stats.awardCount > 0);
  assert.ok(catalog.stats.popularCount > 0);
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
    assert.ok(!ids.has(item.id), `duplicate id: ${item.id}`);
    ids.add(item.id);

    const fingerprint = `${item.title.trim().toLowerCase()}\u0000${item.creator.trim().toLowerCase()}`;
    assert.ok(!fingerprints.has(fingerprint), `duplicate work: ${item.title}`);
    fingerprints.add(fingerprint);

    assert.match(item.coverUrl, /^\/covers\//);
    assert.ok((await stat(new URL(`../public${item.coverUrl}`, import.meta.url))).isFile());
  }
});
