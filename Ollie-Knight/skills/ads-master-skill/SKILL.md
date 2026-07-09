---
name: ads-master-skill
description: |
  Niche-agnostic paid-ad orchestrator. Given a client slug, produces a full Andromeda-compliant batch
  spanning ALL four ad surfaces (cold DR video, warm-up Venus Fly Trap content, retargeting Harvester
  sequence, static image ads) in one coherent run. Uses the Dog Food Exercise to generate 15-20
  fully diverse messaging angles, films each as one cohesive Hook → Body → CTA unit, spreads them
  across 8 cold-DR sub-frameworks for variety, and tags every script with the Dog-Food reason,
  cognitive bias, hook pattern, framework, funnel-alignment requirements, target objection, and a
  2-4 week iteration recipe for ad fatigue.

  Voice handling is mandatory Phase 0: detects client voice asset, scores tier (full/partial/none),
  enforces hardcoded anti-AI-tell rules across all outputs, stamps GENERIC if no voice provided.

  Orchestrates (does not replace) the existing sub-skills: direct-response-ads-skill,
  ads-research-skill, hammer-them-skill, static-ad-skill.

  Aliases: /ads, /ads-master, /ad-batch.

  Triggers on: "build ads for [client]", "ad batch for [client]", "ads master", "/ads [client]",
  "produce 15 ads", "diverse messaging batch", "Venus Fly Trap for [client]", "Harvester for [client]",
  "Andromeda-compliant ads", "/ads troubleshoot" (for the if-this-then-that mode).
metadata:
  type: skill
  surfaces: [cold-dr, warm-up, retargeting, static]
  default_volume_path: diverse-messaging-15-20
  orchestrates: [direct-response-ads-skill, ads-research-skill, hammer-them-skill, static-ad-skill]
---

# ads-master-skill

The single entry point for paid-ad batches across any client/niche.

## When to use

- A client (existing or new) needs a fresh batch of ads
- You're refreshing creatives after ad fatigue and need a fully diverse new batch
- You're launching a new offer and need cold DR, warm-up, retargeting, and static all coordinated
- You're troubleshooting a live campaign (use `/ads troubleshoot` subcommand)

## When NOT to use

- Single-script edits — use `direct-response-ads-skill` or `static-ad-skill` directly
- Pure swipe-file research with no ads to produce — use `ads-research-skill` directly
- Post-booking-only retargeting bundle — use `hammer-them-skill` directly
- Webinar ads specifically — that's covered by `vsl-script-skill` in webinar mode

## Knowledge base

The skill draws on 6 verbatim reference documents in `reference/`:

| File | What it gives you |
|---|---|
| [`reference/dr-framework-10-parts.md`](reference/dr-framework-10-parts.md) | The 10-part SOP. Read first for any cold DR work. |
| [`reference/dog-food-exercise.md`](reference/dog-food-exercise.md) | The diversification engine. Generates 15-20 reasons → 15-20 unique ads. |
| [`reference/100-hook-framework.md`](reference/100-hook-framework.md) | 100 hooks across 7 cognitive-bias categories. |
| [`reference/103-hook-templates.md`](reference/103-hook-templates.md) | 103+ fill-in-the-blank hook templates with 36 variable types. |
| [`reference/14-ad-templates.md`](reference/14-ad-templates.md) | 14 structural ad templates. Pick one per script as the backbone. |
| [`reference/70-headline-swipe.md`](reference/70-headline-swipe.md) | 70+ Ogilvy-style headlines for static ads. |
| [`reference/8-sub-frameworks.md`](reference/8-sub-frameworks.md) | 8 cold-DR delivery styles (talking head, case study, demo, Q&A, etc.). |
| [`reference/venus-fly-trap.md`](reference/venus-fly-trap.md) | Cold → warm pipeline (Video 1/2/3 + Content Cycle Bin). |
| [`reference/harvester-strategy.md`](reference/harvester-strategy.md) | Evergreen retargeting at scale, 5-7 day intervals up to 180 days. |
| [`reference/if-this-then-that.md`](reference/if-this-then-that.md) | 8-problem ad-manager troubleshooting flowchart. |
| [`reference/anti-ai-tells.md`](reference/anti-ai-tells.md) | Hardcoded style rules. Applied to every output. |

## Phase flow

The skill runs four phases in order. Each phase reads from `clients/[slug]/` and writes to `clients/[slug]/ads/[YYYY-MM-DD-batch-N]/`.

1. **[Phase 0 — Voice Gate](phases/00-voice-gate.md)** (BLOCKING). Detects voice asset, scores tier, refuses or stamps as needed.
2. **[Phase 1 — Discovery](phases/01-discovery.md)**. Auto-detects offer KB, ICP, swipe file, case studies, photo library, funnel destination, objections. Asks only for what's missing.
3. **[Phase 2 — Plan](phases/02-plan.md)**. Confirms surfaces, volume path, Dog-Food list (18-25 reasons), framework spread, objection coverage.
4. **[Phase 3 — Produce](phases/03-produce.md)**. Generates every asset in the batch folder.

## Templates (output schemas)

Every asset written to disk uses a template from `templates/`:

- [`templates/cold-dr-script.md`](templates/cold-dr-script.md) — 15-20 cold-DR video scripts
- [`templates/warm-up-video.md`](templates/warm-up-video.md) — 3-5 Venus Fly Trap warm-up videos
- [`templates/retargeting-ad.md`](templates/retargeting-ad.md) — 5-10 Harvester / Hammer Them retargeting ads
- [`templates/static-ad.md`](templates/static-ad.md) — 5-10 image ad copy + visual direction
- [`templates/briefing.md`](templates/briefing.md) — one-pager for the editor/talent
- [`templates/index.md`](templates/index.md) — batch index with coverage matrix

## Sub-skill orchestration

The master-skill **calls** existing sub-skills rather than reimplementing them. Each call carries a structured brief (YAML frontmatter with offer slug, Dog-Food reason, cognitive bias, framework, voice tier, target objection, funnel destination) so sub-skills don't re-prompt:

| Surface | Sub-skill called | Notes |
|---|---|---|
| Cold DR scripts | `direct-response-ads-skill` | Called once per script in the batch |
| Static ads | `static-ad-skill` | Called once per static |
| Hammer Them retargeting | `hammer-them-skill` | Called once for the full retargeting bundle |
| Swipe-file / competitor lookups | `ads-research-skill` | Called during Phase 1 if `swipe-file.md` is stale or missing |

## Configuration flags

| Flag | Default | Effect |
|---|---|---|
| `--volume-path diverse-15-20` | yes | 15-20 unique diverse ads (Andromeda Path 2) |
| `--volume-path high-50-plus` | no | 50+ creatives/week (Andromeda Path 1) — requires creative-ops capacity |
| `--volume-path hybrid` | no | 15-20 diverse + each gets 3-5 iteration variants for volume |
| `--surfaces cold-dr,warm-up,retargeting,static` | all 4 | Restrict which surfaces produce |
| `--voice-tier-override generic` | no | Force GENERIC tier even if a voice file exists |
| `--locale UK` | auto-detect from `clients/[slug]/locale.md` | Forces British English + £ currency |
| `--dry-run` | no | Run Phases 0-2 only, write `plan.md` but skip produce |

## `/ads troubleshoot` mode

A separate invocation path. Loads `reference/if-this-then-that.md`. Asks the user which symptom they're hitting (low conversions / CTR <2% / learning limited / CPA too high / no-show rate / add-to-cart no purchase / calls not closing / leads not framed) and walks the diagnostic tree. Does not produce ads.

## Critical operating principles (non-negotiable)

1. **Voice Gate is blocking.** If Phase 0 returns tier "none" AND the user has not passed `--voice-tier-override generic`, refuse to proceed. Ask for a voice file or explicit override.
2. **Hook + Body + CTA are filmed as one cohesive unit.** Do not produce ads with interchangeable components — Andromeda kills surface-level variations.
3. **Every cold DR script carries diversification tags.** Dog-Food reason, cognitive bias, hook pattern, sub-framework. Missing tags = the batch is malformed.
4. **The batch as a whole must cover all top objections.** If Phase 2's coverage check fails, force the user to add scripts or accept a noted gap.
5. **Anti-AI-tell rules apply to every output, every tier.** Em-dashes, colon-lists, "designed for X" closers, generic filler — all forbidden in spoken copy.
6. **Funnel alignment is mandatory.** Every cold DR script declares what the landing page headline / sub-head / VSL opener must echo. The script and the page are one promise.
7. **Iteration recipes are mandatory.** Every cold DR script ships with 3-5 fatigue-refresh variants so the client never has to re-shoot from scratch when CPL creeps.

## Quick-start example

```
User: /ads terry

→ Phase 0 detects clients/Terry/knowledge-base/property-labs-synthesis.md §7
   Voice tier: FULL
   Anti-AI-tell rules: loaded
   Locale: UK (£, British English)

→ Phase 1 detects:
   ✓ offer KB at knowledge-base/packages/{foundation,scale,empire,inner-circle}.md
   ✓ ICP at knowledge-base/icp.md
   ✓ swipe file at knowledge-base/swipe-file.md
   ✓ case studies at knowledge-base/client-case-studies.md
   ✓ photo library at knowledge-base/photo-library.md
   ✓ funnel at knowledge-base/funnel.md → https://propertylabs.to/webinar
   ✓ objections at knowledge-base/objections.md (4 top)

→ Phase 2 proposes:
   - Volume path: diverse-15-20 (default)
   - Surfaces: cold-dr (20), warm-up (3), retargeting (8), static (8)
   - 22 candidate Dog-Food reasons → user confirms 18
   - Framework spread: 7 talking-head, 4 case-study, 3 objection-first, 2 demo, 1 Q&A, 1 skit
   - Objection coverage: 4/4 ✓

→ Phase 3 produces:
   clients/Terry/ads/2026-05-11-001/
   ├── briefing.md
   ├── index.md
   ├── cold-dr/  (18 .md scripts)
   ├── warm-up/  (3 .md scripts)
   ├── retargeting/  (8 .md scripts)
   └── static/  (8 .md scripts)
```
