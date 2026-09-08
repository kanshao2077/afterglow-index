# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Current product decisions

- Visual source of truth: `/Users/a1/.codex/generated_images/01a079b4-cc40-7282-a2e0-fc58208c8863/exec-dc42a64c-8895-4760-912e-8aa62bc8e77d.png`.
- Keep the selected dark, minimal analog-retrofuturist direction: signal-black canvas, warm-white typography, one restrained spectral light trail, compact flat filters, and an image-first masonry gallery.
- The exact hero title is dynamic: `XX 件作品，构成生成时代的视觉档案`, where `XX` comes from the published catalog total. Keep a restrained frosted texture while preserving legibility; do not restore `AIGC. CURATED.`.
- Product model: automation discovers candidates, de-duplicates them, applies transparent minimum-signal rules, extracts cover images, records evidence, and publishes the machine-approved pool. `编辑精选` is only the owner-starred subset; the owner can also explicitly hide a bad result in the separate curation file.
- Version-one cadence: target about 7 candidates per week, normally allowing 5–9 based on quality, and backfill from `2026-08-01`.
- MVP information architecture follows the reference site's simple `Type / Tools / Source / Others / Time` filter families. `Source` covers both official award programs and public hot-platform discovery; avoid a complex scoring model in the first version.
- Initial machine-discovery coverage uses six source families: Runway AI Film Festival, Project Odyssey, Reply AI Film Festival, HKUST AI Film Festival, Bilibili hot AIGC, and a small AI film landmarks list. The machine gate uses source traceability, cover availability, public heat, official awards, and industry recognition; Bilibili popularity snapshots must retain their capture time.
- Do not present unverified award claims. Award status requires an official evidence URL and a verification date.
- Do not mirror full third-party works. Store metadata, a local cover thumbnail when permitted, and the canonical source link.
