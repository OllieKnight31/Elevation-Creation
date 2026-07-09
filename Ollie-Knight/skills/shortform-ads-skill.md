---
name: shortform-ads
description: Use this skill when the user wants to turn long-form or already-cut video footage into publish-ready short-form ads for Instagram Reels, TikTok, YouTube Shorts, IG Feed, or paid Meta/TikTok ad placements. This is the final render layer for video ads across the skill stack — it accepts scripts from direct-response-ads / hammer-them / vsl-script / webinar-script / content / hooks / founders-framework / start-here / ig-story / ads-research, transforms long-form into short-form via AI clip selection, renders with semantic-animated captions, contextual B-roll, broadcast-quality audio, an ad-format kit (hook overlay / social proof / offer card / CTA end-card / FTC disclaimer), and outputs multi-aspect (9:16 / 1:1 / 16:9 / 4:5) in a single pass. Multi-tenant — reads clients/{slug}/offer-kb.md + client-story.md for brand voice. Triggers on phrases like "render this for ads", "make a short-form ad", "build an IG Reel ad", "turn this VSL into teaser clips", "make TikTok ads from my footage", "/shortform-ads [slug]", "build short-form ads for [client]", "render the ads-research scripts as videos", "make a viral cut of this", "Submagic-style captions", "Hormozi-style captions", "edit this for paid ads", "auto-clip for ads", "OpusClip but with my brand voice", "render this VSL as 30-second teasers", "build 15s paid ad from this footage", "make a 9:16 with captions and B-roll", or "render this for IG / TikTok / YouTube Shorts". Also triggers when the user mentions caption animation, semantic animation triggers, AI B-roll insertion, multi-platform ad render, FTC-compliant ad disclaimer, or wants a finished short-form ad video produced from raw footage.
version: 1.0.0
---

# Shortform Ads Skill

The final render layer for short-form video ads. Cuts long-form footage to short-form clips, renders with semantic-animated captions + contextual fal.ai B-roll + broadcast-quality audio + ad-format kit (hook / social proof / offer / CTA / disclaimer), outputs multi-aspect per render. Multi-tenant. Reads client offer-kb and client-story for brand voice. Sister skill to `clip-tool-skill` (which stays for organic / personal-brand cuts).

**KB:** `/Users/oliverknight/Jarvis/shortform-ads-kb/`
**Project:** `/Users/oliverknight/Jarvis/shortform-ads/`
**Output:** `/Users/oliverknight/Jarvis/shortform-ads-output/{client}/{date}/` + Drive `Clips/Ads/{client}/{date}/`

## Phase 0 — Mode router

Parse the user's intent into one of six modes. Re-prompt only if genuinely ambiguous.

| Mode | Triggers | What it does |
|---|---|---|
| `spec` | "edit plan only", "EDL only", "no render" | Produces Edit Decision List JSON + caption timing + animation cues + music pick. Hands off to human editor. |
| `code` | "generate Remotion code only", "skip render" | Produces a ready-to-render Remotion project (composition, schema-validated props JSON, B-roll cached). User runs `npx remotion render`. |
| `clip-ad` | default for long-form input; "clip up for ads", "cut into ads" | Full pipeline: long-form → 1-N short-form ads with hook generation, B-roll, captions, audio polish, ad-format kit. |
| `overlay-ad` | already-cut input; "add ad overlay", "apply ad kit", "make this an ad" | Skip cutting. Apply captions + triggers + ad-kit + audio polish to existing edit. |
| `multi-platform` | "render for all platforms", "9:16 + 1:1 + 16:9", "every aspect" | One ad spec → all 4 aspect ratios with per-platform safe zones. Add-on to clip-ad/overlay-ad. |
| `teaser` | VSL/webinar input; "make teasers", "cut this VSL into shorts" | Long-form sales asset → 30-90s teaser clips driving back to full asset. |

Default if not specified: `clip-ad` for long-form input, `overlay-ad` for short input (<3 min).

## Phase 1 — Resolve brand voice (mandatory)

Multi-tenant: this skill renders for any client. Resolve voice in order:

1. `--client <slug>` flag or "for [client]" in prompt → read `/Users/oliverknight/Jarvis/clients/{slug}/offer-kb.md` + `client-story.md`
2. If "Ollie" / "Knxght" / no slug given → default to `/Users/oliverknight/Jarvis/clip-tool/selector/brand_voice.md`
3. Neither exists → stop and run `offer-deepdive-skill` first

From the offer-kb extract and pass to all downstream stages:
- **Verbatim phrases** → caption emphasis candidates + hook seeds
- **Mechanism name** → on-screen callout opportunities + offer card title
- **ICP language** → hook generation tone + caption emphasis defaults
- **Proof anchors** → social proof bar content (e.g., "200+ clients", "98% success rate")
- **Tier prices** → offer card numbers
- **Risk reversal** → CTA card text
- **Niche** → caption style default + B-roll prompt template + niche-specific FTC disclaimer

## Phase 2 — Ingest

Accept any of:
- Local file path (`.mp4`, `.mov`, `.mkv`)
- YouTube URL (yt-dlp under the hood)
- Drive folder URL (batch — process every video ≥60s)
- Drive file URL (single video)
- Pre-existing transcript JSON + video pair

Skip patterns from clip-tool apply: files <60s, files with 0 transcribed words, internal team strategy calls, vlog logistics, screen-share troubleshooting.

## Phase 3 — Transcribe + prosody

- `faster-whisper` (model: small default, medium for accents/jargon) with word-level timestamps — cached in `.cache/transcripts/`
- Prosody features via `librosa` (RMS) + `parselmouth` (F0) + duration per word
- Compute emphasis score per word: `0.40·RMS_norm + 0.35·F0_norm + 0.25·duration_norm` (sigmoid against clip medians). Range 0-1. See `animation-triggers.md` §2.

## Phase 4 — AI clip selection (clip-ad / teaser modes)

For each source video, Claude reads `transcript + offer-kb + client-story + ad-frameworks.md` and returns clip decisions using the **Opus virality rubric** (extended) from `competitive-analysis.md`:

- **Hook (0-99)** — pattern interrupt strength, curiosity gap, first-3s pull
- **Flow (0-99)** — coherent narrative arc start→end without context dependency
- **Value (0-99)** — specific insight / proof / mechanism vs filler
- **Trend (0-99)** — relevance to current platform algo signals

Total threshold for clip-worthy: ≥220/396 (≥55% avg). 1-N clips per source. Each decision has:

```json
{
  "headline": "stop performing. just be yourself.",
  "topic_slug": "stop-performing",
  "target_length": "30s",
  "keep_segments": [{"start": 276.23, "end": 302.21}, {"start": 310.63, "end": 349.91}],
  "hook_variants": ["text", "vo-replace", "cold-open-broll"],
  "caption_style": "submagic",
  "music_path": "...",
  "scores": {"hook": 78, "flow": 72, "value": 84, "trend": 65}
}
```

If Anthropic API is blocked: fall back to inline-Claude mode like clip-tool — read transcripts in chat, hand-write decisions JSON, then orchestrator runs from decision step onward.

## Phase 5 — Hook generation (3-5 alternatives per clip)

For each accepted clip, generate hook alternatives reading:
- `offer-kb.md` (mechanism + ICP pain + verbatim phrases)
- `client-story.md` (origin moment + transformation)
- `/Users/oliverknight/Jarvis/hooks-kb/00-master.md` (12-category taxonomy)
- `ad-frameworks.md` §1 (hook frameworks 2026)

Each hook is one of:
- **Text-overlay hook** (first 3s caption card, no audio change)
- **VO-replace hook** (Claude rewrites first 3-5s + ElevenLabs voice cloned over original visuals + optional Sync.so lip-sync)
- **Cold-open B-roll hook** (3s fal.ai-generated visual + voice-over)

Surface to user as picklist. User picks one per clip (or "all 5 — render variants").

## Phase 6 — Cut & stitch

Use clip-tool's `edit/cut_stitch.py` via thin adapter. Word-boundary cuts with 50ms audio fades. Stitch to intermediate (`.cache/edits/`).

Aspect-aware target dim:
- Portrait source → 1080×1920 fullscreen
- Landscape source → 1080×608 (16:9 letterboxed in 9:16 canvas)
- Multi-platform mode → stitch once, render compositions multiple times

## Phase 7 — Audio pipeline

Apply from `audio-pipeline.md` §8 full chain to the stitched intermediate:

1. **Voice isolation** — ElevenLabs Voice Isolator (mid tier, ~$0.04/min) OR RNNoise (free, lower quality)
2. **Loudness normalisation** — `ffmpeg loudnorm` two-pass to **-14 LUFS** (IG/TikTok/YT standard), true peak -1.5 dBTP
3. **Sidechain ducking** — music ducked under voice via `sidechaincompress` (baked into music track before Remotion ingest)
4. **De-ess + EQ** — `firequalizer` presence boost (2-5 kHz), low-cut at 80 Hz
5. **VO replacement** (only if hook is VO-replace) — ElevenLabs IVC + optional Sync.so lip-sync via fal.ai

Pipeline output: voice-isolated `voice.wav` + ducked `music.wav` → Remotion combines them via `<Audio>` components.

## Phase 8 — B-roll generation (fal.ai)

For each clip, identify B-roll insertion points (every 4-6s, max 6 per 30s ad). For each point:

1. **Transcript phrase → prompt** — apply transcript-to-prompt translation patterns from `broll-fal-pipeline.md` §4 (niche template + metaphor library)
2. **Model selection** — best model per shot type from `broll-fal-pipeline.md` §6:
   - Talking-head replacement → Kling 2.6 Pro (best character fidelity)
   - Product / object → Seedance 2.0 (fast, sharp)
   - Abstract / concept → Veo 3.1 Fast (cinematic + cheap)
   - Transformation / before-after → Veo 3.1 Standard
   - Action / movement → Sora 2
   - Slow cinematic → Veo 3.1 Standard (10s)
   - Cost ceiling per cut: $0.30 ($1.80 per 6-cut clip)
3. **3-layer cache** — hash → prompt → semantic (≥0.92 fuzzy) → skip generation if hit
4. **Fallback chain** — fal.ai → cheaper fal.ai backup → Pexels API → Pixabay API → solid-colour card with text. Stop at first success.
5. **Render insertion** — B-roll cuts in Remotion as `<Sequence>` blocks with `<OffthreadVideo>` (frame-exact)

## Phase 9 — Animation trigger detection

Build trigger timeline JSON for the clip. From `animation-triggers.md` §1, detect all 50 trigger types via:

- **Keyword + regex** — money symbols, comparison phrases ("not X but Y"), negation, urgency words
- **NER** — names of people, locations, organisations (via spaCy)
- **Prosody** — emphasis score ≥0.75 fires `emphasis_pump`
- **Claude validation pass** — semantic classification picks up triggers regex missed (sarcasm, reframes, curiosity gaps)

Apply "don't fire too often" rules:
- Max 1.5 triggers/second rolling window
- Min 2.5s gap between high-intensity triggers (screen_shake, flashing_border)
- 40% family-balance cap (no family >40% of total triggers)
- Intensity decay across clip (later triggers softer than first-third triggers)

Output JSON consumed by `TriggerRenderer.tsx`:

```json
{
  "fps": 30,
  "clip_mood": "urgent",
  "triggers": [
    {"id":"t1","time":1.20,"type":"hook_snap","duration_frames":18,"intensity":0.9,"layer":"top","z_index":50},
    {"id":"t2","time":4.85,"type":"number_pop","value":"£500K","duration_frames":24,"intensity":0.85,"layer":"middle","z_index":40},
    {"id":"t3","time":12.40,"type":"comparison_split","value":["volume","precision"],"duration_frames":45,"intensity":0.75,"layer":"full","z_index":30}
  ]
}
```

## Phase 10 — Caption style (per-clip selectable)

Four styles. Default per niche from `competitive-analysis.md` taxonomy:

| Style | Component | Default niche | When to use |
|---|---|---|---|
| Submagic word-pump | `SubmagicPage.tsx` (verbatim port from official template-tiktok per `remotion-deep.md` §3.1) | Fitness, dating, mindset, content creators | TikTok/Reels organic, paid ads with strong hook |
| Phrase-chunk (3-4 words) | `PhraseChunk.tsx` (from clip-tool baseline) | Coaches, consultants (Knxght default) | Talking-head, longer clips, B2B-leaning |
| Karaoke fill | `KaraokeFill.tsx` | Education, longer-form storytelling | Where reader scans ahead, sentence comprehension matters |
| Lower-third bar | `LowerThird.tsx` | B2B SaaS, premium consulting, finance | Cinematic / premium feel, restrained styling |

User override: `--caption-style submagic|phrase-chunk|karaoke|lower-third` or per-clip in decision JSON.

All four styles use `@remotion/captions` `Caption` type (`text`, `startMs`, `endMs`, `confidence`, `timestampMs`). Word emphasis from prosody score overlays uniformly across all styles.

## Phase 11 — Ad-format kit

Auto-assembled per clip from offer-kb extracts. Each component optional, defaults from `ad-frameworks.md` §4:

| Component | Source | Render |
|---|---|---|
| Hook overlay | Generated text or VO-replaced first 3s | First 3s — snap-in card (intensity 0.9) |
| Pattern-interrupt cuts | Trigger timeline | Every 3-5s — `whipPan` transition or `clockWipe` |
| Social proof bar | offer-kb proof anchors (e.g., "200+ clients", "98% success rate") | Mid-clip — ticker slide-in for 4s |
| Offer card | offer-kb tier prices | Optional — 8-12s into clip OR end-card |
| CTA end-card | offer-kb risk reversal + niche-default verb | Last 3s — text + arrow + audio cue ("link in bio" / "book a call") |
| Disclaimer | FTC rules + claim detection | Bottom 8% safe zone for full clip duration if earnings/health claim made |
| Urgency strip | If user passes `--urgency` flag | Top safe zone — flashing border + countdown |

## Phase 12 — Multi-aspect render

Single composition, parameterised dims. Per `remotion-deep.md` §11 safe zones:

| Aspect | Resolution | Use | Safe zones |
|---|---|---|---|
| 9:16 | 1080×1920 | IG Reels, TikTok, YT Shorts | Top 12% (TikTok UI) + bottom 18% (caption strip) avoided. Right 14% (TikTok action rail) avoided for full TikTok export. |
| 1:1 | 1080×1080 | IG Feed | Top 8% / bottom 8% caption-safe |
| 16:9 | 1920×1080 | YouTube ads | Bottom right 200×60 (YT clickable card) avoided |
| 4:5 | 1080×1350 | IG Feed alternative | Top 8% / bottom 8% caption-safe |

Codec per platform from `remotion-deep.md` §11 export profile table:
- TikTok / Reels: H.264, 8-10 Mbps, AAC 192kbps
- YouTube Shorts: H.264, 10-12 Mbps
- Paid Meta: H.264, 8 Mbps, max 4GB

Render concurrently when on Lambda (~$0.017 per 1-min embedded). Local-only: sequential, ~2-3 min wall time per aspect.

## Phase 13 — QA gate (auto)

Before delivery, run automated checks (`qa/checks.py`):

- ✓ Hook present in first 3s (either text overlay OR audio energy peak)
- ✓ CTA present in last 3s
- ✓ LUFS in -14 ± 1 range
- ✓ True peak ≤ -1 dBTP
- ✓ Captions in safe zone for target platform
- ✓ No caption text-overlay overlap (no two text elements occupying same Y-band)
- ✓ FTC disclaimer attached if earnings/health/transformation claim detected
- ✓ Total length within target range ±15%
- ✓ No B-roll cuts <0.8s (jitter risk)
- ✓ All assets resolved (no Remotion `staticFile` 404s)

Failures: surface to user with line-by-line list. Don't auto-fix (require explicit confirm to re-render).

## Phase 14 — Deliver

Output goes to **both** local + Drive:

- Local: `/Users/oliverknight/Jarvis/shortform-ads-output/{client-slug}/{YYYY-MM-DD}/`
- Drive: `Clips/Ads/{client-slug}/{YYYY-MM-DD}/` (auto-create folder if missing, mirror clip-tool's `find_or_create_folder` pattern)

Per clip, write to both locations:
- `{stem}_9x16.mp4` (and `_1x1`, `_16x9`, `_4x5` if multi-platform)
- `{stem}_manifest.json` — full pipeline metadata (transcript path, decision JSON, hook chosen, B-roll prompts, trigger timeline, music, QA result, costs)
- `{stem}_thumbnail.jpg` — first-frame thumbnail for Drive review

Manifest file naming: `{source-stem}_{NN}_{topic-slug}_{aspect}.mp4`.

Final summary printed to user: `N clips × M aspects = X files, total spend $Y, all clips in {drive_link}`.

## Inputs to collect

When the user invokes this skill, collect (re-prompt only if essential):

**Required:**
- Source video (path / URL / Drive folder / transcript+video pair)
- Client slug (or "Ollie" for default Knxght brand)

**Optional (sensible defaults if omitted):**
- Mode (default: `clip-ad` for long-form, `overlay-ad` for short)
- Target lengths (default: 30s for clip-ad, source-length for overlay-ad; or list e.g. `15,30,60` for multi-length)
- Target aspect(s) (default: `9:16`; or `all` for multi-platform)
- Caption style (default: niche default from style table)
- Music override (default: rotate from existing 9-track library based on mood)
- B-roll cap per clip (default: 6 cuts per 30s)
- Cost ceiling (default: $3/clip alert)
- Ad-kit components on/off (default: all enabled, but hook + CTA mandatory)

## How to run

```bash
cd /Users/oliverknight/Jarvis/shortform-ads

# Clip-ad mode — long-form to short-form ads
.venv/bin/python cli.py clip-ad \
  --input "https://drive.google.com/drive/folders/<id>" \
  --client seyam \
  --target-lengths 15,30,60 \
  --aspects 9x16,1x1 \
  --caption-style submagic

# Overlay-ad mode — apply ad kit to existing edit
.venv/bin/python cli.py overlay-ad \
  --input ~/Movies/cut.mp4 \
  --client seyam \
  --headline "stop dirty bulking" \
  --caption-style submagic \
  --aspects 9x16

# Multi-platform — one ad to all 4 aspects
.venv/bin/python cli.py multi-platform \
  --input output/seyam/2026-05-12/clip01_9x16.mp4 \
  --client seyam

# Teaser mode — VSL/webinar to teaser clips
.venv/bin/python cli.py teaser \
  --input ~/Movies/vsl-full.mp4 \
  --client seyam \
  --target-lengths 30,60,90 \
  --count 5

# Spec mode — EDL only, no render
.venv/bin/python cli.py spec \
  --input <video> \
  --client seyam \
  --output edl.json
```

## When inline-Claude fallback mode is required

If Anthropic API credits exhausted: skill detects 401/quota errors and switches to inline mode. User reads each transcript in chat, hand-writes decision JSON (same format as clip-tool `.cache/batch_decisions_*.json` with added `hook_variants`, `caption_style`, `target_length`, `scores` fields), then runs `cli.py clip-ad --decisions-json <path>`. Pipeline identical from decision step onward.

## Cross-skill auto-handoff

After successful render, prompt user with relevant next actions based on what was produced:

- If `clip-ad` paid: "Push to Meta Ads as drafts via Marketing API? [requires META_ACCESS_TOKEN]"
- If `teaser` from VSL: "Stage these as IG Reels/TikTok organic in the funnel? Pairs with `hammer-them-skill` retargeting setup."
- If hook variants rendered: "Run A/B test plan via `direct-response-ads-skill` scale-plan mode?"
- If multi-platform: "Generate platform-specific captions/hashtags via `caption-skill`?"

Skills that AUTO-HANDOFF TO this skill at end of their run:

| From skill | Trigger phrase | What they pass |
|---|---|---|
| `direct-response-ads-skill` | "render these as videos?" | script batch JSON + offer-kb context |
| `hammer-them-skill` | "render the content retargeting clips?" | content pillar scripts + audience defs |
| `vsl-script-skill` (any mode) | "cut into short-form teasers?" | VSL recording or full asset link |
| `webinar-script-skill` | "cut into ads/teasers?" | webinar recording |
| `content-skill` | "render the short-form ideas?" | idea batch + hook variants |
| `hooks-skill` | "render against this footage?" | hook batch + footage source |
| `founders-framework-skill` | "build video version of pinned post?" | mechanism script |
| `start-here-skill` | "build video Start Here?" | story sequence |
| `ig-story-skill` | "render stories as reels?" | story slides |
| `ads-research-skill` | "render the 50 scripts?" | script batch |

## Output structure

```
shortform-ads-output/
└── {client-slug}/
    └── {YYYY-MM-DD}/
        ├── {source-stem}_01_{topic}_9x16.mp4
        ├── {source-stem}_01_{topic}_9x16_manifest.json
        ├── {source-stem}_01_{topic}_9x16_thumb.jpg
        ├── {source-stem}_01_{topic}_1x1.mp4
        ├── ... (one set per clip × aspect)
        ├── _run_manifest.json    # global run summary (cost, durations, links)
        └── _qa_report.md         # QA findings across all clips
```

Drive mirror: `Clips/Ads/{client-slug}/{YYYY-MM-DD}/` (same files, no JSON manifests in Drive — those stay local).

## Cost ceilings (per clip, single 9:16 aspect)

- Transcribe + prosody: $0 (local)
- Clip selection + hook gen + trigger detection: ~$0.05 (Claude Sonnet)
- B-roll (6 cuts × 3s, Veo 3.1 Fast): ~$0.90
- Voice isolation: ~$0.04 (ElevenLabs)
- VO replacement (when used): +$0.20 ElevenLabs + $0.30 Sync.so = +$0.50
- Render: $0 local / +$0.017 Lambda per 1-min embedded
- **Default budget: ~$1.00/clip**, **VO-replace: ~$1.50/clip**, **alert ceiling: $3.00/clip**

Multi-platform adds B-roll cache hit (~80% per additional aspect — B-roll generated once) + render cost. Roughly +25% per extra aspect.

## Brand voice (when client slug omitted)

Default to Knxght (Ollie). Read `/Users/oliverknight/Jarvis/clip-tool/selector/brand_voice.md` for full reference. Headline rules apply across all clips:

- Lowercase, sans-serif, no emoji/quotes/exclamation marks
- 3-7 words hard cap (above wraps badly)
- Verbatim brand phrases preferred when present in source
- No AI-tells ("the secret to", "what nobody tells you", "this changes everything")

For other clients, the offer-kb's voice rules override Knxght rules.

## Defaults baked in

- Canvas: 1080×1920 @ 30fps (9:16); 1080×1080 (1:1); 1920×1080 (16:9); 1080×1350 (4:5)
- Codec: H.264 CRF 18, AAC 192kbps (TikTok/Reels/YT-Shorts profile)
- Caption fonts: Inter for phrase-chunk/lower-third; Bebas Neue for Submagic uppercase; Anton for big numbers
- B-roll cuts: max 6 per 30s (cost+pacing ceiling)
- Trigger cap: 1.5/sec rolling, 2.5s gap between high-intensity
- Music: existing 9-track library, mood-matched via tag (extend `music_config.json` with mood/bpm/energy/key)
- VAD-based music ducking: -8 dB during voice (sidechain bake)
- Hook in first 3s, CTA in last 3s (hard requirement)
- FTC disclaimer auto-attach for earnings/health/transformation claims (1.5s fade-in, bottom safe zone, full clip duration)

## KB file references (load when relevant)

| KB file | When to load |
|---|---|
| `00-master.md` | Architecture / mode router clarification |
| `remotion-deep.md` | Composition code, `@remotion/*` package usage, caption components, multi-aspect, Lambda |
| `competitive-analysis.md` | Caption theme picks, virality rubric, differentiators |
| `animation-triggers.md` | Trigger taxonomy, prosody formula, schema |
| `broll-fal-pipeline.md` | Model selection, prompting, cache, fallback |
| `audio-pipeline.md` | ffmpeg chains, VO replacement, loudnorm targets |
| `ad-frameworks.md` | Hook frameworks, pacing, FTC, niche conventions, end-cards |

Each KB file lives in `/Users/oliverknight/Jarvis/shortform-ads-kb/`. Don't reload all on every invocation — load only the files relevant to the current mode/decision.

## Notes on what this skill does NOT do

- **Does not write ad scripts** — that's `direct-response-ads-skill`, `hammer-them-skill`, `ads-research-skill`. This skill renders existing scripts as video.
- **Does not generate static image ads** — that's `static-ad-skill`.
- **Does not replace `clip-tool-skill`** — that's for organic/personal cuts; this is for ad-shaped output with kit.
- **Does not write VSL/webinar copy** — that's `vsl-script-skill` / `webinar-script-skill`. This renders teaser clips from already-recorded sales assets.
- **Does not handle thumbnails for YT long-form** — that's `thumbnail-skill`.
- **Does not push directly to ad accounts yet** — Meta/TikTok API integration is Phase 2. For now, outputs land in Drive for manual upload.
