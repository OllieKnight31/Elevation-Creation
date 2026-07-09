# Phase 1 — Discovery (auto-detect from client folder)

Phase 0 has resolved voice + locale. Now we gather the rest of what's needed to write ads.

## Inputs

- Phase 0 state file
- Read access to `clients/[slug]/**`

## What it does

### Step 1 — Detection pass

Use `scripts/detect-client-inputs.sh [slug]` (or read directly) to check which canonical inputs exist:

| Input | Canonical path(s) | Used for |
|---|---|---|
| Offer KB | `clients/[slug]/knowledge-base/offer.md` OR `clients/[slug]/knowledge-base/packages/*.md` | Dog-Food reasons, CTA framing, price anchor |
| ICP / target persona | `clients/[slug]/knowledge-base/icp.md` | Hook customisation, language match |
| Case studies / proof | `clients/[slug]/knowledge-base/client-case-studies.md` | Body copy proof points, case study sub-framework |
| Swipe file / competitor library | `clients/[slug]/knowledge-base/swipe-file.md` | Hook patterns already validated in niche |
| Photo / video library metadata | `clients/[slug]/knowledge-base/photo-library.md` | Filming directions, b-roll selection |
| Funnel destination | `clients/[slug]/knowledge-base/funnel.md` | CTA URL, funnel-alignment notes per script |
| Top objections | `clients/[slug]/knowledge-base/objections.md` OR derive from sales call transcripts | Objection-first scripts + batch-level coverage check |
| Existing creative briefing | `clients/[slug]/knowledge-base/creative-brief.md` | Style continuity if client already has live ads |
| Locale | already resolved in Phase 0 | Currency + spelling |

### Step 2 — Gap-fill

For each missing input, decide whether it's BLOCKING or NON-BLOCKING:

**Blocking missing inputs** (must be resolved before Phase 2):
- Offer KB — without this we can't extract reasons
- ICP — without this we don't know who the ads target
- Funnel destination — without this the CTA has nowhere to point
- Top objections (at least 2) — without these the batch can't pass coverage check

**Non-blocking missing inputs** (warn but proceed):
- Case studies (the batch will skip case-study sub-framework)
- Swipe file (the batch can't reference competitor validations, but can still write)
- Photo library (filming directions become generic)
- Creative brief (no style continuity check)

Ask all missing blocking inputs in a SINGLE consolidated AskUserQuestion call:

```
"Missing inputs for [slug]:
1. Offer KB — paste path or content
2. ICP — paste path or content
3. Top objections — list 2-4 in priority order"
```

Don't ask for non-blocking inputs unless the user explicitly opted into a surface that needs them.

### Step 3 — Optional refresh via ads-research-skill

If `--refresh-swipe` flag passed OR swipe file is older than 30 days OR doesn't exist, invoke `ads-research-skill` to pull fresh competitor patterns in-niche. Write to `clients/[slug]/knowledge-base/swipe-file.md`.

### Step 4 — Write discovery summary

Write `clients/[slug]/ads/[batch]/discovery-summary.md`:

```markdown
# Discovery Summary — [client] — [batch_id]

## Inputs found
- ✓ Offer KB: knowledge-base/packages/{foundation,scale,empire,inner-circle}.md
- ✓ ICP: knowledge-base/icp.md
- ✓ Swipe file: knowledge-base/swipe-file.md (last refreshed 2026-05-11)
- ✓ Case studies: knowledge-base/client-case-studies.md
- ✓ Photo library: knowledge-base/photo-library.md (94 photos)
- ✓ Funnel destination: https://propertylabs.to/webinar
- ✓ Top objections: knowledge-base/objections.md (4 documented)

## Inputs missing
- ⚠ Creative brief (non-blocking; will use defaults)

## Offer summary
[2-3 sentence extract from offer KB]

## ICP summary
[2-3 sentence extract from ICP doc]

## Top objections in priority order
1. ...
2. ...
3. ...
4. ...

## Locale + voice (from Phase 0)
- Locale: UK (£, British English)
- Voice tier: FULL
- Voice source: knowledge-base/property-labs-synthesis.md#voice

## Funnel destination
- URL: https://propertylabs.to/webinar
- Page type: webinar opt-in
- Landing page headline (to echo): "[exact headline]"
- Landing page sub-head (to echo): "[exact sub-head]"

## Photo library highlights
- [Top 5 portraits ranked by face-position + mechanism-fit metadata]
- [Top 3 b-roll clips ranked by relevance to offer]
```

The user reviews this summary at the end of Phase 1 before Phase 2 starts. Allows them to catch a wrong offer file, stale swipe data, or wrong funnel URL before producing 20 ads.

## Outputs

- `clients/[slug]/ads/[batch]/discovery-summary.md`
- Updated Phase 0 state file with discovery info merged in

## Critical rules

1. **Don't make up missing data.** If the offer KB doesn't list a price point, ask. Don't infer.
2. **Read the actual files, don't trust filenames.** A file called `voice.md` that contains 3 lines isn't a voice asset.
3. **Show the summary to the user.** Pause for confirmation before Phase 2.
4. **If Terry, use known paths.** From memory: `clients/Terry/knowledge-base/`. Don't re-search.
