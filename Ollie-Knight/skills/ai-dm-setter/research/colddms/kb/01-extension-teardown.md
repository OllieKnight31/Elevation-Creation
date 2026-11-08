# ColdDMs Chrome extension 6.14.8: technical teardown

Source analysed: `research/colddms/source/extension-6.14.8/` (static analysis only, nothing was executed, no network calls made).
Method: every app file was pretty printed and read in full. `background.js` is 7,009 lines when beautified, but only lines 5408 to 7009 are ColdDMs code; the rest is bundled libraries (EventEmitter, CryptoJS, JSZip, ky HTTP client, Quasar BEX bridge).

Evidence convention: each claim cites `file` plus an identifier or short quoted fragment. Anything marked **INFERENCE** was not directly seen in the code.

## 0. Headline findings

1. **The extension is a thin remote controlled puppet.** It holds no campaign logic, no limits, no delay schedule, no spintax. Once a minute it asks `https://api.colddms.com/extension/get-task` for one task and executes it in a pinned background Instagram tab. All pacing, daily caps, working hours, warmup and message variation live on the server.
2. **DMs are sent through Instagram's own web UI code, driven from inside React**, not through private HTTP endpoints. It finds React fibers by component display name and calls their `onClick` / `onPress` / `onChange` props directly, writes text into the Lexical composer through the Lexical API, then dispatches Lexical's `KEY_ENTER_COMMAND`. Instagram's own client then sends the message over its normal transport.
3. **It reads Instagram's in-page databases** (the "ReStore" LightSpeed tables `messages`, `contacts`, `ig_contact_info`, `server_search_results`, `threads`, plus Redux and Relay stores) to resolve users, check reachability, detect replies and confirm delivery.
4. **Only two Instagram HTTP endpoints are called directly**, both read only: `web_profile_info` and `topsearch`. No GraphQL doc ids, no `direct_v2` calls, no csrf handling.
5. **Security: session cookies are not sent to ColdDMs in this version.** The cookie export code exists but has no live caller. However, three things matter: (a) every DM thread loaded in the tab is uploaded to ColdDMs every minute, (b) full MHTML page captures of the Instagram tab can be uploaded on error when a server flag is on, and (c) a server issued `debug` task lets the backend call arbitrary Instagram internal module functions inside the logged in page and get the result back.
6. **API "encryption" is obfuscation only**: AES with a passphrase hardcoded in the bundle.

## 1. Architecture

### 1.1 What runs where

| Layer | File | World | Role |
|---|---|---|---|
| Service worker | `background.js` | Extension | Polls backend, owns the Instagram tab lifecycle, relays tasks to the content script, reports results, logs, snapshots |
| Content script (document_start, all frames) | `assets/InjectVisibility.js` | Isolated, then injects into page | Injects `assets/HackVisibility.js` as a `<script>` tag |
| Content script (document_start, all frames) | `assets/HackReact.js` | Isolated, then injects into page | Injects `assets/ReactDev.js` as a `<script>` tag before React boots |
| Content script (document_end, top frame) | `assets/content.js` | Isolated | Task orchestrator (class `Instagram`): sequences steps, sleeps, verifies, reports. Injects `assets/dom.js` into the page |
| Page script | `assets/dom.js` | Page (main world) | Class `ADBlockDOM`: uses Instagram's module system globals `importNamespace`, `importDefault`, `require`; Lexical typing; profile lookup fetches; console capture |
| Page script | `assets/ReactDev.js` | Page (main world) | Fake React DevTools hook plus a fiber tree walker and all React level actions (click, search, scrape, read stores) |
| Page script | `assets/HackVisibility.js` | Page (main world) | Focus and visibility spoofing |
| Popup | `www/index.html`, `www/assets/*.js` | Extension page (Vue 3 + Quasar + Pinia) | Sign in link, START / STOP button, "Messages today" and "Total messages" counters |
| Not loaded | `dom.js` (root), `assets/injector.js`, `assets/Storage.js` | n/a | Quasar BEX bridge boilerplate and an unbuilt source file (`import { bexContent } from "quasar/wrappers"`). Not referenced by the manifest. Vestigial |

Manifest evidence: `"content_scripts":[{"run_at":"document_start","all_frames":true,"match_origin_as_fallback":true,"js":["assets/InjectVisibility.js","assets/HackReact.js"]},{"run_at":"document_end","js":["assets/content.js"]}]`, `"web_accessible_resources":[{"resources":["*"],"matches":["*://*.instagram.com/*"]}]`.

Side note: every extension resource is web accessible to instagram.com, so Instagram's page could detect the extension by probing `chrome-extension://<id>/assets/dom.js`. The injected script tags are removed after load (`e.onload = function(){ this.remove() }`) but the hooks they leave are detectable (see section 7).

### 1.2 Message buses

Four hops, each a small request/response RPC with the same shape (`{type: "basic" | "with_response" | "response", id, data, result}`).

| Hop | Transport | Channel names (deliberately disguised as an ad blocker) |
|---|---|---|
| background to content | `chrome.tabs.sendMessage` | `type: "adblock:info:to-content"` (`background.js`, `We`) |
| content to background | `chrome.runtime.sendMessage` | `type: "adblock:info:to-background"`; `isEmit: true` means fire and forget (`content.js`, `BackgroundConnector`) |
| content to dom.js | `window.postMessage` | `"adblock:info:to-dom"` out, `"adblock:info:to-content"` back (`content.js` `DOMConnector`, `dom.js` `ADBlockDOMConnector`) |
| dom.js to ReactDev.js | `window.postMessage` | `"adblock:info:to-react"` out, `"adblock:info:to-inner-dom"` back |
| popup to background | `chrome.runtime.connect({name: "app:<tabId>"})` | Quasar BEX bridge; no app specific events use it. The popup really talks through `chrome.storage.local` |

Classes are also named `ADBlockDOM`, `ADBlockDOMConnector`, `ADBlockAsyncEventEmitter`. **INFERENCE:** the "adblock" naming is camouflage in case Instagram inspects `postMessage` traffic or globals.

**Background to content task names** (registered in `content.js` `registerTasks`): `sendMessage`, `sendMessageFromDialog`, `checkResponse`, `sendInboxMessage`, `collectMessages`, `debug`, `parsing`, `ping`.

**Content to background task names** (registered in `background.js` handler `He`): `pong`, `sleep`, `isTabCorrect`, `getTabType`, `successTask`, `errorTask`, `sendMessageAdditionalTab`, `log`, `screenshot` (a no-op: `async ({}) => null`), `getCookiesAndSaveAccount`, `switchAccount`, `registerAccounts`, `saveMessages`.

**Content to dom.js task names** (`dom.js` `registerTasks`): `isLoggedIn`, `getText`, `getUser`, `checkResponse`, `getInfo`, `switchAccount`, `enterSymbol`, `enterMessage`, `sendMessage`, `getMessageInput`, `injectIntoChat`, `getLastMessages`, `getLastMessagesUnsafe`, `preTaskHooks`, `getUserByUsername`, `inputSearch`, `getUserFromContacts`, `checkResponseFromDOM`, `checkOutgoingMessageSentFromDOM`, `collectThreadFromDOM`, `openUser`, `findUserInDialogWithoutClick`, `logSendMessageButtonSeen`, `openDirect`, `importCredentials`, `exportCredentials`, `getReactTree`, `debugRequire`, `debugReact`, `switchAccountFromDirect`, `switchAccountFromIndex`, `getFollowers`, `getFollowing`, `openChatFromProfile`, `getAllMessages`, `getUserThread`, `getDebugMessages`, `getConsoleLogs`, `detectInstagramError`, `navigateToInbox`. Reverse direction (dom to content): `sleep`, `log`.

**dom.js to ReactDev.js task names**: `clickDialogButton`, `findSearchResult`, `clickChat`, `test1`, `getMessages`, `getReactTree`, `getMessagesUnsafe`, `checkNotificationModalAndClick`, `enterUsername`, `inputSearch`, `getUserFromContacts`, `debug`, `clickOnUser`, `switchAccountFromDirect`, `switchAccountFromIndex`, `getFollowers`, `getFollowing`, `openChatFromProfile`, `getUser`, `preTaskHooks`, `getAllMessages`, `checkResponseFromDOM`, `checkOutgoingMessageSentFromDOM`, `collectThreadFromDOM`, `getDebugMessages`, `closeOpenDialogModal`, `getUserThread`, `alternativeSearchResultsMapping`, `detectInstagramError`. Reverse: `sleep`, `log`.

### 1.3 Local state

`chrome.storage.local`, keys prefixed `colddms_storage_` (`background.js` class `be`, same in `assets/Storage.js` and `www/assets/Storage.aece3360.js`):

| Key | Default | Use |
|---|---|---|
| `instanceId` | 50 hex chars from `crypto.getRandomValues` | The identity of this browser install. Sent in every API body |
| `tabId` | null | The pinned main Instagram tab |
| `additionalTabId` | null | The optional second pinned tab |
| `enabled` | false | START / STOP switch written by the popup |
| `accounts` | `"{}"` | Local cookie and storage vault per IG user id (legacy, see 5.3) |
| `ping` | 0 | Timestamp of last `pong` from the content script |
| `attempts` | 0 | Declared, never used |
| `timestamp` | 0 | Dev only "force tick" trigger |
| `reloadCounter` | 0 | Reloads done after an Instagram 500 page |

Plus the bare key `delayed_task` (`content.js` `getDelayedTask`), read on tab load; nothing in this version writes it (`setDelayedTask` has no caller).

### 1.4 Backend authentication

Client class `T` in `background.js` (duplicated as `te` in `www/assets/api.e7df1983.js`):

```
prefixUrl: "https://api.colddms.com",
headers: { client: "4092eff6498563d78beabc088c3690d3", "ex-version": this.version }
this.pass = "38fhg)33ASA--sS__20486ffD"
```

* Every call is `POST` with body `{ data: AES.encrypt(JSON.stringify({...payload, instanceId}), pass) }`; the response's `data` field is decrypted with the same passphrase (`post`, `encrypt`, `decrypt`). This is CryptoJS passphrase mode AES with a key that ships in the bundle, so it only hides payloads from casual inspection. Real confidentiality comes from TLS.
* There is **no bearer token, no license key, no cookie**. The ky client uses `credentials: "same-origin"` by default (`background.js` line 5695) so colddms.com cookies are not attached. The only credential is the random `instanceId` in the body, plus the static `client` header (identical for every user, also used by the web app).
* Linking `instanceId` to a ColdDMs user: `authByCode(code)` posts `extension/auth-by-code`. In `www/assets/AuthPage.ed0724f8.js`, `startAuth()` generates a 128 hex char code, opens `https://app.colddms.com/extension-id/<code>` in a popup window, waits 2 s, then polls `authByCode(code)` up to 10 times at 1 s intervals. The web app route `extension-id/:code` posts the code to `users/set-temp-auth-code` while the user is logged in (seen in the web app bundle copy, `CodeAuthPage`), which lets the backend bind `instanceId` to the user.
* **Caveat:** in 6.14.8 the visible SIGN IN button is wired to `authNew()` which only opens `https://app.colddms.com/sign-in/`; `startAuth()` is only reachable from `login()`, which no template element calls. How the binding happens after a plain sign in could not be determined from the extension (see "Could not determine").
* "Extension id" in ColdDMs language equals this `instanceId`. The web app calls them "instances" or "browsers" and marks one online if its `last_ping` is within 2 minutes (web app bundle, `BrowsersPage`).
* Other calls: `extension/get-data` (returns `{success, response: {user: {email, stats: {messages_sent: {today, all}}, snapshot}}}`), `extension/logout`, `extension/toggle-enable` (defined, never called), `extension/register-accounts`.

### 1.5 What the backend sends: polling, task types, schema

**Pull only. No push, no websocket.**

* `chrome.alarms.create("fetchAlarm", { periodInMinutes: 1 })` on install (`background.js` 6009).
* `chrome.alarms.create("collect_messages_alarm", { periodInMinutes: 1 })` (class `D`, `ALARM_PERIOD = 1`).
* The tick listener has **no alarm name filter**: `chrome.alarms.onAlarm.addListener(async () => { ... await new O(e).tick() ... })`. So both alarms trigger a task poll, giving up to two polls per minute. The content script's `isBusy` flag drops overlapping tasks ("Got send message task but thread is busy").
* `tick()` calls `fetchTask()`: first `extension/get-data`; if `response.user` is missing it stops. Then `extension/get-task` with `{force}`. If `response.type` exists the task is started. One task per poll.
* `force` is true only when `colddms_storage_timestamp` changes, which is a dev only button (`isProd ? hidden`) in `MainLayout`.
* Only runs when `enabled` is true. Turning it on opens the tab, turning it off closes it (`chrome.storage.onChanged` listener).

**Task envelope:** `{ type, data }`; `data` is passed verbatim to the content script with `isTakeSnapshot` (from `user.snapshot`) merged in.

| Task `type` | `data` fields read by the extension | Result posted to `extension/update-task` |
|---|---|---|
| `sendMessage` | `target: {username, fullName}`, `message: {text}`, `taskId`, `userId` (IG account that must be logged in), `targetUserId`, `useProfile` (default false), `isOpenNewTab` (default false), `skipMessageExistsCheck` (default false), `replyCheckSince` | success: `result`, `threadId`, `targetUserId`, optional `response: true` + `text` when a reply was found instead of sending |
| `checkResponse` | `threadId`, `taskId`, `userId`, `username`, `targetUserId`, `replyCheckSince` | `result: boolean`, `text` of the reply |
| `sendInboxMessage` | `thread_id`, `message: {text}`, `taskId`, `target: {username}` | `threadId`, `targetUserId`, `targetUsername`, `text`, `lastMessageTimestamp`, `lastMessageId` |
| `parsing` | `taskId`, `username`, `instagramId`, `type` (`followers` or `following`), `limit`, `userId` | `targets: [{fullName, id, isVerified, username}]`, `isLimited` |
| `debug` | `taskId`, `type` (`require` or `react`), `name`, `chain: [{type, value, args}]`, `method` (`require`, `importDefault`, `importNamespace`) | `debugAnswer` (JSON string) |

Internal only task names (not from backend): `sendMessageFromDialog` (second tab variant), `collectMessages` (minute alarm), `ping`.

`update-task` full field list: `taskId, type ("success" | "error"), result, error {error, stack, type}, taskType, threadId, targetUserId, response, debugAnswer, targets, isLimited, text, switchAccountRequired, unreachableType, consoleOutput, lastMessageTimestamp, lastMessageId`. (The error handler also passes `sendStatusV2` and `reachabilityStatus`, but `updateTask` does not forward them, so they are silently dropped.)

Error `type` vocabulary seen: `tab_open_error`, `additional_tab_error`, `user_is_unreachable`, `check_message_error`, `instagram_reload_error`, `banned_error`, `open_direct_page_error`, `open_search_popup_error`, `user_search_error`, `user_click_error`, `open_search_menu_error`, `search_user_click_error`, `open_followers_popup_error`, `parsing_error`, `thread_not_found`, `user_not_found`, `rate_limited`, `auth_error`.

## 2. Exactly how a DM is sent

**Answer: UI driving at the React and editor API level.** Not DOM typing with real key events, not private endpoints, not a hand built MQTT publish. The extension calls the same handlers a human click would call and lets Instagram's client do the network work.

### 2.1 What ReactDev.js and HackReact.js do

* `HackReact.js` is a 3 line document_start content script that injects `assets/ReactDev.js` into the page before Instagram's bundle runs.
* `ReactDev.js` installs a fake `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` (function `B`, a trimmed copy of the real React DevTools hook with `supportsFiber: true`, `inject`, `onCommitFiberRoot`, `checkDCE` and so on, defined `configurable: false`). React registers with it at startup. If a hook already exists (the user has real React DevTools) it instead wraps the existing `onCommitFiberRoot`.
* On every commit, `z.handleCommitFiberRoot(root)` stores `root.current` as `_root` and indexes fibers in `fiberToIDMap`.
* Class `N` wraps a fiber and offers `findOne(name)` / `findMany(name)`: a depth first walk matching `getDisplayNameForFiber(fiber).indexOf(name) > -1`. So everything is addressed by **Instagram's production component display names**.
* Actions are done by reading `fiber.memoizedProps` and calling the handler functions found there.

### 2.2 The default send path (`useProfile: false`), step by step

Source: `content.js` `tasks.sendMessage`, `_sendMessage`; `dom.js` `_openUser`, `_enterMessage`, `_sendMessage`; `ReactDev.js`.

1. Guard: `isBusy`, scan for ban text (4.6), `preTaskHooks` (close notification modal via `PolarisNotificationsScreenModal.react` `memoizedProps.onClose()`, close any `IGDSDialog.react`, click the search nav item if a `PolarisSearchBoxTextInput.react` is present).
2. Check the logged in account matches `userId` (`isSwitchAccountRequired`: `Number(userId) !== Number(viewer id)`). If not, report `switchAccountRequired: true` and stop. It does not switch.
3. Open the inbox if not already on `/direct/` (`_findDirectButton`): click `[href="/direct/inbox/"]`, else find the nav `svg title` whose text equals the localised string `PolarisNavigationStrings.MESSAGES_TEXT`, else call `PolarisNavigationUtils.openURL("/direct/inbox/")`. Up to 10 tries at 1 s. Then sleep 5 s.
4. Decide whether the thread is already open: `getAllMessages()[username].thread_key` must equal the id in the URL `direct/t/(\d+)`.
5. If not open, `openUser`:
   * Click "New message": tries, in order, `IGDThreadListNewMessageDialogButton.react` > `BaseButton.react` > `return.memoizedProps.onClick()` (10 tries), the same without `.return` (3), `IGDThreadListNewMessageDialogEntrypointProvider` > `CometPressable.react` > `onPress()` (3), `IGDThreadListNewMessageDialogButton` > `IGDSIconButton.react` > `onClick()` (3), and last a DOM fallback on `aria-label` in 7 languages: "New message", "Nuevo mensaje", "Nouvelle conversation", "Neue Nachricht", "Nova mensagem", "Nuovo messaggio", "Nieuw bericht". Sleep 5 s.
   * Enter the username in the picker (`_enterUsername`): find `IGDThreadListNewMessageDialog.react` or `IGDOmniPickerGQLDialog.react`. Variant A: `PolarisDOMListener.react` `.sibling.sibling.memoizedProps.onChange({target: {value: username}})` in one shot. Variant B: `IGDirectSearchUserContainerTokenField` / `IGDirectV3SearchUserContainerTokenField`, calling `onChange` once per character with the growing prefix and a random 50 to 150 ms pause. Variant C: `IGDSTextInput.react` `onChange`. Variant D: native value setter on `input[name="queryBox"]` or `input[placeholder="Search..."]` plus an `input` event. Sleep 5 s.
   * Read results (`_findSearchResult`): `IGDAWContactSearchResultList.react` > `IGDContactSearchResult.react` / `IGDSupershareContactSearchResult.react` / `IGDSListItem.react` `memoizedProps.candidate`, or `IGDOmniPickerSearchResultsList.react` > `IGDRecipientUserListItem` (id parsed from `recipientFragmentRef.__id`). Match `candidate.subtext === username`; fallback maps through ReStore table `server_search_results` (`contextLine === username`). Up to 10 tries at 1 s.
   * Click the result (`_clickOnUser`: `BaseButton.react` `onClick`, `WebPressable.react` `onClick`, `CometPressable.react` `onPress`), sleep 5 s, then press the dialog's confirm "Chat" button (`_clickChat`: last `IGDSBox.react` > `CometPressable.react` `onPress`), sleep 5 s.
   * If the user was not found: type the decoy query `"instagra"`, wait 2 s, type the username again, wait 5 s, retry. Then fail with `user_click_error`.
6. Reachability gate: read `contact_reachability_status_type` for the thread from the ReStore `contacts` table. Only `"0"` (REACHABLE) and `"3"` (REACHABLE_INVITE_BANNER) proceed. Otherwise error `user_is_unreachable` with the mapped name (full enum in 4.7).
7. Reply check (unless `skipMessageExistsCheck`): if any message from the target exists, do not send; report `response: true` with the text and harvest the thread.
8. Personalise: replace `{{username}}`, `{{name}}`, `{{firstName}}` (4.9). Sleep 5 s.
9. Type (`dom.js` `_enterMessage`): get `document.querySelector('div[contenteditable="true"]').__lexicalEditor`, wait until `isEditable()`, `editor.update(() => $getRoot().clear())`, `editor.focus()`, then for each planned chunk call `editor.update(() => $insertNodes([$createTextNode(char)]))` (or `$createLineBreakNode()` for newline) and pause. Lexical is obtained from Instagram's own module registry: `importNamespace("Lexical")`.
10. Verify the composer: read `div[contenteditable].__lexicalTextContent` and compare with the intended text ignoring `* _ ~` markers. Up to 5 attempts with a 50 to 150 ms pause.
11. Send (`dom.js` `_sendMessage`): build a synthetic `KeyboardEvent("keydown")` with `key: "Enter", keyCode: 13` and call `editor.dispatchCommand(Lexical.KEY_ENTER_COMMAND, event)`. Instagram's own Enter handler sends the message. Sleep 5 s.
12. Confirm (`_checkMessageExists`): poll once per second, 20 times for a first message thread, 8 times otherwise, for a rendered outgoing row (`IGDMessageListRowOffMsys` fiber with `outgoing === true`, text present, `timestamp_ms >= dateBeforeSend`). Failure raises `check_message_error` "Message not found".
13. Harvest the visible thread to the backend (5.1) and report `successTask` with `threadId` from the URL.

### 2.3 Variants

* **`useProfile: true`**: `getUserByUsername` (HTTP, 2.4), then `openChatFromProfile`: click `PolarisSearchNavItem.react` > `PolarisFastLink.react` `onClick`, sleep 5 s, `PolarisSearchBoxTextInput.react` `onChange({target: {value}})`, sleep 2 s, find `PolarisSearchResultUserItem.next.react` with `fragmentKey.pk === id`, call `BaseLink.react` `onHoverChange(true)`, wait 100 ms, `WebPressable.react` `onPress(fakePointerEvent)`, wait for `PolarisProfilePageContent.react` `username`, sleep 2 s, then `PolarisProfileDirectMessage.react` > `BaseButton.react` `onClick()` (the profile "Message" button), wait for `PolarisDirectInbox.react`. Errors: "User do not allow to send messages".
* **`isOpenNewTab: true`**: instead of clicking the search result, the main tab resolves the thread id (`findUserInDialogWithoutClick`, then closes the dialog) and asks the background to open a second pinned tab at `https://www.instagram.com/direct/t/<threadId>/`; that tab runs `sendMessageFromDialog` and is closed afterwards.
* **`sendInboxMessage`** (manual replies from the ColdDMs inbox UI, **INFERENCE** on purpose): same open and type flow via `_sendDirectMessage`, no reply check, returns last outgoing message id and timestamp.

### 2.4 Every Instagram endpoint, header and id used

| Item | Where | Notes |
|---|---|---|
| `GET https://www.instagram.com/api/v1/users/web_profile_info/?username=<u>` | `dom.js` `_getUserByUsername` | Called through Instagram's own ajax wrapper `PolarisInstajax.get_UNTYPED`, so Instagram's code adds its usual headers. The extension sets none. Status mapping: 404 `user_not_found`, 429 `rate_limited`, 401/403 `auth_error` |
| `GET https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query=<u>` | `dom.js` `_findUserViaSearch` | Plain `fetch`, `credentials: "include"`, header `"x-ig-app-id": "936619743392459"`. Fallback when the first call fails for any reason except auth. 429 sets a 10 minute backoff |
| Tab URLs opened | `background.js` `openTab`, `startTaskForAdditionalTab` | `https://www.instagram.com/instagram`, `https://instagram.com`, `https://www.instagram.com/direct/inbox/`, `https://www.instagram.com/explore/` (random pick); `https://www.instagram.com/direct/t/<id>/` |
| GraphQL doc ids / friendly names | none | Not present anywhere in the bundle |
| `/api/v1/direct_v2/...`, `/ajax/...` | none | Not present |
| `csrftoken`, `x-csrftoken`, `x-ig-www-claim`, `x-asbd-id` | none | Never read or set by the extension |
| Realtime MQTT | `dom.js` `_injectIntoChat` | Read only: `IGDOverLSMqttChannel.getInstance(LSPlatformDeviceId.getDeviceIdForProviderType("ephemeral")).subscribe("/ls_resp", ...)`, parses `upsertMessage` steps into `this.lastMessages`. Nothing reads `lastMessages`, so this is vestigial. Nothing is published |

### 2.5 Instagram internal modules reached via `importNamespace` / `importDefault` / `require`

Live use: `Lexical` (`$getRoot`, `$createTextNode`, `$createLineBreakNode`, `$insertNodes`, `KEY_ENTER_COMMAND`), `PolarisInstajax` (`get_UNTYPED`), `PolarisConfig` (`getViewerData_DO_NOT_USE`), `bs_caml_int64` (`to_string`, `of_float`), `ReQL` (`toArrayAsync`, `fromTableAscending`), `PolarisNavigationUtils` (`openURL`), `PolarisNavigationStrings` (`MESSAGES_TEXT`), `IGDOverLSMqttChannel`, `LSPlatformDeviceId`.

Present but only in dead or legacy code: `polarisIsUserLoggedIn` (`isUserLoggedIn`), `I64`, `PolarisConsumerReduxStore` (`createConsumerStore`), `PolarisDirectActionLoadThread` (`loadThread`), `PolarisDirectLogger` (`DirectLogger.logDirectClientEvent("direct_inbox_thread_impression")`), `PolarisDirectActionMarkSeen` (`markSeen`), `PolarisDirectActionUpdateMediaSharesInThread`, `polarisUserSelectors` (`getUserById`), `PolarisAuthStrings` (`SWITCH_CTA_TEXT`), `PolarisInstagramProfileActionFalcoEvent` (`log`), `PolarisDirectActionMessageFromProfile` (`messageFromProfile`), `PolarisOneTapLoginStorage` (`getLoginNonces`), `PolarisLoginActionOneTapLogin` (`switchAccountLogin`), `LSVerifyThreadRowExists`, `LSFactory`, `PolarisNotificationsScreenStrings` (`NOTIFICATIONS_MODAL_SECONDARY_ACTION`), `PolarisGenericStrings` (`SEARCH_TEXT`), `PolarisSearchConstants` (`IMPERSONATION_SEARCH_TEXT`).

### 2.6 React components addressed by display name

`IGDThreadListNewMessageDialogButton.react`, `IGDThreadListNewMessageDialogEntrypointProvider`, `IGDThreadListNewMessageDialog.react`, `IGDOmniPickerGQLDialog.react`, `IGDAWContactSearchResultList.react`, `IGDOmniPickerSearchResultsList.react`, `IGDContactSearchResult.react`, `IGDSupershareContactSearchResult.react`, `IGDRecipientUserListItem`, `IGDSListItem.react`, `IGDSBox.react`, `IGDSTextInput.react`, `IGDSIconButton.react`, `IGDSButton.react`, `IGDSDialog.react`, `IGDirectSearchUserContainerTokenField`, `IGDirectV3SearchUserContainerTokenField`, `PolarisDOMListener.react`, `BaseButton.react`, `BaseLink.react`, `WebPressable.react`, `CometPressable.react`, `PressableText.react`, `PolarisAppWrapper.react` (Redux `store.getState()`), `ReStoreProvider.react` (`memoizedProps.db.tables`), `react-relay/relay-hooks/RelayEnvironmentProvider` (`environment.configName === "PolarisRelayEnvironment"`, `getStore().getSource().toJSON()`), `MWPBaseMessage.react`, `MWPBaseThreadList.react`, `IGDOpenThreadContainer.react`, `IGDMessageListTextMessageOffMsys.react` (`slideMessageRef.id`), `IGDMessageListRowOffMsys` (`currentMessageRef`), `MWXMessageBaseMessageListText`, `IGDChatEmoji`, `IGDUserMessageContentMatchContainer`, `LSContactVerificationBadge`, `PolarisNotificationsScreenModal.react`, `PolarisHttp500UnexpectedErrorPage.react`, `PolarisSearchBoxTextInput.react`, `PolarisSearchNavItem.react`, `PolarisFastLink.react`, `PolarisSearchResultUserItem.next.react`, `PolarisProfilePageContent.react`, `PolarisProfileDirectMessage.react`, `PolarisDirectInbox.react`, `PolarisFollowedByStatistic.react`, `PolarisFollowsStatistic.react`, `PolarisUserList.react`, `PolarisInfiniteScroll.react`, `PolarisFollowerListItem.next.react`, `PolarisFeedSidebarWrapper.next.react`, `PolarisSwitchAccountsModalLegacyBody.react`, `IGDThreadListHeaderAccountSwitcher.react`.

DOM level hooks: `div[contenteditable="true"]` with expando props `__lexicalEditor` and `__lexicalTextContent`; `[href="/direct/inbox/"]`; `svg title`; URL pattern `direct/t/(\d+)`.

## 3. Every other Instagram action

| Capability | Present? | Mechanism and evidence |
|---|---|---|
| Profile lookup / user id resolution | Yes | `web_profile_info` then `topsearch` fallback (2.4). Reads `id`, `full_name`, `followed_by_viewer` |
| Own account identity | Yes | `PolarisConfig.getViewerData_DO_NOT_USE()` (`username`, `profile_pic_url`, `id`); fallback Redux `state.users.viewerId` and `state.users.users` via `PolarisAppWrapper.react` |
| Scrape followers / following | Yes | `parsing` task. Opens the profile through site search, presses the follower or following counter (`Polaris{FollowedBy|Follows}Statistic.react` > `PressableText.react`: `onHoverStart()`, 200 ms, `onPress`), then loops `PolarisInfiniteScroll.react` `memoizedProps.handleLoadNext()` up to 1000 times. After each load waits up to 10 x 1 s for growth; on growth waits 500 ms; stops at `limit` (default 100) or after 6 consecutive stalls. Data read from Redux `users.users` (V1, `PolarisUserList.react` `userIds`) or the Relay store records `XDTUserDict:<pk>` (V2). Returns `fullName, id, isVerified, username` and `isLimited` (true when the list had no next page flag) |
| Scrape likers, commenters, hashtags | No | Nothing in the bundle |
| Read inbox and threads | Yes | ReStore tables `messages`, `contacts`, `ig_contact_info`, `server_search_results`, `threads` via `ReQL.toArrayAsync(ReQL.fromTableAscending(table))` (`_getAllMessagesUnsafe`). Also rendered rows of the open thread (`_getAllMessagesFromDOM`) |
| Detect replies | Yes | (a) ReStore: any message in the target's thread whose sender `username === target`. (b) Fallback on rendered rows: newest incoming text after `sinceMs` (`replyCheckSince`), or after the newest outgoing message. `checkResponse` task opens the thread the same way as a send, waits 5 s, checks, harvests |
| Message requests handling | No | No code accepts, opens or lists message requests. Outbound messages to strangers simply land in the recipient's requests. `UNREACHABLE_MR_LIMIT_BLOCK` is recognised as a stop condition |
| Follow | No | `followed_by_viewer` is only read for a legacy analytics log |
| Like, story view, comment | No | Nothing in the bundle |
| Account warmup actions | No | None executed by the extension. Warmup exists as a web app page (`AccountWarmupPage`) so it is server planned; whatever it does must arrive as one of the five task types |
| Account setup (photo, bio) | No | Nothing in the extension. The web app has `AccountSetupPage`; not implemented through this extension build |
| Mark seen | Legacy only | `dom.js` `_checkResponse` calls `PolarisDirectActionMarkSeen.markSeen`; the content script never invokes that task. Note the live path opens threads in the real UI, so Instagram marks them seen naturally |
| Account switching | Detect only | `switchAccountFlow` reports `switchAccountRequired`. UI switchers (`_switchAccountFromIndex`, `_switchAccountFromDirect`, one tap nonce login `_switchAccount`) and the cookie swap method exist but have no live caller |
| Anything else, on demand | Possible | The `debug` task (5.4) can invoke arbitrary internal module functions, so the server could trigger actions not hardcoded here. No evidence of what it is used for |

## 4. Anti-detection and safety design

### 4.1 Where the pacing lives

**Not in the extension.** There are no per hour or per day counters, no ramp schedule, no working hours check, no "pause after N messages", no cooldown timers in any extension file. The only throttle on the client is structural: at most one task per alarm tick, alarms at 1 minute, plus roughly 45 to 70 seconds of fixed waits per send. So the hard ceiling is about one DM per minute per browser, and the server decides when to hand out a task.

Cross reference from the ColdDMs web app bundle (not part of the extension, seen in a local copy; treat as server side configuration, defaults may differ per plan): campaign options `working_hours: {min: 8, max: 22}`, `messages_per_day: {min: 35, max: 45}` on new campaigns (`{min: 50, max: 70}` as the edit page placeholder), slider range 0 to 100, UI copy "within the safe range (≤50)", campaign states `daily_limit_reached`, `outside_working_hours`, a `no_delay` / `disable_messages_limit` testing flag. A min and max pair suggests the server randomises the daily cap per account per day (**INFERENCE**).

### 4.2 Delays inside the extension (all fixed unless stated)

| Step | Delay | Evidence |
|---|---|---|
| Content script start to first action | 7,000 ms | `content.js` `initMain`: `await this.sleep(7e3)` |
| Account registration retries | 5,000 / 10,000 / 20,000 ms | `registerAccounts`: `[5e3, 1e4, 2e4]` |
| After opening inbox | 5,000 ms | `sendMessage`, `checkResponse`, `_sendDirectMessage` |
| After clicking New message | 5,000 ms | `dom.js` `_openUser` |
| Username typing in picker (variant B) | random 50 to 150 ms per character | `ReactDev.js` `o.rand(50, 150)` |
| After entering username | 5,000 ms | `_openUser` |
| Result polling | 10 x 1,000 ms | `_clickOnUserIdDialogButton` |
| After clicking the user | 5,000 ms | same |
| After pressing Chat | 5,000 ms | same |
| Decoy search retry | 2,000 ms then 5,000 ms | `_openUser` (`"instagra"`) |
| Before typing the message | 5,000 ms | `sendMessage` |
| Between typed units | random 50 to 150 ms | `dom.js` `Math.floor(101 * Math.random()) + 50` |
| After typing, before verify | random 50 to 150 ms | `content.js` `Helpers.rand(50, 150)` |
| After Enter | 5,000 ms | `_sendMessage` |
| Delivery confirmation | up to 20 s (first message) or 8 s | `_checkMessageExists` |
| Thread harvest | capped at 15,000 ms | `_harvestThreadToBackend` |
| Background: new tab settle | 10,000 ms | `startTask` |
| Background: after ping | 5,000 ms, then 2,000 ms before dispatch | `startTask` |
| Background: after tab recovery | 15,000 ms | `startTask` |
| Profile path: search open / type / hover / profile | 5,000 / 2,000 / 100 / 2,000 ms | `ReactDev.js` `_openUserFromSearch`, `_searchClickOnUser`, `_openChatFromProfile` |
| Follower scrape: per page | 500 ms after growth, up to 10 s waiting | `_parseUserListV1/V2` |

Only the three 50 to 150 ms items are randomised. Everything else is a constant, so the in-page rhythm of a send is highly regular. The human looking variance between messages comes entirely from server scheduling.

### 4.3 Typing simulation

`dom.js` constants: `TYPING_ONE_CHAR_MAX = 60`, `TYPING_CHUNK_MIN = 3`, `TYPING_CHUNK_MAX = 10`, `TYPING_MAX_PAUSES = 100`.

`planTyping(text)`:
* Up to 60 characters: one character per step.
* Longer: chunks of random size from 3 up to `max(10, ceil(length / 100))` characters, so a message never needs much more than about 100 pauses.
* After each step: 50 to 150 ms pause.

So a 60 character message takes about 6 s to "type"; a 500 character message about 8 s. Text is inserted through Lexical node insertion, not keyboard events. There are no `keydown` / `keyup` / `input` events per character, no typos, no backspaces, no variable speed by character. The only synthetic key event is the final Enter passed to `dispatchCommand`.

A legacy per character key event typer exists (`content.js` `_input` and `_inputToSearchBox`: `keypress`, `keydown`, `input`, `click`, `change`, `blur`, `keyup` per character at `Helpers.rand(20, 70)` ms) but has no live caller.

### 4.4 Mouse and scroll emulation

Essentially none. No mouse movement, no coordinates, no wheel or scroll events. "Clicks" are direct calls of React prop handlers with stub events (`{preventDefault(){}, stopPropagation(){}}`) or a fake synthetic event built from `new PointerEvent("click")` with `_reactName: "onPointerDown"` (`_getInstagramPressEvent`). Two places fake a hover first: `onHoverChange(true)` then 100 ms, and `onHoverStart()` then 200 ms. Follower lists are paged by calling `handleLoadNext()`, not by scrolling. A few fallbacks use `element.click()` (untrusted events, `isTrusted: false`).

### 4.5 Focus and visibility spoofing, and timer throttling

* `HackVisibility.js` (all frames, document_start): `document.visibilityState` and `webkitVisibilityState` always `"visible"`, `document.hidden` / `webkitHidden` always `false`, `document.hasFocus()` always `true`, capture phase listeners that `preventDefault` + `stopImmediatePropagation` on `visibilitychange`, `webkitvisibilitychange`, `pagehide`, and on `focus`, `blur`, `mouseleave` when the target is `document` or `window`. `requestAnimationFrame` becomes `setTimeout(cb, 0)` and `requestIdleCallback` runs the callback synchronously, so Instagram keeps rendering in a hidden tab.
* **Timer throttling bypass:** every sleep under 20 s is executed in the service worker, not the page. `content.js` `sleep(t)`: `t < 2e4 ? this.backgroundConnector.send("sleep", {time: t}) : new Promise(setTimeout)`; `dom.js` and `ReactDev.js` forward their sleeps up the same chain. Chrome throttles timers in background tabs but not in the worker.
* The tab is created `active: false, index: 0, pinned: true` and then `chrome.tabs.update(tabId, {autoDiscardable: false})` (`keepTabAlive`) so memory saver does not discard it.
* Start URL is randomised across four Instagram pages (`this.rand(0, 3)`).
* `dom.js` `trickState()` (dispatches fake `visibilitychange`, `focusin`, `pageshow`) is defined but never called.

### 4.6 Detection of blocks, limits, challenges, logged out state

| Signal | How it is detected | Reaction |
|---|---|---|
| "We suspect automated behavior" interstitial | `content.js` `_checkIfUserReceivedBlockMessage`: scans every `div.innerHTML` for the English substring `"suspect automated behavior"` at the start of each task | Logs `"Ban detected"` to the backend. The thrown `banned_error` is caught by its own `try/catch` and swallowed, so **the task continues**. The backend can act on the log line (**INFERENCE**). English only |
| Instagram 500 page | `PolarisHttp500UnexpectedErrorPage.react` fiber present (`_detectInstagramError`), checked whenever a task errors (`_getRealErrorType`) | Error type becomes `instagram_reload_error`; background reloads the tab with `bypassCache: true`, up to 2 times (`reloadCounter`), then closes the tab |
| Non 2xx on page load (covers 429, 5xx on the document) | `chrome.webRequest.onCompleted` for `main_frame` on instagram.com stores `statusLine`; `openTab` parses `(\d{3})` | Tab closed, `openTab` returns null, task reported as `tab_open_error` "Retry required" |
| 429 on `web_profile_info` | `statusCode === 429` | Error typed `rate_limited`; tries the search fallback first |
| 429 on `topsearch` | `a.status` | `_searchBackoffUntil = Date.now() + 6e5` (10 minutes, in memory, per page load), log "Search fallback throttled" |
| 401 / 403 on profile lookup | `statusCode` | Typed `auth_error`, no fallback |
| Recipient cannot be messaged | ReStore `contactReachabilityStatusType` not `0` or `3` | Error `user_is_unreachable` with the enum name; tab kept open |
| Message not delivered | No outgoing row rendered within 20 s / 8 s | `check_message_error` |
| Logged out / wrong account | No explicit login page detection. `registerAccounts` fails 3 times and posts `accounts: []`; or viewer id differs from the task's `userId` | Backend sees no account or `switchAccountRequired: true` |
| Challenge / checkpoint, `feedback_required`, "Try again later", spam warning dialogs | **Not detected by name anywhere.** These would surface indirectly as a generic step failure or delivery check failure | Generic error path: tab closed, error and optional snapshot uploaded |
| Tab frozen, discarded or content script dead | `ping` / `pong` round trip; `ping` timestamp older than 2,000 ms and no direct reply | `recoverTab`: reload unless still loading, wait up to 25 s for the content script (poll every 400 ms), then 15 s settle; else close tab and report `tab_open_error` |
| Notification permission modal | `PolarisNotificationsScreenModal.react` | Calls `onClose()`, waits 2 s |

**Generic error policy** (`background.js` `errorTask`): for any error other than `user_is_unreachable` and `instagram_reload_error` the main tab is closed, so the next task starts in a fresh tab at a random start URL. There is no client side backoff timer; cooldowns are a server decision.

HTTP client behaviour to the ColdDMs API: ky defaults, `timeout: 1e4`, retry limit 2 but only for GET style methods, so the POST calls are not retried.

### 4.7 Reachability enum (decoded in `content.js`)

`0 REACHABLE`, `1 UNREACHABLE_USER_TYPE`, `2 UNREACHABLE_ADULT_TYPE`, `3 REACHABLE_INVITE_BANNER`, `4 UNREACHABLE_INVITE_BLOCK`, `5 UNREACHABLE_INTEROP_THIRD_PARTY_USER`, `6 UNREACHABLE_INTEROP_USER_OPT_OUT`, `7 UNREACHABLE_INTEROP_THIRD_PARTY_APP_NOT_SUPPORTED`, `8 UNREACHABLE_INTEROP_USER_REMOVED_THIRD_PARTY_APP`, `9 UNREACHABLE_NULL_INTEROP_USER`, `10 UNREACHABLE_MR_LIMIT_BLOCK`, `11 UNREACHABLE_RS_UPSELL_ELIGIBLE`.

Message send status codes used in legacy check V2: `"2"` sent, `"4"` and `"5"` failed.

### 4.8 What each sensitive permission is used for

| Permission | Actual use in code |
|---|---|
| `cookies` | `chrome.cookies.getAll({domain: "instagram.com"})` inside `getCookiesAndSaveAccount`, and `chrome.cookies.set` inside `switchAccount`. Both are background handlers whose only callers (`content.js` `accountInitProcess`, `switchAccount_temp`) are never invoked. Stored locally only. See 5.3 |
| `pageCapture` | `chrome.pageCapture.saveAsMHTML({tabId})` on task error when `isTakeSnapshot` is set by the server; zipped with the React tree and uploaded (5.2) |
| `webRequest` | Read only `onCompleted` listener on `*://*.instagram.com/*` `main_frame` to learn the HTTP status of the tab's page load. No blocking, no header rewriting |
| `system.cpu`, `system.memory` | `Ne()` computes average CPU load, per core loads and memory usage percent, attached as `system_usage` to **every** log line; `memoryInfo()` adds available and total MB to tab failure logs. Diagnostics for dead tabs, not fingerprinting of Instagram |
| `alarms` | The two 1 minute alarms |
| `storage` | State in 1.3 |
| host `*.colddms.com` | API calls from the worker and popup |

### 4.9 Message variation

* Template variables resolved in the content script: `{{username}}`, `{{name}}` (full name or username), `{{firstName}}`.
* `{{firstName}}`: if the full name contains a space, `parseFullName(full_name).first` (a bundled human name parser with title, suffix and prefix lists), else the whole full name, else the username; then `normalizeUnicodeText` (NFKD, strips combining marks so fancy fonts and accents flatten, removes zero width characters, collapses whitespace). If nothing usable, the placeholder and its surrounding spaces collapse cleanly.
* **No spintax and no A/B logic in the extension.** `message.text` arrives final apart from the three variables. Variation, sequences and follow ups are server side (the web app has "sequences").
* Before comparing the composer content, `* _ ~` are stripped (`FORMATTING_MARKERS`) because Instagram renders them as formatting.

### 4.10 Follow or like before messaging; non followers

* No follow, like or story view happens before a message. Nothing in the extension warms a prospect.
* Messages go to anyone the server names, follower or not. The only gate is the reachability status. For strangers the message becomes a message request on their side; the tool does nothing further with it.
* Duplicate protection: by default it will not send if the target has already written anything in the thread, and reports that as a reply instead.

### 4.11 Fingerprint, user agent, proxy, multiple profiles

None in the extension. No `navigator` overrides, no user agent changes, no proxy API, no canvas or WebGL tampering. It relies on being the user's real Chrome with the real session and IP. "Browsers" / "instances" in the product equal separate Chrome profiles (or machines), each with its own `instanceId` and one logged in Instagram account. Multi account inside one profile is effectively unsupported in this build (detect and report only).

### 4.12 Fake analytics (legacy)

`dom.js` `_logOpenDirect` emits Instagram's own Falco event through `PolarisInstagramProfileActionFalcoEvent.log` with `action: "button_impression"` then `"button_click"`, `click_point: "message_button"`, `containermodule: "profile"`, `follow_status`, ids, to make a programmatic `messageFromProfile(userId)` dispatch look like a real button press. Only reachable from `content.js` `openDirect`, which has no caller in this version. It shows the authors previously called Redux actions directly and have since moved to driving real components, presumably because that produces Instagram's telemetry naturally (**INFERENCE**).

## 5. Telemetry: what goes back to ColdDMs

### 5.1 Routine uploads

| Endpoint | When | Content |
|---|---|---|
| `extension/log` | Dozens of times per task, plus tab lifecycle | `{type, data, timestamp, version, system_usage: {cpu_load, memory_usage, cpu_loads_per_core}}`. Notable payloads: `"Received thread info"` with **all messages of the target's thread** from the local DB; `"Prepared message"` with the final text; `"Current input"`; `"No thread info"` with `getDebugMessages()` which is the **entire `contacts` and `ig_contact_info` tables** (everyone in the loaded inbox); `"Checking if user thread is opened"`; harvest statistics; tab state and memory figures |
| `conversations/save` | Every minute (`collect_messages_alarm`, `collectMessages`) and after each send, reply check and inbox send (`_harvestThreadToBackend`) | Minute job: the **whole `getAllMessages()` map**, meaning every thread and message present in Instagram's in-page LightSpeed database for the logged in account, keyed by username, with `thread_key`, `instagram_id`, reachability and per message fields (text, sender, timestamps, ids), plus `instagram_account_id`. This is not limited to campaign prospects; personal conversations loaded in that tab are included. Harvest: each rendered row of the open one to one thread (`messageId`, `text`, `timestampMs`, sender id and username); skipped for group threads |
| `extension/update-task` | Per task | Fields in 1.5, including reply text, scraped follower lists, last 10 console messages per level on error (`consoleOutput`), error stacks |
| `extension/register-accounts` | Each time the main tab loads | `accounts: [{instagram_id, username}]`, `current_id`, `oneTapLogin: false` |
| `extension/get-data`, `extension/get-task` | Every poll | `instanceId` only |

### 5.2 Page captures

On a task error, if the server set `user.snapshot` true: `chrome.pageCapture.saveAsMHTML` of the Instagram tab (full rendered page, so whatever inbox list and conversation is on screen), plus `tree.txt` (JSON of the React fiber tree: component names, prop and state **key names**, CSS classes; not values), zipped with JSZip (`DEFLATE`) and posted as multipart `archive.zip` to `extension/snapshot` with the `taskId`. This upload is not AES wrapped. The `screenshot` message is a stub that returns null; there are no image screenshots.

### 5.3 Cookies, credentials and session tokens: the security answer

* **No code path in 6.14.8 sends Instagram cookies, `sessionid`, `csrftoken`, passwords or storage dumps to api.colddms.com.** None of the API methods carries a cookie field.
* Cookie handling exists as a local "account vault": `getCookiesAndSaveAccount` stores `{cookies: chrome.cookies.getAll({domain: "instagram.com"}), indexedDb, localStorage, sessionStorage}` under `colddms_storage_accounts` in `chrome.storage.local`, and `switchAccount` restores them with `chrome.cookies.set`. `dom.js` `AccountDataKeeper` can export and import all of Instagram's IndexedDB, localStorage and sessionStorage. The triggers (`accountInitProcess`, `switchAccount_temp`) are never called in this build, and `switchAccountOld` is referenced but not even defined. It is dormant multi account code.
* Residual risks to be aware of:
  1. The permission and the code are present, so a future auto update could activate upload without a new permission prompt.
  2. If the vault had been populated by an older version, full session cookies would sit unencrypted in extension storage on disk.
  3. The `debug` task (5.4).
  4. The AES passphrase and `client` header are public constants and the only credential is `instanceId`; anyone who learns an `instanceId` can impersonate that browser to the API (pull its tasks, post results, upload conversations).
  5. `web_accessible_resources: ["*"]` exposes all extension files to instagram.com pages.

### 5.4 The `debug` task: server driven code path inside the logged in page

`dom.js` `_debugRequire({name, chain, method})`:

```
r = require(name) | importDefault(name) | importNamespace(name)
for ({type, value, args = []} of chain) { r = r[value]; if (type === "execute") r = r(...args) }
return r   // JSON.stringify'd and posted back as debugAnswer
```

The backend picks any Instagram internal module by name, walks any property chain, calls any function with any arguments, and receives the return value. That is enough to read in-page state or trigger actions (anything Instagram's own client can do as the user) without an extension update. **INFERENCE:** because a chain can reach a function's `constructor`, arbitrary script evaluation may also be possible, subject to Instagram's CSP. `sessionid` is HttpOnly so page script cannot read it directly. There is no evidence in the bundle of how the vendor uses this; the name suggests remote diagnosis of broken selectors. `_debugReact({chain})` walks from the fiber root wrapper the same way but always returns the string `"No result"` (it stringifies the wrong variable), so it can invoke handlers but not exfiltrate.

### 5.5 Instagram user data collected

Own account: id, username, profile picture URL (read; id and username uploaded). Prospects: username, full name, id, verified flag from follower scrapes; thread ids; reachability. All DM content as described in 5.1.

## 6. Numeric constants and defaults

| Constant | Value | File / identifier |
|---|---|---|
| Task poll alarm | 1 minute (`fetchAlarm`) | `background.js` |
| Message collector alarm | 1 minute (`collect_messages_alarm`, `ALARM_PERIOD = 1`) | `background.js` class `D` |
| Effective poll rate | up to 2 per minute (no alarm name filter) | `background.js` `onAlarm` |
| Tasks per poll | 1 | `fetchTask` |
| API timeout | 10,000 ms | ky default `timeout: 1e4` |
| API retries | 2, GET style methods only (POST not retried) | ky `ze.limit` |
| Retry status codes (ky) | 408, 413, 429, 500, 502, 503, 504 | ky `ze.statusCodes` |
| instanceId length | 50 hex chars | `ve(50)` |
| Temp auth code length | 128 hex chars | `AuthPage` `generateId(128)` |
| Auth code polling | 2 s wait, then 10 tries at 1 s | `AuthPage` `startAuth` |
| Instance "online" window (web app) | last ping within 2 minutes | web app `BrowsersPage` |
| Tab load wait | 25 x 400 ms | `openTab` |
| Content script wait | 25,000 ms, poll 400 ms; min 5,000 ms remaining | `waitForContentScript`, `openTab` |
| Forced reload wait | 15,000 ms | `openTab` recover |
| New tab settle before task | 10,000 ms | `startTask` |
| Ping settle / pre dispatch | 5,000 ms / 2,000 ms | `startTask` |
| Ping staleness threshold | 2,000 ms | `startTask` |
| Post recovery settle | 15,000 ms | `startTask` |
| Reloads on IG 500 page | 2, then close tab | `errorTask`, `reloadCounter` |
| Content init wait | 7,000 ms | `initMain` |
| Register accounts backoff | 5 s, 10 s, 20 s | `registerAccounts` |
| Standard UI step wait | 5,000 ms | throughout |
| Short UI step wait | 2,000 ms | decoy search, modal close, inbox link |
| Element polling | 10 x 1 s (most), 3 x 1 s (fallbacks), 15 x 1 s (module import, message render) | `ReactDev.js`, `dom.js` `_importNamespace` |
| ReStore table wait | 20 x 500 ms | `_findReStoreTable` |
| Sleep offload threshold | under 20,000 ms goes to the service worker | `sleep` in all three layers |
| Typing: single char mode up to | 60 chars | `TYPING_ONE_CHAR_MAX` |
| Typing: chunk size | 3 to max(10, ceil(len/100)) chars | `TYPING_CHUNK_MIN`, `TYPING_CHUNK_MAX`, `TYPING_MAX_PAUSES = 100` |
| Typing: pause per unit | 50 to 150 ms uniform | `dom.js` `_enterMessage` |
| Picker username typing | 50 to 150 ms per char | `ReactDev.js` `_enterUsername` |
| Legacy key event typing | 20 to 70 ms per char, 5 retries per char | `content.js` `_inputToSearchBox` (dead) |
| Composer write retries | 5 | `content.js` `_sendMessage` |
| Lexical / editor stuck timeout | 15,000 ms; editable poll 150 ms | `dom.js` `_enterMessage`, `_waitForEditable` |
| Post send wait | 5,000 ms | `_sendMessage` |
| Delivery check | 20 x 1 s first message, 8 x 1 s otherwise | `_checkMessageExists` |
| Legacy delivery check V2 | 150 or 20 polls at 200 ms | `_checkMessageExistsV2` (dead) |
| Harvest timeout | 15,000 ms | `_harvestThreadToBackend` |
| Timestamp sanity | must be at least 1e12 ms after normalising | `_normalizeInstagramTimestampMs` |
| Search fallback backoff on 429 | 600,000 ms (10 min) | `dom.js` `_searchBackoffUntil` |
| `x-ig-app-id` | 936619743392459 | `dom.js` `_findUserViaSearch` |
| Follower scrape default limit | 100 | `_parseUserList` |
| Follower scrape max iterations | 1000 | `_parseUserListV1/V2` |
| Follower scrape stall limit | 6 consecutive no growth loads (each up to 10 s) | same (`5 < r`) |
| Follower scrape inter page pause | 500 ms | same |
| Hover before press | 100 ms (search result), 200 ms (follower counter) | `ReactDev.js` |
| ReStore iteration cap | 10,000 rows per table | `_getUserThread` |
| Console capture | last 10 entries per level | `dom.js` `addConsoleMessage` |
| Log error truncation | 300 chars message, 1000 chars stack | `saveMessages` error, harvest |
| Settings | `WAIT_FOR_SEND_BUTTON_TIMEOUT: 10`, `WAIT_FOR_REDIRECT_TO_CHAT_TIMEOUT: 10`, `IGNORE_MESSAGE_EXISTS: false` | `content.js` `SETTINGS` |
| BEX bridge max message | 33,554,432 bytes | `_maxMessageSize` |
| Server side (web app, not extension) | working hours 8 to 22; messages per day 35 to 45 default, slider 0 to 100, "safe" at 50 or less | web app bundle copy |

Estimated time for one cold DM, default path, thread not yet open: about 9 s in the worker (ping settle and dispatch) plus roughly 35 to 45 s in page (5 + 5 + 5 + result wait + 5 + 5 + 5 + typing 2 to 9 s + 5 + confirmation 1 to 20 s), then up to 15 s harvest. Roughly 50 to 75 s end to end, matching the one per minute poll.

## 7. Fragility: what breaks when Instagram changes

Highest risk first.

1. **React component display names.** Every action depends on about 55 names such as `IGDThreadListNewMessageDialogButton.react`. If Meta minifies display names, renames a component or swaps a dialog implementation, `findOne` returns nothing. The code already carries 3 to 5 generations of fallbacks per step (for example five ways to click "New message", four ways to enter a username, five ways to read search results), which shows how often this has broken.
2. **Fiber shape assumptions.** Paths like `element.return.memoizedProps.onClick`, `element.sibling.sibling.memoizedProps.onChange`, `element.child.child.child.child.sibling`, `memoizedState.memoizedState[1][0]` break when a wrapper element is added or removed.
3. **The DevTools hook.** Relies on React calling `__REACT_DEVTOOLS_GLOBAL_HOOK__.inject` and `onCommitFiberRoot` in production and on the hook being installed before React loads (document_start injection race). If Instagram strips devtools support or checks for a non native hook, the whole React layer is blind. It is also a clean detection signal: a page script can test for the hook, for the `supportsFiber` object shape, or for the `react-devtools-detector` postMessage the hook emits.
4. **Instagram's module system globals** `require`, `importNamespace`, `importDefault` and module names (`Lexical`, `PolarisInstajax`, `PolarisConfig`, `ReQL`, `bs_caml_int64`, string modules). A bundler change or rename breaks typing, profile lookup and DB reads. `getViewerData_DO_NOT_USE` is explicitly a deprecated API.
5. **Lexical composer internals.** Depends on the composer being Lexical, on the expando props `__lexicalEditor` and `__lexicalTextContent`, and on Enter being handled through `KEY_ENTER_COMMAND`. The selector `div[contenteditable="true"]` assumes exactly one editor on the page.
6. **LightSpeed / ReStore schema.** Table names (`messages`, `contacts`, `ig_contact_info`, `server_search_results`, `threads`) and columns (`secondaryName`, `contactReachabilityStatusType`, `threadKey`, `senderId`, `timestampMs`, `sendStatusV2`, `igId`, `resultIgid`, `contextLine`), int64 boxing via `_tag: "i64"`. The code already has "ReStore unavailable, returning empty" fallbacks and a second DOM based reader (`IGDMessageListRowOffMsys` with Relay refs `SlideMessage:<id>`, `__fragmentOwner.identifier`), which suggests Instagram is mid migration from the LS database to Relay ("OffMsys") and both readers are needed today.
7. **Redux and Relay stores.** `PolarisAppWrapper.react` `store.getState().users`, Relay records `XDTUserDict:<pk>`, environment `configName === "PolarisRelayEnvironment"`.
8. **Web endpoints.** `web_profile_info` and `topsearch` are frequently rate limited or changed; the app id is hardcoded.
9. **English only ban detection** (`"suspect automated behavior"`) and no recognition of challenge, checkpoint or "Try again later" screens. A flagged account in a non English locale looks like random step failures.
10. **Reply detection edge cases.** The ReStore check ignores `replyCheckSince` and treats any message ever sent by the target as a reply; reactions, media only messages and unsent messages may be missed or misread; it only sees what Instagram has loaded locally.
11. **Delivery confirmation is render based.** A slow network over 8 s on an existing thread gives a false `check_message_error`; if the server retries, a duplicate DM is possible. Also a bug: `sendMessageFromDialog` references an undefined `targetUserId` in its success path, which throws after the message was already sent whenever the thread record lacks `instagram_id`.
12. **Visibility spoof.** Overrides on `document` are detectable (property descriptors on the instance rather than the prototype; `hasFocus` replaced by a getter). `requestIdleCallback` is called with no deadline argument, which can throw inside Instagram code that reads `deadline.timeRemaining()`.
13. **Untrusted and handler level input.** No pointer movement, `isTrusted: false` on DOM clicks, handlers invoked without preceding pointer events, fixed 5 s cadences. Cheap for Instagram to fingerprint if it chooses to.
14. **Chrome platform.** MV3 worker suspension (mitigated by alarms and by the content script holding the worker open with sleep RPCs), tab discarding (mitigated by `autoDiscardable: false`), `fetchAlarm` only created in `onInstalled` (if alarms are cleared it relies on the collector alarm, which coincidentally also ticks). `fiberToIDMap` holds strong references to every fiber ever seen and is never pruned, a likely source of the memory pressure their own logs monitor (**INFERENCE**).

## 8. What is worth learning for our product

* Drive the real client (React handlers plus the editor API) and let the app do its own network calls: no endpoint signing, no doc ids to maintain, natural telemetry.
* Keep the client dumb and the policy on the server: caps, working hours, warmup and copy can change without shipping an extension.
* Offload sleeps to the service worker and spoof visibility so a pinned background tab runs at full speed.
* Use Instagram's own localised string modules to stay language independent.
* Check reachability status before typing, and check for an existing reply before every send.
* Weaknesses to avoid: fixed step timings, no real input events, English only block detection, no challenge handling, whole inbox upload, a static shared "encryption" key and an identity that is just a random id, a remote `debug` invoke channel.

## 9. Could not determine from the extension

1. Server side scheduling: actual per hour and per day caps, randomised gaps between tasks, ramp up and warmup curves, pause after N messages, cooldown length after errors or after a "Ban detected" log. None of it is in the client.
2. How `instanceId` gets bound to a ColdDMs user after the plain "SIGN IN" button (the code based flow exists but is not wired to the button in this build).
3. Whether and how the vendor uses the `debug` task in production, and what warmup or account setup tasks look like (no such task types exist in this build).
4. Server reaction to `switchAccountRequired`, `user_is_unreachable`, `rate_limited`, `check_message_error` (retry policy, blacklisting).
5. Spintax, A/B variants and follow up sequence logic (server side; only three template variables are resolved client side).
6. What headers `PolarisInstajax.get_UNTYPED` adds (Instagram's code, not in the extension).
7. Retention and access controls for uploaded conversations and MHTML snapshots.
8. Whether Instagram's CSP would allow script evaluation through the `debug` chain.
