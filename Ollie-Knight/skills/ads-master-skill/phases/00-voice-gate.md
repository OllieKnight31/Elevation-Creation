# Phase 0 — Voice Gate (BLOCKING)

This phase runs FIRST on every invocation. It refuses to proceed unless voice handling is resolved.

## Inputs

- The client slug (positional arg or detected from user prompt)
- Optional `--voice-tier-override generic` flag

## What it does

### Step 1 — Locate voice asset

Read these files **in order** until one is found:

1. `clients/[slug]/knowledge-base/voice.md`
2. `clients/[slug]/knowledge-base/[slug]-synthesis.md` (look for `## Voice` or `§ 7` section)
3. `clients/[slug]/voice-memo.md`
4. `clients/[slug]/knowledge-base/brand-voice.md`
5. Any file in `clients/[slug]/**` whose name contains "voice"

Note Terry-specific path: `clients/Terry/knowledge-base/property-labs-synthesis.md` §7.

### Step 2 — Score voice tier

Read the voice asset (if found) and classify:

| Tier | Criteria |
|---|---|
| **FULL** | ≥500 words of first-person samples AND an explicit list of "do" or "don't" rules (or a §-tagged voice section listing tone markers) |
| **PARTIAL** | Voice asset exists but either samples or rules are missing |
| **NONE** | No voice asset found |

### Step 3 — Apply tier behaviour

| Tier | Action |
|---|---|
| FULL | Load voice asset into context. Load `reference/anti-ai-tells.md`. Continue to Phase 1. |
| PARTIAL | Load what exists. Ask the user via AskUserQuestion to confirm tone markers, signature phrases, banned phrases. Then continue to Phase 1. |
| NONE | If `--voice-tier-override generic` was passed, mark outputs as GENERIC and continue. Otherwise STOP and ask: "No voice asset for `[slug]`. Provide one of: (a) path to voice file, (b) paste 500+ words of brand voice samples here, (c) pass `--voice-tier-override generic`." |

### Step 4 — Detect locale

Read `clients/[slug]/locale.md` if it exists. If not:

- Check user memory for locale hints (Terry = UK per memory note)
- Default to UK if any UK-specific terms appear in offer KB (£, VAT, Companies House, council tax, "programme")
- Otherwise ask the user once

Store as `locale: UK | US | other` for downstream phases to apply currency + spelling rules.

### Step 5 — Write state

Write Phase 0 state to `clients/[slug]/ads/[YYYY-MM-DD-batch-N]/.phase-0-state.yaml`:

```yaml
batch_id: 2026-05-11-001
client_slug: terry
voice_tier: full
voice_source: clients/Terry/knowledge-base/property-labs-synthesis.md#voice
locale: UK
anti_ai_tells_loaded: true
override_used: false
```

## Outputs

- A loaded voice context (or GENERIC marker)
- A loaded anti-AI-tells context (always)
- A locale tag (used by every subsequent phase)
- A state file so Phase 1+ knows what's already resolved

## Critical rules

1. **No ad copy may be produced if voice_tier is NONE without the override flag.** Hard stop.
2. **Anti-AI-tells are loaded regardless of tier.** They apply to GENERIC outputs too.
3. **Locale defaults to UK for Terry** (memory: `feedback_currency_gbp`, British English). For new clients, ask if ambiguous.
4. **GENERIC outputs MUST be stamped.** Every file's body must open with `<!-- TIER: GENERIC — needs voice pass before publishing -->`.
