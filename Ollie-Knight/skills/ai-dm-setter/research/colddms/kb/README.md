# ColdDMs knowledge base

Built 2026-10-11 from static analysis of the public Chrome extension (v6.14.8), the public web app bundle (app.colddms.com) and public web research. Nothing was run, no account was signed in to, and no ColdDMs or Instagram endpoint was called.

| File | What it covers |
| --- | --- |
| 01-extension-teardown.md | How the extension sends DMs, every Instagram touch point, anti-detection design, telemetry, constants, fragility |
| 02-platform-features.md | Site map, onboarding, campaigns, sequences, warmup and account setup, lead sourcing, inbox, CRM, plans |
| 03-safety-and-limits-guidance.md | Every piece of in-app safety advice, verbatim, plus one table of all limits and defaults |
| 04-api-surface.md | 127 backend endpoints with inferred request fields and enums |
| 05-public-research.md | Reviews, Instagram limits, Meta app risk, UK, EU and US law, compliant alternatives, competitors |

Last updated 2026-10-19 (weekly scan: Meta Business AI conversation ownership and its Send API error added to 05; extension still v6.14.8, nothing in 01 to 04 changed).

Source snapshots are in ../source (extension-6.14.8 and webapp).

Not yet known (needs a signed-in session): the warmup ramp numbers, the gap between individual sends, auto-pause thresholds, variant rotation, guided tour text.

Not yet known (Meta): the exact date of the Business AI Conversation Routing entry, and whether tagged sends such as HUMAN_AGENT pass while Business AI owns a thread.
