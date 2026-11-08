# Chrome Web Store listing: Ainable Setter Helper

Upload: `ainable-setter-helper-<version>-store.zip` in this folder (rebuild with `node web/scripts/pack-helper.mjs`).
Visibility: **Unlisted** (only people with the link can find it).

## Store listing tab
- **Name:** Ainable Setter Helper
- **Summary (132 max):** Connects your own Instagram inbox to Ainable Setter: captures your DM threads, shows suggested replies and labels leads.
- **Category:** Productivity > Workflow and planning
- **Language:** English (UK)
- **Description:**

  The Ainable Setter Helper links your Instagram inbox to your Ainable Setter account, the AI appointment setter for coaches and service businesses.

  What it does:
  - Captures the direct message threads in your own Instagram and Meta Business Suite inbox, so every lead lands in your Ainable Setter pipeline.
  - Shows the reply Ainable Setter suggests, right inside the thread, for you to check and send.
  - Applies your pipeline labels to each conversation.
  - Optional outreach sender, off by default: types and sends the first messages your team has queued, from your own account, in its own tab and at a careful pace.

  You need an Ainable Setter account. After adding the helper, open your Ainable Setter app and it links itself in a few seconds.

- **Icon:** `extension/icons/icon128.png`
- **Screenshots (1280x800):** still to make, from demo leads only. Never use real conversations.
- **Homepage URL:** https://ainable-setter.vercel.app
- **Support URL:** https://ainable-setter.vercel.app/connect

## Privacy tab
- **Single purpose:** Connects the user's own Instagram inbox to their Ainable Setter account, so their DM leads are captured and answered from the app.
- **Permission justifications:**
  - activeTab: Lets the toolbar popup act on the Instagram tab the user is looking at, such as capturing the open thread.
  - alarms: Checks the user's Ainable Setter account once a minute for replies and outreach messages waiting to go.
  - scripting: Adds the suggested reply panel and labels into the user's Instagram inbox page.
  - storage: Remembers which Ainable Setter account the helper is linked to, and its on and off settings.
  - Host permissions (instagram.com, business.facebook.com): Reads the user's own DM threads and shows the suggested reply there.
  - Host permission (ainable-setter.vercel.app): Sends captured threads to the user's own Ainable Setter account and links the helper to it.
  - Optional host permissions (any https site): Asked for only when a business runs Ainable Setter on its own web address, so the helper can link to that copy. Never requested otherwise.
- **Remote code:** No, all code is in the package.
- **Data usage:** tick Personally identifiable information (Instagram names and handles), Personal communications (direct messages), User activity is NOT collected. Certify: not sold, not used for unrelated purposes, not used for creditworthiness.
- **Privacy policy URL:** https://ainable-setter.vercel.app/privacy

## Distribution tab
- Payments: Free. Visibility: Unlisted. Regions: All.

## After it is approved
Copy the item's page address (https://chromewebstore.google.com/detail/...) and set it as `HELPER_STORE_URL` on the Vercel project, then redeploy. The Get connected page then shows one "Add to Chrome" button, with the download steps kept underneath as a fallback.
