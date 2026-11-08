/*
 * selectors.js
 *
 * EVERY DOM selector and text marker the extension uses lives in this file.
 *
 * STATUS: the instagram and instagramOutreach entries marked "Checked live"
 * were confirmed against a signed in instagram.com session on 2026-10-13
 * (thread list, message list, rows, text, sender, date separators, header,
 * composer, send control, profile Message button, own profile link).
 * Entries still marked UNVERIFIED, and all of businessSuite, are best-effort
 * guesses. Meta changes its pages often: rerun "Selector health check" in the
 * popup when something stops being found.
 *
 * How to fix a miss:
 *   1. Open the inbox page, click the extension icon, press "Selector health check".
 *   2. For each target reported "not found", inspect the element in DevTools.
 *   3. Add a working selector at the TOP of that target's `css` list.
 *      Prefer role and aria attributes. Meta class names are obfuscated and rotate.
 *
 * Target shape:
 *   desc         what the target is, in plain words
 *   css          fallbacks, tried in order, first one with a visible match wins
 *   text         optional text fallback: { candidates, values, mode, ascend }
 *                candidates = css of elements whose visible text is compared
 *                mode       = "exact" | "startsWith" | "contains" (case-insensitive)
 *                ascend     = number of parents to climb from the matched element
 *   scope        name of another target to search inside (omitted = whole document)
 *   optional     true when the feature degrades gracefully without it
 *   expectAbsent true when FINDING it is the bad outcome (for example a login form)
 *   blocklist    true when the target is never clicked and only used to refuse clicks
 *   transient    true when the target only exists while a picker or dialog is open,
 *                so the health check will not find it on an idle page
 *   where        outreach targets only: "profile" or "thread", the page the
 *                target lives on. The health check only reports the targets
 *                of the page it runs on.
 */
(function (root) {
  'use strict';

  var SELECTORS = {
    /* ------------------------------------------------------------------ */
    /* Shared by both sites                                                */
    /* ------------------------------------------------------------------ */
    common: {
      markers: {
        // UNVERIFIED. Visible page text (outside the message list and the thread
        // list) that means Meta is throttling, challenging or logging out the
        // account. Any hit halts a running capture or label sync immediately.
        haltTexts: [
          'try again later',
          'please wait a few minutes',
          'wait a few minutes before you try again',
          'we restrict certain activity',
          'we limit how often',
          'action blocked',
          'temporarily blocked',
          'temporarily locked',
          'temporarily restricted',
          'too many requests',
          'rate limit',
          'suspicious activity',
          'unusual activity',
          'suspicious login attempt',
          "confirm it's you",
          'confirm your identity',
          'help us confirm',
          'security check',
          'checkpoint',
          'enter the code we sent',
          'your session has expired',
          'session expired',
          "you've been logged out",
          'you have been logged out',
          'log in to continue',
          'log in to instagram',
          'log into facebook'
        ],
        // UNVERIFIED. URL fragments that mean we were redirected to a login,
        // challenge or checkpoint screen. Any hit halts a run.
        haltUrlParts: [
          '/accounts/login',
          '/challenge/',
          '/checkpoint/',
          '/accounts/suspended',
          '/login/',
          '/login.php',
          '/two_factor'
        ],
        // Accessible names and button texts that identify a SEND control.
        // The click helper refuses to click anything matching these.
        sendTexts: ['send', 'send message', 'send now', 'send reply', 'press enter to send']
      }
    },

    /* ------------------------------------------------------------------ */
    /* instagram.com/direct/*                                              */
    /* ------------------------------------------------------------------ */
    instagram: {
      targets: {
        // UNVERIFIED. The left column that lists conversations.
        threadList: {
          desc: 'Left column listing the conversations',
          css: [
            '[aria-label="Thread list"]',
            '[aria-label="Chats"][role="list"]',
            'div[role="navigation"] [role="list"]',
            '[aria-label="Chats"]',
            'div[role="list"]'
          ]
        },
        // UNVERIFIED. One conversation entry inside the thread list.
        threadRow: {
          desc: 'One conversation entry in the thread list',
          scope: 'threadList',
          css: [
            // Checked live 2026-10-13. Notes and the account switcher share the
            // role but carry no titled name, so they are left out.
            '[role="button"][tabindex="0"]:has(span[title])',
            '[role="listitem"]',
            'a[href^="/direct/t/"]',
            '[role="row"]',
            '[role="button"][tabindex="0"]'
          ]
        },
        // UNVERIFIED. The contact name shown inside a thread list entry.
        threadRowTitle: {
          desc: 'Contact name inside a thread list entry',
          scope: 'threadRow',
          css: ['span[title]', 'span[dir="auto"]', '[role="heading"]', 'span']
        },
        // UNVERIFIED. The element to click to open a thread list entry.
        // Falls back to the entry itself when none match.
        threadRowClickTarget: {
          desc: 'Clickable element inside a thread list entry',
          scope: 'threadRow',
          optional: true,
          css: ['a[href^="/direct/t/"]', '[role="button"]', '[role="link"]']
        },
        // UNVERIFIED. The contact's profile picture in a thread list entry.
        // Live sync passes it on, so every chat in the app has its picture.
        threadRowAvatar: {
          desc: 'Profile picture inside a thread list entry',
          scope: 'threadRow',
          optional: true,
          css: ['img[alt*="profile picture" i]', 'img[src*="cdninstagram"]', 'img[src*="fbcdn"]', 'img']
        },
        // UNVERIFIED. Text pieces inside a thread list entry: the name, the
        // latest message preview and how long ago it was. Live sync reads the
        // preview from these to copy each latest message in without opening the chat.
        threadRowText: {
          desc: 'Text pieces inside a thread list entry (name, preview, time)',
          scope: 'threadRow',
          optional: true,
          css: ['span[dir="auto"]', 'span', 'div']
        },
        // UNVERIFIED. Unread indicator inside a thread list entry. Used to SKIP
        // unread threads in bulk capture so opening them does not mark them seen.
        threadRowUnread: {
          desc: 'Unread indicator inside a thread list entry',
          scope: 'threadRow',
          optional: true,
          css: [
            '[aria-label*="Unread" i]',
            '[data-visualcompletion="ignore"][aria-label*="unread" i]',
            'span[data-unread="true"]'
          ],
          text: { candidates: 'span, div', values: ['Unread'], mode: 'exact' }
        },
        // UNVERIFIED. The container holding the messages of the open thread.
        messageList: {
          desc: 'Message list of the open conversation',
          css: [
            // Checked live 2026-10-13.
            '[data-pagelet="IGDMessagesList"]',
            '[aria-label^="Messages in conversation with"]',
            '[role="grid"][aria-label*="conversation" i]',
            '[data-pagelet="IGDOpenMessageList"]',
            'div[role="main"] [role="grid"]',
            '[role="grid"]'
          ]
        },
        // UNVERIFIED. Optional explicit scroll container. When none of these is a
        // real scroller the code walks up from messageList and picks the nearest
        // ancestor whose computed overflow-y is auto or scroll.
        messageScroller: {
          desc: 'Scrollable ancestor of the message list (auto-detected when missing)',
          optional: true,
          css: [
            '[data-pagelet="IGDMessagesList"] [data-scroller="true"]',
            '[data-pagelet="IGDOpenMessageList"] [data-scroller="true"]',
            '[aria-label^="Messages in conversation with"] [data-scroller="true"]',
            '[data-aidm-scroller]'
          ]
        },
        // UNVERIFIED. One row of the message list (a message or a date separator).
        messageRow: {
          desc: 'One row in the message list',
          scope: 'messageList',
          // Checked live 2026-10-13: the wrapper holds the bubble and its action buttons.
          css: ['div:has(> [aria-roledescription="message"])', '[role="row"]', '[role="gridcell"]', '[data-release-focus-from]']
        },
        // Checked live 2026-10-13. The text of a message bubble inside a row.
        messageText: {
          desc: 'Text of a message bubble',
          scope: 'messageRow',
          css: [
            '[aria-roledescription="message"] span[dir="auto"]',
            '[aria-roledescription="message"] div[dir="auto"]',
            'div[dir="auto"]',
            'span[dir="auto"]',
            '[data-testid="message-text"]'
          ]
        },
        // UNVERIFIED. A timestamp or date separator inside a row.
        timestamp: {
          desc: 'Timestamp or date separator in the message list',
          scope: 'messageRow',
          optional: true,
          css: ['time[datetime]', 'time', '[data-scope="date_break"]']
        },
        // Checked live 2026-10-13. Instagram draws date separators BETWEEN the
        // rows, as plain text. Every match outside a row whose text parses as
        // a date or time is treated as a separator.
        dateBreak: {
          desc: 'Date separator drawn between message rows',
          scope: 'messageList',
          optional: true,
          css: ['span[dir="auto"]', 'time', '[data-scope="date_break"]']
        },
        // Checked live 2026-10-13. The action buttons of a row. Their label names
        // the sender, see markers.senderLabelParts. They can be hidden until hover.
        senderLabel: {
          desc: 'Action button of a message row whose label names the sender',
          scope: 'messageRow',
          optional: true,
          css: ['[role="button"][aria-label*="message from " i]', '[aria-label*="message from " i]', '[aria-label*=" from " i]']
        },
        // UNVERIFIED. The contact name in the header above the open thread.
        // When missing, the name is parsed from the messageList aria-label.
        threadHeaderName: {
          desc: 'Contact name in the open conversation header',
          css: [
            // Checked live 2026-10-13.
            '[data-pagelet^="IGDInboxHeader"] h2',
            'div[role="main"] header h2',
            'div[role="main"] h2',
            'div[role="main"] header [role="heading"]',
            'div[role="main"] a[role="link"][href^="/"] span[dir="auto"]'
          ]
        },
        // UNVERIFIED. Profile link in the conversation header. The handle is read
        // from its href (/handle/).
        threadHeaderProfileLink: {
          desc: 'Profile link in the open conversation header (source of the handle)',
          optional: true,
          css: [
            // Checked live 2026-10-13.
            'a[aria-label^="Open the profile page" i]',
            'div[role="main"] header a[href^="/"]:not([href^="/direct"])',
            'div[role="main"] a[role="link"][href^="/"]:not([href^="/direct"])'
          ]
        },
        // UNVERIFIED. The contact's profile picture in the conversation header,
        // shown as their picture in the app's inbox.
        threadHeaderAvatar: {
          desc: 'Profile picture in the open conversation header',
          optional: true,
          css: [
            'a[aria-label^="Open the profile page" i] img',
            '[data-pagelet^="IGDInboxHeader"] img',
            'div[role="main"] header img',
            'div[role="main"] a[role="link"][href^="/"]:not([href^="/direct"]) img'
          ]
        },
        // UNVERIFIED. The message composer. "Insert" writes here and stops.
        composer: {
          desc: 'Message composer text box',
          css: [
            'div[role="textbox"][contenteditable="true"][aria-label*="Message" i]',
            'div[contenteditable="true"][role="textbox"]',
            'textarea[placeholder*="Message" i]',
            '[contenteditable="true"][aria-describedby]'
          ]
        },
        // UNVERIFIED. The send control. NEVER clicked. Used only so the click
        // helper can refuse to click it or anything inside it.
        sendButton: {
          desc: 'Send control (never clicked, used as a click blocklist)',
          optional: true,
          blocklist: true,
          css: [
            '[aria-label="Send"]',
            '[role="button"][aria-label*="Send" i]',
            'button[type="submit"]'
          ],
          text: { candidates: '[role="button"], button', values: ['Send'], mode: 'exact' }
        },
        // UNVERIFIED. Spinner shown while older messages load.
        loadingIndicator: {
          desc: 'Spinner shown while older messages load',
          scope: 'messageList',
          optional: true,
          css: [
            '[role="progressbar"]',
            'svg[aria-label*="Loading" i]',
            '[data-visualcompletion="loading-state"]'
          ]
        },
        // UNVERIFIED. A login form. Finding it means the session ended, so any
        // run halts.
        loginForm: {
          desc: 'Login form (finding it halts any run)',
          optional: true,
          expectAbsent: true,
          css: ['form#loginForm', 'input[name="username"]', 'input[name="password"]', 'input[type="password"]']
        }
      },
      markers: {
        // UNVERIFIED. Screen-reader text inside a row that marks a message as
        // sent by the account owner. When absent, direction falls back to which
        // side of the list the bubble is drawn on.
        outgoingMarkers: ['You sent', 'You replied'],
        // Checked live 2026-10-13. Each row's action buttons are labelled
        // "React to message from <handle>". A row whose handle is the contact's
        // is incoming, any other handle is the account owner.
        senderLabelParts: ['message from '],
        // UNVERIFIED. Helper texts that match messageText but are not messages.
        ignoreTexts: ['You sent', 'Enter'],
        // UNVERIFIED. Prefixes of the messageList aria-label. The contact name is
        // whatever comes after the prefix.
        messageListLabelPrefixes: ['Messages in conversation with '],
        // UNVERIFIED. How the chat list marks a preview of the owner's own message.
        previewOutgoingPrefixes: ['You: '],
        // UNVERIFIED. Chat list previews that describe something other than a
        // text message. Live sync copies none of these in. Matched at the start.
        previewSkip: [
          'You sent', 'Sent ', 'You shared', 'Shared ', 'You reacted', 'Reacted ', 'Liked a message', 'You liked',
          'You replied', 'Replied to', 'You unsent', 'Unsent', 'Mentioned you', 'You mentioned', 'Missed ', 'You missed',
          'Started a', 'You started', 'You changed', 'Changed ', 'You named', 'Named ', 'You added', 'Added ', 'Left the',
          'Seen', 'Typing', 'Active ', 'Message request', 'Sent an attachment', 'Sent a ', 'Sent an '
        ]
      }
    },

    /* ------------------------------------------------------------------ */
    /* business.facebook.com inbox                                         */
    /* ------------------------------------------------------------------ */
    businessSuite: {
      targets: {
        // UNVERIFIED. The column listing conversations in the Business Suite inbox.
        threadList: {
          desc: 'Column listing the conversations',
          css: [
            '[aria-label*="Conversation list" i]',
            '[aria-label*="Conversations" i][role="list"]',
            '[data-pagelet*="ThreadList"]',
            '[role="navigation"] [role="list"]',
            'div[role="list"]'
          ]
        },
        // UNVERIFIED. One conversation entry in that column.
        threadRow: {
          desc: 'One conversation entry in the conversation column',
          scope: 'threadList',
          css: [
            '[role="listitem"]',
            '[role="row"]',
            'a[href*="selected_item_id"]',
            '[role="button"][tabindex="0"]'
          ]
        },
        // UNVERIFIED. The contact name shown inside a conversation entry.
        threadRowTitle: {
          desc: 'Contact name inside a conversation entry',
          scope: 'threadRow',
          css: ['span[title]', '[role="heading"]', 'span[dir="auto"]', 'span']
        },
        // UNVERIFIED. The element to click to open a conversation entry.
        // Falls back to the entry itself when none match.
        threadRowClickTarget: {
          desc: 'Clickable element inside a conversation entry',
          scope: 'threadRow',
          optional: true,
          css: ['a[href*="selected_item_id"]', '[role="button"]', '[role="link"]']
        },
        // UNVERIFIED. Unread indicator inside a conversation entry.
        threadRowUnread: {
          desc: 'Unread indicator inside a conversation entry',
          scope: 'threadRow',
          optional: true,
          css: ['[aria-label*="Unread" i]', '[data-unread="true"]', '[aria-label*="Mark as read" i]'],
          text: { candidates: 'span, div', values: ['Unread'], mode: 'exact' }
        },
        // UNVERIFIED. The inbox search box, used when a queued conversation is
        // not among the loaded entries.
        threadSearchInput: {
          desc: 'Inbox search box',
          optional: true,
          css: [
            'input[placeholder*="Search" i]',
            'input[aria-label*="Search" i]',
            'input[type="search"]'
          ]
        },
        // UNVERIFIED. The container holding the messages of the open conversation.
        messageList: {
          desc: 'Message list of the open conversation',
          css: [
            '[aria-label^="Messages in conversation with"]',
            '[role="grid"][aria-label*="conversation" i]',
            '[aria-label*="Message list" i]',
            '[role="main"] [role="grid"]',
            '[role="log"]'
          ]
        },
        // UNVERIFIED. Optional explicit scroll container (auto-detected when missing).
        messageScroller: {
          desc: 'Scrollable ancestor of the message list (auto-detected when missing)',
          optional: true,
          css: [
            '[aria-label*="Message list" i] [data-scroller="true"]',
            '[role="log"][data-scroller="true"]',
            '[data-aidm-scroller]'
          ]
        },
        // UNVERIFIED. One row of the message list.
        messageRow: {
          desc: 'One row in the message list',
          scope: 'messageList',
          css: ['[role="row"]', '[role="gridcell"]', '[role="listitem"]']
        },
        // UNVERIFIED. The text of a message bubble inside a row.
        messageText: {
          desc: 'Text of a message bubble',
          scope: 'messageRow',
          css: ['div[dir="auto"]', 'span[dir="auto"]', '[data-testid="message-text"]']
        },
        // UNVERIFIED. A timestamp or date separator inside a row.
        timestamp: {
          desc: 'Timestamp or date separator in the message list',
          scope: 'messageRow',
          optional: true,
          css: ['time[datetime]', 'time', '[data-scope="date_break"]']
        },
        // UNVERIFIED. The contact name in the header of the open conversation.
        threadHeaderName: {
          desc: 'Contact name in the open conversation header',
          css: [
            '[role="main"] [role="heading"][aria-level="2"]',
            '[role="main"] h2',
            '[role="main"] [role="heading"]',
            '[role="main"] a[role="link"] span[dir="auto"]'
          ]
        },
        // UNVERIFIED. Link to the contact's Instagram profile. The handle is read
        // from its href.
        threadHeaderProfileLink: {
          desc: 'Link to the contact profile (source of the handle)',
          optional: true,
          css: [
            '[role="main"] a[href*="instagram.com/"]',
            '[role="complementary"] a[href*="instagram.com/"]',
            'a[aria-label*="View profile" i][href*="instagram.com/"]'
          ]
        },
        // UNVERIFIED. Badge or icon showing the open conversation is an Instagram one.
        platformBadgeInstagram: {
          desc: 'Badge marking the open conversation as Instagram',
          optional: true,
          css: [
            '[role="main"] [aria-label*="Instagram" i]',
            '[role="main"] img[alt*="Instagram" i]',
            '[role="complementary"] [aria-label*="Instagram" i]'
          ]
        },
        // UNVERIFIED. Badge or icon showing the open conversation is a Messenger one.
        platformBadgeMessenger: {
          desc: 'Badge marking the open conversation as Messenger',
          optional: true,
          css: [
            '[role="main"] [aria-label*="Messenger" i]',
            '[role="main"] img[alt*="Messenger" i]',
            '[role="complementary"] [aria-label*="Messenger" i]'
          ]
        },
        // UNVERIFIED. The reply composer. "Insert" writes here and stops.
        composer: {
          desc: 'Reply composer text box',
          css: [
            '[role="main"] div[role="textbox"][contenteditable="true"]',
            'div[contenteditable="true"][aria-label*="Reply" i]',
            'textarea[placeholder*="Reply" i]',
            'textarea[aria-label*="message" i]',
            'div[contenteditable="true"][role="textbox"]'
          ]
        },
        // UNVERIFIED. The send control. NEVER clicked. Click blocklist only.
        sendButton: {
          desc: 'Send control (never clicked, used as a click blocklist)',
          optional: true,
          blocklist: true,
          css: [
            '[aria-label="Send"]',
            '[role="button"][aria-label*="Send" i]',
            'button[type="submit"]'
          ],
          text: { candidates: '[role="button"], button', values: ['Send'], mode: 'exact' }
        },
        // UNVERIFIED. Spinner shown while older messages load.
        loadingIndicator: {
          desc: 'Spinner shown while older messages load',
          scope: 'messageList',
          optional: true,
          css: ['[role="progressbar"]', 'svg[aria-label*="Loading" i]', '[data-visualcompletion="loading-state"]']
        },
        // UNVERIFIED. A login form. Finding it halts any run.
        loginForm: {
          desc: 'Login form (finding it halts any run)',
          optional: true,
          expectAbsent: true,
          css: ['form#login_form', 'input[name="email"][type="text"]', 'input[name="pass"]', 'input[type="password"]']
        },
        // UNVERIFIED. The "Labels" block in the contact details side of the open
        // conversation. The text fallback finds the "Labels" heading and climbs
        // two parents to reach the block.
        labelSection: {
          desc: 'Labels block for the open conversation',
          css: [
            '[aria-label="Labels"]',
            '[role="region"][aria-label*="Labels" i]',
            '[data-testid*="label-section" i]'
          ],
          text: {
            candidates: '[role="heading"], h2, h3, h4',
            values: ['Labels', 'Label'],
            mode: 'exact',
            ascend: 2
          }
        },
        // UNVERIFIED. A label already applied to the open conversation. Read to
        // work out which labels are missing and to confirm a label landed.
        appliedLabel: {
          desc: 'A label already applied to the open conversation',
          scope: 'labelSection',
          optional: true,
          css: [
            '[role="listitem"]',
            '[aria-label^="Remove label" i]',
            '[data-testid*="label-chip" i]',
            'span[dir="auto"]'
          ]
        },
        // UNVERIFIED. The control that opens the label picker.
        addLabelButton: {
          desc: 'Control that opens the label picker',
          scope: 'labelSection',
          css: [
            '[aria-label="Add label"]',
            '[aria-label*="Add label" i]',
            '[aria-label*="Manage labels" i]'
          ],
          text: {
            candidates: '[role="button"], button, a[role="link"]',
            values: ['Add label', 'Add labels', 'Add a label', 'Manage labels'],
            mode: 'exact'
          }
        },
        // UNVERIFIED. The text input of the label picker.
        labelInput: {
          desc: 'Text input of the label picker',
          transient: true,
          css: [
            'input[placeholder*="label" i]',
            'input[aria-label*="label" i]',
            '[role="combobox"][aria-label*="label" i]',
            '[role="dialog"] input[type="text"]'
          ]
        },
        // UNVERIFIED. One existing label offered by the picker.
        labelOption: {
          desc: 'One existing label offered by the label picker',
          transient: true,
          css: [
            '[role="option"]',
            '[role="menuitemcheckbox"]',
            '[role="menuitem"]',
            '[role="listbox"] [role="checkbox"]'
          ]
        },
        // UNVERIFIED. The picker entry that creates a new label from the typed text.
        createLabelOption: {
          desc: 'Picker entry that creates a new label',
          transient: true,
          css: ['[aria-label^="Create label" i]', '[aria-label^="Create new label" i]', '[data-testid*="create-label" i]'],
          text: {
            candidates: '[role="option"], [role="menuitem"], [role="button"], button',
            values: ['Create label', 'Create new label', 'Add new label', 'Create "', 'Create'],
            mode: 'startsWith'
          }
        },
        // UNVERIFIED. Confirm button of a "create label" dialog, when the UI shows
        // one. Skipped when the new label lands without it.
        createLabelConfirm: {
          desc: 'Confirm button of the create label dialog (only if one appears)',
          optional: true,
          transient: true,
          css: ['[role="dialog"] [aria-label="Create"]', '[role="dialog"] [aria-label="Save"]', '[role="dialog"] [aria-label="Done"]'],
          text: {
            candidates: '[role="dialog"] [role="button"], [role="dialog"] button',
            values: ['Create', 'Save', 'Done'],
            mode: 'exact'
          }
        }
      },
      markers: {
        // UNVERIFIED. Same meaning as the Instagram markers above.
        outgoingMarkers: ['You sent', 'You replied'],
        ignoreTexts: ['You sent', 'Enter'],
        messageListLabelPrefixes: ['Messages in conversation with '],
        // UNVERIFIED. URL query parameter that carries the open conversation id.
        threadIdParams: ['selected_item_id'],
        // UNVERIFIED. Substrings of the page URL query string that reveal whether
        // the open conversation is Instagram or Messenger. Checked before the
        // platform badges. When neither source answers, capture refuses to run.
        urlPlatformHints: {
          instagram: ['thread_type=IG', 'mailbox_id=ig', 'platform=instagram', 'inbox/instagram'],
          messenger: ['thread_type=FB', 'mailbox_id=fb', 'platform=messenger', 'inbox/messenger']
        }
      }
    },

    /* ------------------------------------------------------------------ */
    /* Outreach: instagram.com/<handle>/ and the thread its Message       */
    /* button opens. Used by src/outreach/ only.                           */
    /* ------------------------------------------------------------------ */
    // Used by src/faces.js, which reads a lead's profile picture from their profile page when Meta will not share it.
    instagramFaces: {
      // Read by src/faces.js in the service worker, from the head of a public profile page.
      // Checked live 2026-10-22: Instagram answers link preview readers with og:url naming the profile and
      // og:image holding its picture, and answers anyone else with a login page that has neither.
      preview: {
        userAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        pageMeta: 'og:url',
        imageMeta: 'og:image',
        // On the page Instagram shows for a profile that does not exist (a login page never has the preview either,
        // but its title starts with Login).
        goneMarker: 'PolarisErrorRoot',
        loginTitle: /<title>\s*Log ?in/i
      }
    },


    instagramOutreach: {
      targets: {
        // UNVERIFIED. The header block at the top of a profile page. Used to tell
        // "the profile rendered" apart from "nothing rendered".
        profileHeader: {
          desc: 'Header block of a profile page',
          where: 'profile',
          optional: true,
          css: ['main header', '[role="main"] header', 'header section']
        },
        // UNVERIFIED. The Message button on a profile page. Clicked through the
        // guarded click helper. Zero matches or several matches is an error.
        messageButton: {
          desc: 'Message button on a profile page',
          where: 'profile',
          css: [
            'header [role="button"][aria-label="Message"]',
            'header button[aria-label="Message"]',
            'main [role="button"][aria-label="Message"]'
          ],
          text: { candidates: 'header [role="button"], header button, main [role="button"]', values: ['Message'], mode: 'exact' }
        },
        // UNVERIFIED. The message composer of the thread that opens after the
        // Message button is clicked.
        composer: {
          desc: 'Message composer of the opened thread',
          where: 'thread',
          css: [
            'div[role="textbox"][contenteditable="true"][aria-label*="Message" i]',
            'div[contenteditable="true"][role="textbox"]',
            'textarea[placeholder*="Message" i]',
            '[contenteditable="true"][aria-describedby]'
          ]
        },
        // UNVERIFIED. The send control next to the composer. Clicked ONLY by
        // src/outreach/outreach-content.js, and only in "auto" mode after the
        // composer text was verified. When it is not found, Enter is used.
        sendButton: {
          desc: 'Send control of the composer (outreach auto mode only)',
          where: 'thread',
          optional: true,
          css: ['[aria-label="Send"]', '[role="button"][aria-label*="Send" i]', 'button[type="submit"]'],
          text: { candidates: '[role="button"], button', values: ['Send'], mode: 'exact' }
        },
        // UNVERIFIED. The message list of the opened thread. Read after sending
        // to confirm the message appears.
        messageList: {
          desc: 'Message list of the opened thread',
          where: 'thread',
          optional: true,
          css: [
            // Checked live 2026-10-13.
            '[data-pagelet="IGDMessagesList"]',
            '[aria-label^="Messages in conversation with"]',
            '[role="grid"][aria-label*="conversation" i]',
            '[data-pagelet="IGDOpenMessageList"]',
            'div[role="main"] [role="grid"]',
            '[role="grid"]'
          ]
        },
        // UNVERIFIED. One row of that message list.
        messageRow: {
          desc: 'One row in the message list of the opened thread',
          where: 'thread',
          scope: 'messageList',
          optional: true,
          css: ['div:has(> [aria-roledescription="message"])', '[role="row"]', '[role="gridcell"]', '[data-release-focus-from]']
        },
        // Checked live 2026-10-13. The text of a bubble inside a row.
        messageText: {
          desc: 'Text of a message bubble in the opened thread',
          where: 'thread',
          scope: 'messageRow',
          optional: true,
          css: [
            '[aria-roledescription="message"] span[dir="auto"]',
            '[aria-roledescription="message"] div[dir="auto"]',
            'div[dir="auto"]',
            'span[dir="auto"]',
            '[data-testid="message-text"]'
          ]
        },
        // UNVERIFIED. The conversation column, when the thread opens inside the
        // inbox. Its text is ignored by block detection.
        threadList: {
          desc: 'Conversation column next to the opened thread',
          where: 'thread',
          optional: true,
          css: ['[aria-label="Thread list"]', '[aria-label="Chats"][role="list"]', 'div[role="navigation"] [role="list"]']
        },
        // UNVERIFIED. Profile link in the header of the opened thread. When it is
        // found and names a different handle than the task, nothing is typed.
        threadHeaderProfileLink: {
          desc: 'Profile link in the opened thread header (checked against the lead handle)',
          where: 'thread',
          optional: true,
          css: [
            // Checked live 2026-10-13.
            'a[aria-label^="Open the profile page" i]',
            'div[role="main"] header a[href^="/"]:not([href^="/direct"])',
            'div[role="main"] a[role="link"][href^="/"]:not([href^="/direct"])'
          ]
        },
        // UNVERIFIED. Any open dialog. Its visible text is scanned for block phrases.
        dialog: {
          desc: 'Open dialog (scanned for block phrases)',
          optional: true,
          transient: true,
          css: ['[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]']
        },
        // UNVERIFIED. The link to the logged in account's own profile in the side
        // navigation. The handle is read from its href and sent to the app.
        selfProfileLink: {
          desc: 'Link to the logged in account profile (source of the account handle)',
          optional: true,
          css: [
            // Checked live 2026-10-13: the side menu entry wraps the picture in a tab.
            'a[href^="/"]:not([aria-label]):has([aria-selected] img[alt*="profile picture" i])',
            '[role="navigation"] a[href^="/"]:has(img[alt*="profile picture" i])',
            'nav a[href^="/"]:has(img[alt*="profile picture" i])'
          ],
          text: { candidates: 'nav a[role="link"], [role="navigation"] a[role="link"]', values: ['Profile'], mode: 'exact' }
        },
        // UNVERIFIED. A login form. Finding it counts as blocked.
        loginForm: {
          desc: 'Login form (finding it reports the task as blocked)',
          optional: true,
          expectAbsent: true,
          css: ['form#loginForm', 'input[name="username"]', 'input[name="password"]', 'input[type="password"]']
        }
      },
      markers: {
        // UNVERIFIED. Visible page text that means the profile does not exist.
        notFoundTexts: [
          // Checked against the live signed out page on 2026-10-11.
          "profile isn't available",
          "the profile may have been removed",
          "sorry, this page isn't available",
          "this page isn't available",
          'the link may be broken',
          'page not found',
          'user not found'
        ]
      }
    }
  };

  root.AIDM_SELECTORS = SELECTORS;
  if (typeof module === 'object' && module.exports) module.exports = SELECTORS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
