// The video guides, one entry per module. Built by build-videos.mjs.
//
// A scene is either a title card ({ card: true, k, h1, p, steps, list, say }) or a screenshot of the app:
//   go   page to open                     pre  async (ctx) => {} to put the app in the state to show
//   js   script run in the page first     hl   expression for the part to spotlight
//   cap  caption in the bar               say  the narration
// In js and hl: T("text", "selector") finds the smallest element showing that text, click("text") presses it,
// up(el, "selector") walks up to an enclosing element.

const card = (heading) => `up(T(${JSON.stringify(heading)},'h2'),'.card')`;
const QUESTION = "do i need a big following already for this to work?";

const helper = (account) => (ctx) => ctx.ext("/api/ext/hello", { version: "0.3.0", outreachOn: false, ...(account === undefined ? {} : { account }) });
const demoThread = async (ctx, skip = 0) => {
  const list = (await ctx.convs()).filter((c) => c.externalId.startsWith("demo_") && !c.labels.includes("Do not contact") && c.status !== "done");
  const out = [];
  for (const c of list) { const d = await ctx.call(`/api/conversations/${c.id}`); if (d.messages.some((m) => m.direction === "out")) out.push(c); if (out.length > skip + 2) break; }
  return out[skip];
};
const ask = async (ctx, c, text) => { await ctx.call(`/api/conversations/${c.id}/simulate`, "POST", { text }); await ctx.call(`/api/conversations/${c.id}/suggest`, "POST"); };
let A, B, C; // demo leads reused across scenes

export const MODULES = [
  {
    id: "welcome", group: "Start here", title: "How Ainable Setter works", screen: "/",
    summary: "The whole tool in a few minutes: from the first message a lead sends to a call on your calendar. Plays the first time someone signs in.",
    scenes: [
      { card: true, k: "Start here", h1: "Welcome to <em>Ainable Setter</em>", p: "Your AI appointment setter for Instagram. Here is how it works, start to finish.",
        say: "Hi, and welcome to Ainable Setter. Over the next few minutes, I'll walk you through exactly how it works, from the very first message a lead sends you, all the way to a call on your calendar." },
      { card: true, small: true, k: "The big picture", h1: "From first message to <em>booked call</em>",
        steps: ["A lead messages you on Instagram", "The AI replies in your voice and qualifies them", "It offers real times from your calendar", "They book, and you take the call"],
        say: "So, here's the big picture. A lead messages you on Instagram. The A I replies in your voice, asks the right questions, and works out whether they're a good fit. When they are, it offers them real times from your calendar. They book, and all you have to do is show up for the call." },
      { pre: helper("yourbrand"), go: "/connect", hl: `T('Get connected','a')`, cap: "Start in <em>Get connected</em>",
        say: "Everything starts on the Get connected screen. You add a small helper to Chrome, sign in to Instagram, and send yourself a test message. Each step ticks itself off once it's done." },
      { go: "/onboarding", js: `window.confirm=()=>true; click('Fill with example','button')`, hl: `up(T('Business','button'),'ol,ul')`, cap: "Tell the AI about <em>your business</em>",
        say: "Next up is your business brief. This is where you tell the A I what you sell, who it's for, and how you like to write. It only ever says what you've told it here, so it's worth ten minutes to get it right." },
      { pre: async (ctx) => { A = await demoThread(ctx, 0); B = await demoThread(ctx, 1); await ctx.call(`/api/conversations/${A.id}/suggest`, "POST"); }, go: "/inbox?c=__A__",
        hl: `document.querySelector('[aria-label="Conversation list"]')`, cap: "Every conversation in <em>one inbox</em>",
        say: "Day to day, you'll spend most of your time in the inbox. Every conversation is right here, newest first, and a little dot means it hasn't been read yet." },
      { hl: `document.querySelector('[aria-label="AI mode"]')`, cap: "<em>Off</em>, <em>Suggest</em> or <em>Autopilot</em>",
        say: "For each lead, you decide how much the A I does. Off means you write every reply yourself. Suggest means it drafts the reply, and you approve it. And Autopilot means it replies all on its own." },
      { hl: `T('Suggested reply','span')?.parentElement?.parentElement`, cap: "A draft, written <em>in your voice</em>",
        say: "Here's a draft it just wrote. You can send it as it is, change a few words, or ask for another version. Most people start on Suggest, and switch to Autopilot once they trust it." },
      { hl: `document.querySelector('[aria-label="Lead details"]')`, cap: "It keeps every <em>lead's details</em> up to date",
        say: "Over on the right, it keeps notes on every lead as the conversation goes. Their situation, what they want, and where they are in your pipeline." },
      { pre: async (ctx) => {
          await ctx.call("/api/calendar", "POST", { action: "connect", token: "demo-token" });
          const pool = (await ctx.convs()).filter((c) => c.externalId.startsWith("demo_") && ["qualified", "business_model_sent"].includes(c.stage) && !c.labels.includes("Needs human") && !c.labels.includes("Do not contact"));
          C = pool[0];
          await ask(ctx, C, "yes that sounds great, lets do it");
        }, go: "/inbox?c=__C__", hl: `T('Suggested reply','span')?.parentElement?.parentElement`, cap: "It offers <em>real times</em> from your calendar",
        say: "And when a lead is ready for a call, it doesn't just drop a booking link and hope. It checks your Calendly, offers two or three times that are actually free, and when they pick one, it sends them the link for that exact time." },
      { go: "/settings?tab=calendar", hl: `T('What the AI would offer a lead right now','div')?.parentElement?.parentElement`, cap: "Connect <em>Calendly</em> once",
        say: "You connect your Calendly once, in Settings. Pick the meeting type and how many times to offer, and you can see exactly what it would offer a lead right now." },
      { pre: async (ctx) => { await ask(ctx, B, QUESTION); }, go: "/playbook", hl: card("Waiting for your answer"), cap: "When it doesn't know, it <em>asks you once</em>",
        say: "If a lead asks something the A I hasn't been told, it won't make something up. It asks you instead. You answer once, and it remembers that answer for every lead after." },
      { go: "/leads", hl: `document.querySelector('[aria-label="Board columns"]') || document.querySelector('main')`, cap: "See where <em>every lead</em> stands",
        say: "The leads board shows where everyone stands, with one column for each stage, from the first message all the way to a won deal." },
      { go: "/outreach?tab=overview", hl: `document.querySelector('.card')`, cap: "Start conversations <em>yourself</em>, safely",
        say: "If you'd like to start conversations yourself, Outreach sends a handful of first messages each day, from your own browser, at a pace that keeps your account safe." },
      { go: "/insights", hl: card("What to do next"), cap: "Your numbers, and <em>what to do next</em>",
        say: "And Insights reads your numbers, and tells you in plain words the one change that would book you the most extra calls." },
      { go: "/learn", hl: `T('Video guides','a')`, cap: "A short <em>video guide</em> for every screen",
        say: "Whenever you need a refresher, every part of the tool has its own short video, right here in Video guides." },
      { card: true, k: "You're ready", h1: "Connect. Brief. <em>Work the inbox.</em>", p: "Start with Get connected. It takes about ten minutes.",
        say: "And that's really all there is to it. Get connected, fill in your brief, and let the A I start working your inbox. Head over to Get connected now. It only takes about ten minutes." },
    ],
  },
  {
    id: "connect", group: "Set up", title: "Get connected", screen: "/connect",
    summary: "Add the helper to Chrome, sign in to Instagram and send a test message. Start here.",
    scenes: [
      { card: true, k: "Set up, part 1 of 3", h1: "Get <em>connected</em>", p: "Three steps. Each one ticks itself when it is done.",
        say: "Welcome. This video gets you connected. There are three steps, and each one ticks itself when it is done, so you always know where you are." },
      { go: "/connect", hl: `T('Get connected','a')`, cap: "Open <em>Get connected</em> in the menu",
        say: "Open Get connected in the menu. This one screen is where everything is set up." },
      { hl: card("Add the helper to Chrome"), cap: "Step 1: add the <em>helper</em> to Chrome",
        say: "Step one is the helper. It is a small add on for Chrome. It is the part that types and sends messages in your own Instagram, from your own browser. You add it once." },
      { hl: `T('Download the helper','a')`, cap: "Download the helper, then <em>unzip it</em>",
        say: "Press Download the helper. It saves a zip file to your Downloads folder. Open Downloads and double click the zip, and a folder called Ainable Setter Helper appears. Leave that folder where it is, because Chrome runs the helper from it." },
      { hl: `T('chrome://extensions','code')`, cap: "Copy <em>chrome://extensions</em> into a new tab",
        say: "Next, copy this address, open a new tab, paste it, and press Enter. Chrome doesn't let websites link to this page, which is why it gets pasted." },
      { card: true, small: true, k: "On Chrome's extensions page", h1: "Two clicks, then <em>choose the folder</em>",
        steps: ["Switch on <b>Developer mode</b>, top right", "Click <b>Load unpacked</b>, top left", "Mac: press <b>Cmd Shift G</b>, paste the folder address from step 5, press <b>Enter</b>, click <b>Select</b>", "Windows: open Downloads, then the folder with <b>manifest.json</b> in it, click <b>Select Folder</b>"],
        say: "On that page, switch on Developer mode in the top right corner, then click Load unpacked in the top left. On a Mac, press Command Shift G, paste the folder address from step five, press Enter, and click Select. On Windows, open Downloads, then the helper folder with the file called manifest dot json inside, and click Select Folder." },
      { pre: helper(""), go: "/connect", hl: card("Add the helper to Chrome"), cap: "It <em>links itself</em>. Nothing to copy",
        say: "Come back to the app. The helper links itself within a few seconds. There is no address or key to copy. Step one now shows a tick." },
      { hl: card("Sign in to Instagram in this Chrome"), cap: "Step 2: sign in to <em>Instagram</em>",
        say: "Step two. Press the button to open Instagram's own sign in page, and sign in the way you normally do. Your password is only ever typed on Instagram, never in this app." },
      { pre: helper("yourbrand"), go: "/connect", hl: card("Sign in to Instagram in this Chrome"), cap: "The app sees <em>which account</em> you are on",
        say: "When you come back, the app shows which account you are signed in to. Messages will be sent from that account." },
      { hl: card("Send one test message"), cap: "Step 3: send one <em>test message</em>",
        say: "Step three is a test. Type the username of someone who is expecting it, such as your own second account. Choose whether you press send yourself, or the helper sends it. Then press Send test message." },
      { card: true, small: true, k: "What happens next", h1: "Chrome types it <em>like a person</em>",
        list: ["A pinned Instagram tab opens", "It goes to their profile and types the message", "Slips and corrections included", "It takes about a minute"],
        say: "Chrome opens a pinned Instagram tab, goes to their profile, and types the message the way a person would, with small slips and corrections. It takes about a minute. Leave that tab alone while it works." },
      { hl: card("Sending from this browser"), cap: "One switch turns <em>all sending</em> on or off",
        say: "Last, this switch. When it is off, nothing is sent from this browser, whatever your campaigns say. Turn it on when you are ready to send." },
      { card: true, k: "You are connected", h1: "Next: connect your <em>inbox and the AI</em>",
        say: "That is it. You are connected. In the next video, we connect your Instagram inbox, the A I, and your C R M." },
    ],
  },
  {
    id: "connections", group: "Set up", title: "Connect your inbox, the AI and your CRM", screen: "/connect",
    summary: "The three connection points under Get connected, with the exact page each link opens.",
    scenes: [
      { card: true, k: "Set up, part 2 of 3", h1: "Connect <em>the rest</em>", p: "Your Instagram inbox, the AI that writes replies, and your CRM.",
        say: "This video covers the three other connections. Your Instagram inbox, the A I that writes replies, and your C R M. All three are on the Get connected screen, under Connect the rest." },
      { pre: helper("yourbrand"), go: "/connect", js: `T('Connect the rest','h2').scrollIntoView({block:'start'})`, hl: card("Your Instagram inbox"), cap: "Your <em>Instagram inbox</em>",
        say: "First, your Instagram inbox. This is what lets the app read your messages and answer them. It uses Instagram's official connection." },
      { js: `T('Connect the rest','h2').scrollIntoView({block:'start'})`, hl: `T('Open the create app page','a')`, cap: "Every link opens the <em>exact page</em>",
        say: "Follow the numbered links in order. Each link opens the exact page you need, so there is nothing to search for. Link one creates your Meta app." },
      { js: `T('Connect the rest','h2').scrollIntoView({block:'start'})`, hl: `document.querySelector('input[aria-label="Meta app ID"]')`, cap: "Paste the <em>app ID</em> once",
        say: "Paste the app's I D here. It is the long number at the top of your new app. Once it is in, the next link takes you straight to the right page inside your app." },
      { js: `T('Connect the rest','h2').scrollIntoView({block:'start'})`, hl: `up(document.querySelector('input[aria-label="Instagram token"]'),'li')`, cap: "Generate the token, paste it, press <em>Connect</em>",
        say: "On that page, press Add account, sign in to Instagram, and press Generate token. Paste the token here and press Connect. Your inbox starts to fill within a minute." },
      { card: true, small: true, k: "When the app is hosted for customers", h1: "One button: <em>Continue with Instagram</em>",
        p: "Once the app has its own public address and a registered Meta app, these steps are replaced by a single sign in button.",
        say: "A note for later. When the app is hosted on a public address, with a registered Meta app, these steps are replaced by one button. Continue with Instagram. It works the same way as Continue with Google." },
      { go: "/connect", js: `T('The AI that writes replies','h2').scrollIntoView({block:'center'})`, hl: card("The AI that writes replies"), cap: "The <em>AI</em> that writes replies",
        say: "Second, the A I. It needs a key from Anthropic, and some credit on that account. The links open the keys page and the billing page. Paste the key, press Save, and the app checks it for you." },
      { js: `T('Your CRM (optional)','h2').scrollIntoView({block:'center'})`, hl: card("Your CRM (optional)"), cap: "Your <em>CRM</em>, if you use one",
        say: "Third, your C R M. This one is optional. If you use Go High Level, create a private integration in the sub account that should receive your leads, then paste the token and location I D into Settings, under C R M." },
      { card: true, k: "Green ticks mean it is working", h1: "Each one shows a <em>tick</em> when it works",
        say: "Each connection shows a green tick as soon as it is working. If something stops working later, this screen tells you what is wrong, in plain words." },
    ],
  },
  {
    id: "brief", group: "Set up", title: "Tell the AI about your business", screen: "/onboarding",
    summary: "The business brief: what you sell, who it is for, where to send leads, and what the AI must never say.",
    scenes: [
      { card: true, k: "Set up, part 3 of 3", h1: "Tell the AI about <em>your business</em>", p: "The AI only says what you have told it. This is where you tell it.",
        say: "The A I only says what you have told it. The business brief is where you tell it. It takes about ten minutes, and you can change it at any time." },
      { go: "/onboarding", js: `window.confirm=()=>true; click('Fill with example','button')`, hl: `up(T('Business','button'),'ol,ul')`, cap: "Seven short sections, in <em>any order</em>",
        say: "Open Business brief in the menu. There are seven short sections down the left. You can fill them in any order." },
      { js: `click('Offer','button')`, cap: "What you <em>sell</em> and what it costs",
        say: "In Offer, write what you sell, how it works, and the price. The A I uses this to explain your offer, and it will only ever quote the price you put here." },
      { js: `click('Ideal client','button')`, cap: "Who it is <em>for</em>, and who it is not",
        say: "In Ideal client, say who it is for, who is not a fit, and the questions you ask to find out. The A I asks them one at a time, the way a good setter would." },
      { js: `click('Conversion goals','button')`, cap: "Where to <em>send</em> a lead",
        say: "Conversion goals are the places you send a lead. A booking page, a video, a webinar. Add each link, and say when it should be sent. The A I can only send links from this list." },
      { js: `click('Voice and rules','button')`, cap: "How you <em>write</em>, and what must never be said",
        say: "Voice and rules is how you write, the claims you are happy to make, and what must never be said. These are hard limits. The A I does not go outside them." },
      { js: `click('Review','button')`, cap: "Check it and <em>save</em>",
        say: "Finish on Review, check it reads right, and save. From then on, every reply is written from this brief." },
    ],
  },
  {
    id: "inbox", group: "Every day", title: "Work the inbox", screen: "/inbox",
    summary: "Read conversations, let the AI draft or send, reply yourself, and keep each lead's details up to date.",
    scenes: [
      { card: true, k: "Every day", h1: "Work the <em>inbox</em>", p: "Every conversation, what the AI suggests, and everything known about the lead.",
        say: "The inbox is where you will spend most of your time. It shows every conversation, what the A I suggests, and everything known about each lead." },
      { pre: async (ctx) => { A = await demoThread(ctx, 0); B = await demoThread(ctx, 1); await ctx.call(`/api/conversations/${A.id}/suggest`, "POST"); }, go: "/inbox?c=__A__",
        hl: `document.querySelector('[aria-label="Conversation list"]')`, cap: "Your <em>conversations</em>, newest first",
        say: "On the left are your conversations, newest first. A dot means unread. Use the filters at the top to see only unread, follow ups, or the ones that need a person." },
      { hl: `document.querySelector('[aria-label="Conversation"]')`, cap: "The <em>conversation</em> itself",
        say: "Click a conversation to open it in the middle. Messages the A I sent are marked A I, so you can always tell who wrote what." },
      { hl: `document.querySelector('[aria-label="AI mode"]')`, cap: "Choose what the AI does: <em>Off, Suggest or Autopilot</em>",
        say: "At the top, choose what the A I does for this lead. Off means you write every reply. Suggest means it drafts a reply for you to approve. Autopilot means it replies by itself, inside Instagram's twenty four hour window." },
      { hl: `T('Suggested reply','span')?.parentElement?.parentElement`, cap: "A <em>suggested reply</em>, ready to send or change",
        say: "In Suggest mode, the draft appears above the reply box, with the reason for it. Edit the words if you like, then press Send. Or press Rewrite for another version." },
      { hl: `up(document.querySelector('textarea[placeholder^="Write a reply"]'),'div')`, cap: "Or <em>write it yourself</em>. Type / for shortcuts",
        say: "You can always write the reply yourself. Type a forward slash to drop in one of your saved messages, with the lead's name filled in." },
      { hl: `document.querySelector('[aria-label="Lead details"]')`, cap: "Everything known about the <em>lead</em>",
        say: "On the right is everything known about the lead. A summary of the conversation so far, the stage, tags, and what they have told you. The A I keeps this filled in as it goes." },
      { hl: `T('Follow up','[aria-label="Conversation"] button')?.parentElement`, cap: "<em>Follow up</em> and <em>Done</em>",
        say: "Use Follow up to flag a conversation to come back to, and Done when it is finished. That keeps the list short." },
      { card: true, k: "Good to know", h1: "You can <em>rearrange</em> everything", list: ["Drag panels to move them", "Hide the ones you do not need", "Press Layout to reset"],
        say: "One more thing. Every panel can be moved, resized or hidden. Press Layout, at the bottom of the menu, to change it or put it back." },
    ],
  },
  {
    id: "teach", group: "Every day", title: "When the AI does not know the answer", screen: "/playbook",
    summary: "The AI flags questions it cannot answer. Answer once and it remembers for every lead after.",
    scenes: [
      { card: true, k: "Every day", h1: "When the AI <em>does not know</em>", p: "It asks you, once. Then it remembers.",
        say: "Sometimes a lead asks something the A I has not been told. It does not guess. It asks you, once, and then it remembers the answer for every lead after." },
      { pre: async (ctx) => { A = await demoThread(ctx, 0); B = await demoThread(ctx, 1); await ask(ctx, A, QUESTION); await ask(ctx, B, "do i need a big following for this to work"); }, go: "/inbox?c=__A__",
        hl: `T('The AI needs your answer','span')?.parentElement?.parentElement`, cap: "The AI <em>stops and asks you</em>",
        say: "Here, a lead has asked whether they need a big following. The A I has no answer, so it has sent nothing. A red box shows the question, and the conversation is tagged Needs human." },
      { hl: `up(document.querySelector('textarea[placeholder^="Write a reply"]'),'div')`, cap: "Reply as normal. The AI <em>learns your answer</em>",
        say: "Just reply to the lead as you normally would. With the box ticked, your reply is saved as the answer. That is all you need to do." },
      { go: "/playbook", hl: `T('Playbook','a')`, cap: "A badge shows how many are <em>waiting</em>",
        say: "You can also answer from Playbook. The red badge in the menu shows how many questions are waiting for you." },
      { hl: card("Waiting for your answer"), cap: "Answer once for <em>every lead</em> who asked",
        say: "Each question is listed once, with every lead who asked it. Here, two leads asked the same thing in different words. Type your answer and press Save answer and teach the A I." },
      { pre: async (ctx) => { const k = await ctx.call("/api/knowledge"); if (k.gaps[0]) await ctx.call("/api/knowledge", "POST", { action: "answer", gapId: k.gaps[0].id, answer: "no, most of our clients start with under a thousand followers. what matters is having an offer people already pay for" }); }, go: "/playbook",
        hl: card("What the AI has been taught"), cap: "It is now part of <em>what the AI knows</em>",
        say: "The answer moves into What the A I has been taught. You can edit it, switch it off, or add answers of your own here at any time." },
      { go: "/inbox?c=__B__", hl: `T('Suggested reply','span')?.parentElement?.parentElement`, cap: "Leads who were waiting get <em>their answer</em>",
        say: "And every lead who was waiting gets a reply, written from your answer. On Autopilot it is sent for you. Otherwise it is drafted, ready to send." },
      { card: true, k: "The result", h1: "The more you answer, the <em>less it asks</em>",
        say: "The more you answer, the less it asks. After the first few weeks, most questions are handled without you." },
    ],
  },
  {
    id: "outreach", group: "Every day", title: "Send first messages", screen: "/outreach",
    summary: "Add people to message, write several versions, set a safe daily pace, and use the conversation starters.",
    scenes: [
      { card: true, k: "Every day", h1: "Send <em>first messages</em>", p: "Reach people who have not messaged you yet, at a safe pace.",
        say: "Outreach is for reaching people who have not messaged you yet. The app sends a small number each day, from your own browser, at a pace that keeps your account safe." },
      { pre: async (ctx) => {
          const r = await ctx.call("/api/outreach", "POST", { action: "import", name: "Coaches, October", text: "username,name,city\nmaya.coaching,Maya Thompson,Leeds\nsamlee.fit,Sam Lee,Bath\njordan.builds,Jordan Reyes,York\npriya.studio,Priya Nair,Hull\nnoah.pt,Noah Lindqvist,Derby\nella.yoga,Ella Brooks,Leeds" });
          await ctx.call("/api/outreach", "POST", { action: "campaign.save", campaign: { name: "Coaches, first hello", listIds: [r.listId], status: "active", variants: ["hey {first_name|there}, saw you're coaching in {city}. are you taking on new clients right now?", "hi {first_name|there}! loved your recent posts. do you run everything yourself or with a team?", "{first_name|hey}, quick one. where do most of your clients come from at the moment?", "hey {first_name|there}, how long have you been coaching for?", "hi {first_name|there}, what are you working on in {city} this month?"].map((text) => ({ text })) } });
        }, go: "/outreach?tab=prospects", hl: `document.querySelector('[role=tab][aria-selected=true]')?.parentElement`, cap: "Five tabs, <em>left to right</em>",
        say: "Open Outreach in the menu. There are five tabs. We will go through them in the order you use them." },
      { hl: `up(T('Coaches, October'),'.card') || T('Coaches, October')`, cap: "<em>Prospects</em>: the people to message",
        say: "Prospects are the people you want to message. Paste a list of Instagram usernames, or upload a spreadsheet. Extra columns, like a first name or a city, can be used inside your messages." },
      { go: "/outreach?tab=campaigns", hl: `up(T('Coaches, first hello'),'.card') || T('Coaches, first hello')`, cap: "<em>Campaigns</em>: what to say",
        say: "A campaign is what you say to a list. Write at least five different versions of your first message. The app rotates them evenly, so no two people in a row get the same words, and you can see which version gets the most replies." },
      { go: "/outreach?tab=sending", hl: `document.querySelector('.card')`, cap: "<em>Sending and typing</em>: a safe daily pace",
        say: "Sending and typing sets the pace. The app starts at ten messages a day and builds up slowly, only inside the hours you choose, with uneven gaps between them. It will never go above fifty a day." },
      { go: "/outreach?tab=starters", hl: `document.querySelector('.card')`, cap: "<em>Conversation starters</em>: let people come to you",
        say: "Conversation starters bring people to you, through Instagram's official tools. When someone comments a keyword on your post, they get a private reply in their messages. And you can make trackable links that open a chat with you." },
      { go: "/outreach?tab=overview", hl: `document.querySelector('.card')`, cap: "<em>Overview</em>: switch it on and watch it work",
        say: "Overview is where you switch outreach on, and see what was sent today, what is next, and how each message version is doing." },
      { card: true, small: true, k: "Built in safety", h1: "It <em>stops itself</em> if Instagram objects", list: ["A warning from Instagram pauses everything", "Two failed sends in a day pauses everything", "Nothing restarts until you press Resume"],
        say: "If Instagram ever shows a warning, or two sends fail in one day, everything pauses by itself, and nothing restarts until you press Resume." },
    ],
  },
  {
    id: "leads", group: "Every day", title: "Track leads and results", screen: "/leads",
    summary: "The leads board, your stages and tags, and the numbers that show what to fix.",
    scenes: [
      { card: true, k: "Every day", h1: "Track <em>leads and results</em>", p: "Where every lead stands, and what the numbers say to do next.",
        say: "This video shows where every lead stands, and how to read your numbers." },
      { go: "/leads", hl: `document.querySelector('[aria-label="Board columns"]') || document.querySelector('main')`, cap: "The <em>leads board</em>: one column per stage",
        say: "Leads centre is a board with one column for each stage, from first message to won. Each card is a lead. A red mark means it needs a person." },
      { js: `document.querySelector('button[draggable][aria-pressed]')?.click()`, after: 2200, hl: `document.querySelector('aside[aria-label="Lead details"]')`, cap: "Click a lead to open it <em>without leaving</em> the board",
        say: "Click a lead to open it without leaving the board. You see the details on the right, and you can reply from the chat at the bottom." },
      { go: "/pipeline", hl: card("Stages"), cap: "<em>Stages</em> you can rename, add or remove",
        say: "Stages and tags is where you make the pipeline your own. Rename a stage, add one, or remove one you do not use." },
      { hl: card("Tags"), cap: "<em>Tags</em>, with a rule for when the AI adds them",
        say: "Tags work the same way. Give a tag a rule, in plain words, and the A I applies it only when that rule is met." },
      { go: "/insights", hl: card("What to do next"), cap: "<em>Insights</em> starts with what to do next",
        say: "Insights starts with what to do next. It reads your numbers and tells you, in a sentence or two, the change that would book the most extra calls." },
      { js: `T('Forecast and target','h2')?.scrollIntoView({block:'start'})`, hl: card("Forecast and target"), cap: "Your <em>forecast</em> against your target",
        say: "Below that is your forecast for the month against your target, then the funnel, showing where leads drop off between each stage." },
      { card: true, k: "That is the whole tool", h1: "Connect. Brief. <em>Work the inbox.</em>",
        say: "That is the whole tool. Get connected, fill in your brief, and work the inbox. You can watch any of these videos again from Video guides in the menu." },
    ],
  },
  {
    id: "team", group: "Settings", title: "Your team, shortcuts and automatic replies", screen: "/settings",
    summary: "Give people their own login, save messages you reuse, and reply to keywords straight away.",
    scenes: [
      { card: true, k: "Settings", h1: "Team, shortcuts and <em>automatic replies</em>",
        say: "This last video covers three things in Settings. Logins for your team, saved messages, and automatic replies to keywords." },
      { go: "/settings?tab=general", hl: `document.querySelector('[role=tab][aria-selected=true]')?.parentElement`, cap: "<em>Settings</em> is split into tabs",
        say: "Settings is split into tabs along the top. The first tab controls the A I. Whether it may send by itself, how long it waits before replying, and whether it types at a human speed." },
      { go: "/settings?tab=team", hl: `document.querySelector('.card')`, cap: "<em>Team</em>: a login for each person",
        say: "In Team, add a login for each person. Choose which screens they can open, and whether they see every lead or only their own. The first account you create becomes the owner." },
      { go: "/settings?tab=shortcuts", hl: `document.querySelector('.card')`, cap: "<em>Shortcuts</em>: messages you send often",
        say: "Shortcuts are messages you send often. Save one with a short name, then type a forward slash and that name in any reply box. The lead's details are filled in for you." },
      { go: "/settings?tab=keywords", hl: `document.querySelector('.card')`, cap: "<em>Keyword replies</em>: answer straight away",
        say: "Keyword replies answer straight away. When a lead sends a word you choose, such as guide, your saved reply goes out at once, and the lead can be tagged at the same time." },
      { go: "/settings?tab=links", hl: `document.querySelector('.card')`, cap: "<em>Conversion links</em>: where leads are sent",
        say: "Conversion links are the places you send leads, the same list as in your business brief. Add as many as you need." },
      { card: true, k: "Need a reminder?", h1: "Every screen has a <em>video guide</em>",
        say: "If you ever need a reminder, open Video guides in the menu. Every part of the tool has a short video like this one." },
    ],
  },
];

// Scenes that open a particular lead say __A__, __B__ or __C__ in their address; they are swapped for the real ids at run time.
for (const m of MODULES) for (const s of m.scenes) {
  if (!s.go || !/__[ABC]__/.test(s.go)) continue;
  const tmpl = s.go, pre = s.pre;
  s.pre = async (ctx) => { if (pre) await pre(ctx); s.go = tmpl.replace("__A__", A?.id ?? "").replace("__B__", B?.id ?? "").replace("__C__", C?.id ?? ""); };
}
