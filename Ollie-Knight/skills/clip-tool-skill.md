---
name: clip-tool
description: Use this skill when the user wants to cut long-form video content into Instagram-ready short-form clips, OR add a headline + karaoke captions + background music overlay to an already-edited video. Two modes — Mode A clips & edits long-form to short-form via AI clip selection, transcript-driven cutting, aspect-aware rendering (portrait fullscreen or 16:9 letterbox in 9:16 canvas), 3-4 word phrase captions, and a curated trending music library. Mode B skips the cutting and just renders the headline + captions + music overlay onto an input video. Triggers on phrases like "clip up [my video / this content]", "cut my long-form into short-form", "make a reel from this footage", "add a headline to my video", "overlay captions on my video", "render this with a headline", "/clip-tool", "/clips", "build clips from my Drive folder", "process this Drive folder of consulting calls". Also triggers when the user mentions "Olli Files" content, Knxght Consulting branding, or wants to batch-process a folder of footage.
version: 1.0.0
---

# Clip Tool Skill

Cuts long-form video (consulting calls, camera-direct content, vlogs) into Instagram-ready short-form clips with headline + phrase captions + trending music. Two modes.

**Project root:** `/Users/oliverknight/Jarvis/clip-tool/`

## When to use

Mode A — full clip pipeline:
- "clip up [this video / my Drive folder]"
- "cut my long-form into short-form"
- "process this folder of consulting calls"
- "make reels from this content"
- "build clips from /Users/.../footage"

Mode B — overlay only (input already edited):
- "add a headline to this video"
- "overlay captions on my edit"
- "render this with headline + music"
- "I've already cut the clip, just add the brand layer"

## Mode A — Full clip pipeline

### What it does
1. Lists viable videos in a Drive folder (≥60s, video MIME)
2. Downloads each
3. Transcribes locally with faster-whisper (word-level timestamps)
4. AI clip selection — Claude reads the transcript and returns 1-3 clip edit decisions per source (`keep_segments` as non-contiguous time ranges to splice, plus a lowercase headline and topic slug). Falls back to manual decision JSON if API is blocked.
5. FFmpeg cuts at word boundaries with 50ms audio fades, scales to target dim, concatenates
6. Remotion composes:
   - **Portrait source** → fills 1080×1920 canvas; headline at top with gradient overlay
   - **Landscape source** → 16:9 letterboxed in 9:16; headline at bottom of upper bar
   - Phrase captions (3-4 words, 46px Inter ExtraBold) below chin (portrait) or at 78% (landscape)
   - Background music underbed at ~0.07 volume with start-offset (skips silent intros)
7. Uploads to `Clips/Done/` in output Drive folder, naming `<source-stem>_<NN>_<topic-slug>.mp4`

### Inputs to collect from user
- **Source Drive folder URL** (the long-form videos)
- **Output Drive folder URL** (where `Clips/Done/` lives — auto-created)
- Optional: per-clip music override (skill picks from 9-track rotation by default)

### How to run
```bash
cd /Users/oliverknight/Jarvis/clip-tool

# Write decisions JSON (Claude AI selects clips, OR manual override)
# Format: see .cache/batch_decisions_*.json examples

.venv/bin/python batch_orchestrate.py .cache/batch_decisions_<name>.json
```

### Anthropic API status note
Original automation uses Claude API for clip selection. If credits are out, **fall back to inline-Claude mode**: read each transcript directly in the chat conversation, hand-write a decisions JSON with `keep_segments` and `headline` per clip, then run `batch_orchestrate.py`. The pipeline is identical past the decision step.

## Mode B — Overlay only

### What it does
Takes an already-cut video and renders the brand overlay (headline + karaoke captions + music) without re-cutting. No transcription/selection AI involved beyond captions.

### How to run
```bash
cd /Users/oliverknight/Jarvis/clip-tool

.venv/bin/python overlay_only.py <video_path> "<headline>" \
    [--music <track-filename>] \
    [--music-volume 0.07] \
    [--output output/my-clip.mp4] \
    [--upload-folder <drive_folder_id>]
```

Example:
```bash
.venv/bin/python overlay_only.py ~/Movies/edit-1.mp4 "stop performing" \
    --music tycho-a-walk.mp3 --upload-folder 1Ojia_LonfZCxRU8MXv3OgSqqM9CQgMmo
```

## Music library

Curated 9-track library at `/Users/oliverknight/Jarvis/clip-tool/music/` with per-track start offsets in `music_config.json` (skips silent intros so the engaging part lands with the clip).

| Track | Mood | Start offset |
|---|---|---|
| coldplay-sparks-instrumental.mp3 | reflective, emotional | 40s |
| boniver-holocene-instrumental.mp3 | vulnerable | 38s |
| hozier-cherry-wine-instrumental.mp3 | acoustic, gentle | 8s |
| tycho-a-walk.mp3 | atmospheric tactical | 40s |
| bonobo-cirrus.mp3 | atmospheric build | 15s |
| cigarettes-apocalypse-instrumental.mp3 | moody atmospheric | 8s |
| frank-ocean-pink-white.mp3 | chill modern | 0s |
| olafur-arnalds-near-light.mp3 | modern neoclassical | 28s |
| nils-frahm-says.mp3 | slow building piano | 90s |

To add more tracks: drop the MP3 in `music/`, demucs-strip vocals if needed (`.venv/bin/python -m demucs --two-stems=vocals -o music/separated music/<file>.mp3`), then add a start-offset entry to `music_config.json`.

## Brand voice (Ollie / Knxght Consulting)

Read `/Users/oliverknight/Jarvis/clip-tool/selector/brand_voice.md` for the full reference. Key rules for headlines:

- Lowercase, sans-serif, no emoji, no quotes, no exclamation marks
- **3-7 words hard cap** (above 7 breaks line-wrap)
- Aim for ONE clean line OR balanced TWO lines (≥3 words each line)
- Avoid AI-tells ("the secret to", "the truth about", "what nobody tells you")
- Use verbatim brand phrases when present in source ("same engine different bodywork", "precision over volume", "stop performing", etc.)

## Key files in the project

```
clip-tool/
├── batch_orchestrate.py        # Mode A entry — runs full pipeline from decisions JSON
├── overlay_only.py             # Mode B entry — adds overlay to existing video
├── rerender_all.py             # Re-render all Done clips with updated music/layout (idempotent via state file)
├── drive/
│   ├── auth.py                 # OAuth via jarvis-google credentials
│   ├── download.py             # Drive file download to .cache/videos/
│   ├── upload.py               # Drive upload + find_or_create_folder helpers
│   └── list_folder.py          # Enumerate folder contents
├── transcribe/
│   └── whisper.py              # faster-whisper word-level transcription (cached)
├── selector/
│   ├── brand_voice.md          # Ollie voice + headline rules
│   └── select.py               # Claude API clip selection (skipped when credits out)
├── edit/
│   ├── probe.py                # ffprobe dimensions + rotation-aware orientation
│   └── cut_stitch.py           # FFmpeg multi-segment splice with audio fades
├── render/
│   ├── render_clip.py          # Headless Remotion render driver
│   ├── package.json            # Remotion + react deps
│   └── src/
│       ├── Root.tsx            # Composition registration
│       └── Clip.tsx            # The actual scene — aspect-aware layout, captions, headline, music
├── music/                      # 9 tracks + music_config.json
└── .cache/
    ├── videos/                 # Source downloads (auto-cleaned when disk tight)
    ├── transcripts/            # JSON with word-level timestamps (cached)
    ├── edits/                  # Stitched intermediates (used by rerender_all)
    └── batch_decisions_*.json  # AI/manual decision JSONs (one per wave)
```

## Decision JSON format (Mode A)

```json
{
  "videos": [
    {
      "drive_id": "1abc...",
      "source_name": "IMG_0471.MOV",
      "clips": [
        {
          "headline": "people relate to people not the pitch",
          "topic_slug": "people-relate-to-people-not-pitches",
          "keep_segments": [
            {"start": 276.23, "end": 302.21, "reason": "setup"},
            {"start": 310.63, "end": 349.91, "reason": "landing"}
          ],
          "music_path": "/Users/oliverknight/Jarvis/clip-tool/music/coldplay-sparks-instrumental.mp3",
          "music_volume": 0.07
        }
      ]
    }
  ]
}
```

## Skip-list patterns

These source types yield no clips — skip without transcribing if possible:
- Files under 60s (B-roll, individual takes)
- Files with 0 words after transcription (silent / no speech)
- Internal team strategy calls (multiple voices discussing ops, not viewer-facing teach)
- Vlog logistics (heading to gym, unboxing, day-recap with no teaching content)
- Screen-share troubleshooting (DNS / CRM walkthroughs)

## Defaults baked in
- Canvas: 1080×1920 @ 30fps
- Stitched intermediate: 1080w landscape (-2 height) or 1080×1920 portrait, libx264 superfast CRF20
- Final render: H.264 CRF 18, AAC 192kbps
- Phrase grouping: max 4 words, break on sentence-terminal punctuation
- Headline font: Inter Bold 56px, `text-wrap: balance`
- Caption font: Inter ExtraBold 46px with dark drop-shadow
- Music fade: 0.6s in, 1.5s out

## Where the user reviews clips
Drive output folder ID for "Done" subfolder is `1Ojia_LonfZCxRU8MXv3OgSqqM9CQgMmo` (current default — change per-client).

## Worked example chain (built 2026-05-10/11)
Processed ~87 source videos from a personal Drive folder, produced 36 short-form clips across 12 batch waves. Music re-rendered with new start-offsets after vocals were stripped from copyrighted tracks via demucs. See `.cache/batch_decisions_wave*.json` for the decision lineage and `logs/` for run history.
