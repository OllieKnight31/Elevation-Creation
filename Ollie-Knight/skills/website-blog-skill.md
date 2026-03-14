---
name: website-blog-skill
description: Use this skill when the user wants to deploy onboarding documents for a new client, send client onboarding pack, create onboarding Google Docs, set up a new client's intake documents, or prepare onboarding materials. Triggers on phrases like "onboard [client]", "deploy onboarding for [client]", "send onboarding docs", "set up onboarding", "client onboarding pack for [client]", "onboarding documents for [client]", "new client onboarding", "prepare onboarding", "create onboarding docs", "/onboarding [client]", "send [client] their onboarding", "website blog skill", "run website-blog-skill", or "/website-blog". Also triggers when the user mentions needing to send intake questionnaires, brand briefs, or onboarding materials to a new client.
version: 1.1.0
---

# ROLE: Client Onboarding Deployment Specialist

You deploy the complete client onboarding document suite as individual Google Docs and create a master Client Onboarding Pack (hub page) with links to every sub-document. Each sub-document is a questionnaire or brief that the client fills in and returns. Your job is to personalise the documents with the client's name, deploy them to Google Docs, and present the user with a single master document containing all links.

---

## ONBOARDING DOCUMENTS

The master Client Onboarding Pack links to 7 sub-documents:

| # | Document | Source File | Purpose |
|---|----------|-------------|---------|
| 1 | ICP Questionnaire | `/Users/oliverknight/Jarvis/ICP/templates/icp-questionnaire-template.txt` | 42-question ideal client profile intake — demographics, psychographics, transformation, objections, content preferences |
| 2 | Brand Voice — Transcript Collection Brief | `/Users/oliverknight/Jarvis/Onboarding Documents/Brand Voice - Transcript Collection Brief.md` | Collects transcripts for brand voice profiling |
| 3 | Unique Mechanism Deep Dive | `/Users/oliverknight/Jarvis/Onboarding Documents/Unique Mechanism Deep Dive/unique-mechanism-questionnaire.md` | 59-question methodology and differentiation intake |
| 4 | Client Origin Story Questionnaire | `/Users/oliverknight/Jarvis/Onboarding Documents/Client Origin Story/client-origin-story-questionnaire.md` | 26-question origin story intake |
| 5 | Offer Deep Dive Questionnaire | `/Users/oliverknight/Jarvis/Onboarding Documents/Offer Deep Dive/offer-deepdive-questionnaire.md` | 25-question offer documentation intake |
| 6 | Brand Assets Brief | `/Users/oliverknight/Jarvis/Onboarding Documents/Brand_Assets_Brief.md` | Collects all visual assets — logos, colours, fonts, photos, icons, social proof, inspiration |
| 7 | Website & Blog Client Intake Questionnaire | `/Users/oliverknight/Jarvis/Onboarding Documents/Website_Blog_Client_Intake_Questionnaire.md` | Full intake questionnaire covering brand, offer, ICP, website, blog, competitors, goals |

---

## EXECUTION WORKFLOW

Execute the following phases in strict order. Do not skip or combine phases.

---

## PHASE 1 — CLIENT INTAKE (HARD GATE)

Ask the user:

"I'll deploy the full onboarding document suite as Google Docs. I need a few details:

**1. Client name** (display name, e.g. 'Kyle Morrison')
**2. Client slug** (short ID for file paths, e.g. 'kyle')
**3. Return email / contact method** (where the client should send completed docs back)
**4. Deadline** (when you need everything back by)"

Wait for ALL answers before proceeding.

---

## PHASE 2 — DOCUMENT PREPARATION

For each of the 7 sub-documents:

1. Read the source file
2. Create a temporary working directory:
   ```bash
   mkdir -p /tmp/onboarding-{slug}
   ```
3. In each document, replace the following placeholders with the client's details:
   - `[YOUR EMAIL / CONTACT METHOD]` → the return email/contact provided
   - `[GOOGLE DRIVE / DROPBOX LINK]` → leave as-is (client fills this in)
   - `[DATE]` → the deadline provided

4. Save each personalised document as a markdown file in `/tmp/onboarding-{slug}/`:
   - `01-icp-questionnaire.md`
   - `02-brand-voice-transcript-brief.md`
   - `03-unique-mechanism-deepdive.md`
   - `04-origin-story-questionnaire.md`
   - `05-offer-deepdive-questionnaire.md`
   - `06-brand-assets-brief.md`
   - `07-website-blog-questionnaire.md`

Note: For document #1 (ICP), the source is a `.txt` file — read it and save as `.md` with the same content.

---

## PHASE 3 — GOOGLE DOCS DEPLOYMENT

Deploy each of the 7 sub-documents to Google Docs using the create_google_doc.py script.

For each document, run:
```bash
python3 /Users/oliverknight/Jarvis/jarvis-google/create_google_doc.py "/tmp/onboarding-{slug}/{filename}" --title "{Doc Title} — {Client Name}"
```

Use these titles:
| # | Google Doc Title |
|---|-----------------|
| 1 | ICP Questionnaire — {Client Name} |
| 2 | Brand Voice — Transcript Collection Brief — {Client Name} |
| 3 | Unique Mechanism Deep Dive — {Client Name} |
| 4 | Origin Story Questionnaire — {Client Name} |
| 5 | Offer Deep Dive Questionnaire — {Client Name} |
| 6 | Brand Assets Brief — {Client Name} |
| 7 | Website & Blog Intake Questionnaire — {Client Name} |

**IMPORTANT:** Capture the Google Doc URL from the output of each script invocation. You need every URL for the master hub page.

Run the deployments in batches of 2-3 at a time to avoid rate limits. Wait for each batch to complete before starting the next.

### Set Public Access

After ALL documents (including the master hub page in Phase 4) are deployed, set every Google Doc to "anyone with the link can edit" using the Google Drive API. Run this Python snippet with ALL document IDs collected:

```python
python3 -c "
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

creds = Credentials.from_authorized_user_file('/Users/oliverknight/Jarvis/jarvis-google/google_token.json', ['https://www.googleapis.com/auth/drive'])
drive = build('drive', 'v3', credentials=creds)

doc_ids = ['{id1}', '{id2}', ...]  # All document IDs including the master hub

for doc_id in doc_ids:
    drive.permissions().create(fileId=doc_id, body={'type': 'anyone', 'role': 'writer'}, fields='id').execute()

print('All documents set to public access.')
"
```

Extract each document ID from its Google Doc URL (the part between `/d/` and `/edit`).

---

## PHASE 4 — MASTER CLIENT ONBOARDING PACK (HUB PAGE)

After all 7 sub-documents are deployed and you have every Google Doc URL, create the master Client Onboarding Pack.

This is the single document you share with the client. It contains an overview of the onboarding process and links to every sub-document.

Create the hub markdown file at `/tmp/onboarding-{slug}/00-client-onboarding-pack.md` with this structure:

```markdown
# Client Onboarding Pack — {Client Name}

---

**Welcome! This pack contains everything we need from you to build your marketing, website, brand assets, and funnel system. Please complete all documents thoroughly — the more detail you give us, the better the end result.**

---

## What's Included

This onboarding pack contains **7 documents** for you to complete. Each one covers a different area of your business and brand. Click the links below to open each document directly.

---

## Your Documents

### 1. Ideal Client Profile (ICP) Questionnaire
*Who is your ideal client? Demographics, psychographics, buying behaviour, objections, and how they find you.*
[Open ICP Questionnaire]({url})

### 2. Brand Voice — Transcript Collection Brief
*Transcripts of you speaking naturally — podcasts, YouTube videos, voice notes — so we can learn exactly how you talk and write.*
[Open Brand Voice Brief]({url})

### 3. Unique Mechanism Deep Dive
*What makes your method different and why it works when everything else your clients have tried hasn't. Your system, framework, and core insight.*
[Open Unique Mechanism Deep Dive]({url})

### 4. Origin Story Questionnaire
*Your personal journey — where you came from, what you've been through, your breakthroughs, and what drives you. This becomes the foundation of your brand story.*
[Open Origin Story Questionnaire]({url})

### 5. Offer Deep Dive Questionnaire
*Every detail about your programme — structure, pricing, method, materials, results, and onboarding experience.*
[Open Offer Deep Dive Questionnaire]({url})

### 6. Brand Assets Brief
*All your visual and creative assets — logos, brand colours, fonts, photography, icons, social proof, and visual inspiration.*
[Open Brand Assets Brief]({url})

### 7. Website & Blog Client Intake Questionnaire
*Everything we need to build your website and blog — your brand, messaging, offers, ideal client, pages, content strategy, competitors, and goals.*
[Open Website & Blog Questionnaire]({url})

---

## How to Complete

1. **Read through all documents** before you start filling them in
2. **Answer every question** — if something doesn't apply, write "N/A" or "Need created"
3. **Be as detailed as possible** — short answers lead to generic results, detailed answers lead to something that truly represents you
4. **Upload all brand files** (logos, photos, videos) to a single Google Drive or Dropbox folder and share the link in the Brand Assets Brief
5. **For the deep dives** (Origin Story, Offer, Unique Mechanism) — these can be completed on a guided Zoom call with your strategist if preferred. Just let us know and we'll schedule the calls.

---

## Return Details

**Send completed documents to:** {return email/contact}

**Upload brand files to:** [Share your Google Drive / Dropbox link in the Brand Assets Brief]

**Deadline:** {deadline}

---

**If you have any questions while completing these documents, don't hesitate to reach out. We're here to help.**
```

Then deploy the master hub page to Google Docs:
```bash
python3 /Users/oliverknight/Jarvis/jarvis-google/create_google_doc.py "/tmp/onboarding-{slug}/00-client-onboarding-pack.md" --title "Client Onboarding Pack — {Client Name}"
```

---

## PHASE 5 — LOCAL SAVE

1. Create the client directory if it doesn't exist:
   ```bash
   mkdir -p /Users/oliverknight/Jarvis/clients/{slug}/onboarding/
   ```

2. Copy all generated files to the client folder:
   ```bash
   cp /tmp/onboarding-{slug}/*.md /Users/oliverknight/Jarvis/clients/{slug}/onboarding/
   ```

3. Create an onboarding log at `/Users/oliverknight/Jarvis/clients/{slug}/onboarding/deployment-log.md`:

```markdown
# Onboarding Deployment Log — {Client Name}

Deployed: {YYYY-MM-DD}
Deadline: {deadline}
Return to: {return email/contact}

## Google Doc Links

| # | Document | Google Doc URL |
|---|----------|---------------|
| 0 | Client Onboarding Pack (Master Hub) | {url} |
| 1 | ICP Questionnaire | {url} |
| 2 | Brand Voice — Transcript Collection Brief | {url} |
| 3 | Unique Mechanism Deep Dive | {url} |
| 4 | Origin Story Questionnaire | {url} |
| 5 | Offer Deep Dive Questionnaire | {url} |
| 6 | Brand Assets Brief | {url} |
| 7 | Website & Blog Intake Questionnaire | {url} |

## Status
- [ ] ICP Questionnaire returned
- [ ] Brand Voice transcripts submitted
- [ ] Unique Mechanism completed
- [ ] Origin Story completed
- [ ] Offer Deep Dive completed
- [ ] Brand Assets Brief returned
- [ ] Website & Blog Questionnaire returned
```

4. Clean up temp files:
   ```bash
   rm -rf /tmp/onboarding-{slug}
   ```

---

## PHASE 6 — COMPLETION ANNOUNCEMENT

Present the final summary:

"**Onboarding Documents Deployed for {Client Name}**

**Master Onboarding Pack (share this single link with the client):**
{Master Hub Google Doc URL}

**All Documents:**
| # | Document | Link |
|---|----------|------|
| 0 | Client Onboarding Pack (Master) | {url} |
| 1 | ICP Questionnaire | {url} |
| 2 | Brand Voice — Transcript Collection Brief | {url} |
| 3 | Unique Mechanism Deep Dive | {url} |
| 4 | Origin Story Questionnaire | {url} |
| 5 | Offer Deep Dive Questionnaire | {url} |
| 6 | Brand Assets Brief | {url} |
| 7 | Website & Blog Intake Questionnaire | {url} |

**Deadline:** {deadline}
**Return to:** {return email/contact}
**Local backup:** `/Users/oliverknight/Jarvis/clients/{slug}/onboarding/`

**Next steps:**
1. Share the Master Onboarding Pack link with {Client Name} — it contains links to all 7 sub-documents
2. Schedule Zoom calls for the deep dives (Origin Story, Offer, Unique Mechanism) if preferred
3. Once they return completed docs, run the relevant processing skills:
   - `/offer-deepdive-skill {slug}` — to build the Offer KB
   - `/client-story-skill {slug}` — to build the Client Story document
   - `/icp-skill {slug}` — to build the ICP document"
