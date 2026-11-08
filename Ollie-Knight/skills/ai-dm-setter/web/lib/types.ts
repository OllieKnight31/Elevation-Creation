import type { PipelineConfig } from "./pipeline";

export type Platform = "instagram" | "messenger";

/** A pipeline stage id. The built in stages have fixed ids; stages the owner adds get generated ones. */
export type StageId = string;

export type AiMode = "off" | "suggest" | "autopilot";
export type ConvStatus = "open" | "follow_up" | "done" | "spam";
export type Actor = "ai" | "human" | "system";
export type MessageSource = "webhook" | "api_backfill" | "export" | "extension" | "app" | "seed";

export interface Message {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  /** auto = sent by a keyword trigger */
  sender: "lead" | "owner" | "ai" | "auto";
  /** Team member who sent it, when a person did */
  memberId?: string;
  text: string;
  sentAt: string;
  source: MessageSource;
  externalId?: string;
  /** Copied from the chat list, which cut it short. Replaced by the whole message once the chat shows it. */
  partial?: true;
  /** Copied to the Google Sheets archive */
  archived?: true;
  /** Set while the Chrome helper still has to type it, or when it could not. Absent once it has gone. */
  delivery?: "queued" | "failed";
  deliveryNote?: string;
  /** When the lead opened it, from Meta's seen receipt. Outgoing messages only. */
  seenAt?: string;
}

export interface LeadProfile {
  situation?: string;
  goal?: string;
  pain?: string;
  objections?: string[];
  budget?: string;
  email?: string;
  phone?: string;
}

/** Short brief of the conversation so far, so anyone stepping in is up to speed. */
export interface ConvSummary {
  text: string;
  nextStep: string;
  updatedAt: string;
  engine: "claude" | "demo";
  /** Messages in the thread when this was written */
  messageCount: number;
  /** Stage and tags when a basic brief was written. It is rebuilt when either changes. */
  basis?: string;
}

/** Where this lead lives in the connected CRM. */
export interface CrmLink {
  contactId?: string;
  opportunityId?: string;
  noteKey?: string;
  lastSyncAt?: string;
  lastStatus?: "ok" | "failed";
  lastError?: string;
}

export interface Suggestion {
  bubbles: string[];
  reason: string;
  stage: StageId;
  labels: string[];
  needsHuman: boolean;
  engine: "claude" | "demo";
  createdAt: string;
  /** Set when the lead asked something the AI has no answer for. */
  gap?: { question: string; kind: KnowledgeKind; quote: string; sameAs?: string };
  /** Learned answers this reply drew on */
  usedKnowledge?: string[];
  /** Free calendar times this reply offers the lead */
  times?: CalendarSlot[];
  /** The offered time the lead chose, whose link this reply sends */
  picked?: CalendarSlot;
}

/** One free time in the owner's calendar, with the link that opens the booking page on that time. */
export interface CalendarSlot {
  start: string;
  url: string;
}

export interface CalendarConfig {
  provider: "calendly";
  /** Off keeps the connection but the AI goes back to sending the plain booking link */
  enabled: boolean;
  token?: string;
  user?: { uri: string; name: string; url: string; timezone: string };
  eventTypes: { uri: string; name: string; minutes: number; url: string }[];
  /** The meeting type the AI offers times for */
  eventTypeUri: string;
  /** How many times the AI offers at once */
  offer: number;
  /** How far ahead it looks */
  daysAhead: number;
  /** Never offer a time sooner than this */
  minNoticeHours: number;
  /** Timezone the times are said in. Empty means the Calendly account's own. */
  timezone: string;
  connectedAt?: string;
  lastError?: string;
}

export interface Conversation {
  id: string;
  platform: Platform;
  externalId: string;
  /** Instagram scoped id or Page scoped id, only known for threads seen through the official API */
  scopedUserId?: string;
  name: string;
  handle: string | null;
  /** Profile picture address on Instagram's servers, read by the helper or the API. These addresses expire, so it is refreshed on every read. */
  avatar?: string;
  avatarAt?: string;
  /** The picture address whose image is saved in the app (Instagram's addresses expire, the saved copy does not). */
  avatarSaved?: string;
  /** When the Chrome helper last looked this lead's picture up on their Instagram profile. */
  faceTriedAt?: string;
  origin: string;
  stage: StageId;
  labels: string[];
  status: ConvStatus;
  aiMode: AiMode;
  unread: boolean;
  lastInboundAt: string | null;
  /** The last time the lead opened the chat, from Meta's seen receipts. */
  seenAt?: string;
  lastMessageAt: string;
  lead: LeadProfile;
  notes: string;
  lossReason?: string;
  suggestion?: Suggestion | null;
  summary?: ConvSummary | null;
  /** Team member responsible for this lead */
  assignedTo?: string | null;
  crm?: CrmLink;
  /** Keyword triggers that have already fired on this thread */
  firedTriggers?: string[];
  /** The unanswered question this thread is waiting on a person for */
  gapId?: string | null;
  /** Calendar times last offered to this lead. draft is the createdAt of the suggestion that offered them. */
  proposed?: { at: string; draft: string; slots: CalendarSlot[]; picked?: CalendarSlot } | null;
  /** Older messages of this thread were moved to the Google Sheets archive, up to this time. Anything captured again from before it is skipped. */
  prunedUntil?: string;
  /** How many moved messages had each direction and text (by short hash), so a fresh capture by the helper does not add them back */
  pruned?: Record<string, number>;
  createdAt: string;
}

export type EventType =
  | "conversation_started"
  | "message_sent"
  | "message_received"
  | "stage_changed"
  | "link_sent"
  | "label_added"
  | "trigger_fired"
  | "starter_fired"
  | "question_flagged"
  | "answer_learned"
  | "times_proposed";

export interface FunnelEvent {
  id: string;
  conversationId: string;
  type: EventType;
  stage?: StageId;
  detail?: string;
  by: Actor;
  memberId?: string;
  at: string;
  capi?: { status: "sent" | "skipped" | "failed"; eventName?: string; note?: string };
  /** Copied to the Google Sheets archive */
  archived?: true;
}

export type GoalType = "call" | "vsl" | "webinar" | "resource" | "community" | "application" | "checkout" | "other";

/** One place a lead can be sent: a booking page, a video, a webinar, a free resource, a community and so on. */
export interface ConversionGoal {
  id: string;
  type: GoalType;
  label: string;
  url: string;
  when: string;
  /** How the link is introduced when it is sent. Optional. */
  message?: string;
}

/** A saved message a setter drops in by typing its trigger, for example /open. */
export interface Shortcut {
  id: string;
  trigger: string;
  name: string;
  category: string;
  text: string;
}

/** When a lead's message contains a keyword, this reply goes out straight away. */
export interface KeywordTrigger {
  id: string;
  name: string;
  keywords: string[];
  match: "exact" | "contains";
  text: string;
  addTags: string[];
  aiAfter: "keep" | AiMode;
  once: boolean;
  enabled: boolean;
  fired: number;
}

export type Area = "inbox" | "leads" | "outreach" | "insights" | "playbook" | "pipeline" | "brief" | "settings";
export type Role = "owner" | "admin" | "setter" | "closer" | "viewer";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  team: string;
  /** Screens this person can open */
  areas: Area[];
  /** all = every conversation, assigned = only leads assigned to them */
  scope: "all" | "assigned";
  /** Can see every team member's numbers in Insights, not only their own */
  teamMetrics: boolean;
  active: boolean;
  passwordHash?: string;
  createdAt: string;
  lastLoginAt?: string;
  /** Sample person that comes with the demo conversations. Cannot sign in. */
  demo?: boolean;
  /** When this person finished or closed the welcome walkthrough shown at their first sign in */
  welcomeSeenAt?: string;
}

export interface CrmLogItem {
  at: string;
  lead: string;
  target: "webhook" | "ghl";
  ok: boolean;
  status?: number;
  note: string;
}

export interface CrmConfig {
  enabled: boolean;
  /** Any URL that accepts a JSON POST: a GoHighLevel inbound webhook, Zapier, Make, n8n */
  webhookUrl: string;
  ghl: {
    enabled: boolean;
    token?: string;
    locationId: string;
    pipelineId: string;
    /** Setter stage id to GoHighLevel pipeline stage id */
    stageMap: Record<string, string>;
    /** GoHighLevel custom field ids, found or created on first use */
    fieldIds?: Record<string, string>;
  };
  includeDemo?: boolean;
  log: CrmLogItem[];
}

export interface Intake {
  businessName: string;
  ownerName: string;
  niche: string;
  businessModel: string;
  offer: string;
  price: string;
  idealClient: string;
  notAFit: string;
  qualifyingQuestions: string[];
  breakdownMessage: string;
  goals: ConversionGoal[];
  voiceNotes: string;
  neverSay: string;
  approvedClaims: string;
  identity: "owner" | "team" | "assistant";
  /** Facts about the owner the AI may share to relate to a lead, one line at a time. */
  aboutMe?: string;
  /** Slang the owner is happy for the AI to use when the lead is that casual. Empty means none. */
  slang?: string;
  /** Messages in a chat (half of them from the lead) before the AI may move toward the offer. Default 10. */
  discoveryMessages?: number;
}

export interface PlaybookItem {
  title: string;
  detail: string;
  frequency: number;
  quotes: string[];
  response?: string;
}

export interface Playbook {
  generatedAt: string;
  engine: "claude" | "demo";
  conversationsAnalysed: number;
  messagesAnalysed: number;
  voice: { summary: string; traits: string[]; phrases: string[]; avgWordsPerBubble: number; emoji: string };
  pains: PlaybookItem[];
  desires: PlaybookItem[];
  objections: PlaybookItem[];
  questions: PlaybookItem[];
  outcomes: PlaybookItem[];
}

export interface MetaConnection {
  instagram?: { userId: string; username: string; accessToken: string; connectedAt: string; refreshedAt?: string; lastSyncAt?: string; lastWebhookAt?: string; syncError?: string; backfillAfter?: string; backfillDone?: boolean; webhookFields?: number };
  page?: { pageId: string; name: string; accessToken: string; connectedAt: string };
  datasetId?: string;
  capiToken?: string;
  capiEnabled: boolean;
  mirrorMessengerLabels: boolean;
}

export interface LabelQueueItem {
  id: string;
  conversationId: string;
  platform: Platform;
  name: string;
  handle: string | null;
  externalId: string;
  labels: string[];
  status: "pending" | "done" | "failed";
  error?: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  apiToken: string;
  onboardingComplete: boolean;
  intake: Intake;
  meta: MetaConnection;
  settings: {
    defaultAiMode: AiMode;
    autopilotMaster: boolean;
    disclosure: string;
    replyDelaySeconds: number;
    /** Replies wait as long as a person would take to read and type, with a typing indicator. */
    humanTiming?: boolean;
  };
  playbook: Playbook | null;
  /** Owner edited stages and tags. Absent means the built in set. */
  pipeline?: PipelineConfig;
  /** Signs login sessions. Never sent to the browser. */
  secret: string;
  members: Member[];
  shortcuts: Shortcut[];
  triggers: KeywordTrigger[];
  crm: CrmConfig;
  targets: { bookedPerMonth: number };
  outreach: Outreach;
  knowledge: Knowledge;
  calendar: CalendarConfig;
  /** Last word from the Chrome helper: that it is installed and linked, and which Instagram account Chrome is signed in to. */
  helper?: { seenAt: string; version: string; code?: string; account: string; outreachOn: boolean; faces?: { done: number; note: string; last: string; lastAt: number } };
  /** Welcome walkthrough seen, while sign in is off and there is no account to record it on */
  welcomeSeenAt?: string;
  sheets: SheetsConfig;
}

/** Copies leads, messages and events to Google Sheets, then clears old messages out of the database to keep it small. */
export interface SheetsConfig {
  enabled: boolean;
  /** The Apps Script web app address the owner deployed */
  url: string;
  /** Shared with the Apps Script so nobody else can write to the sheet. Never sent to the browser. */
  secret: string;
  /** Messages older than this many days are removed from the database once they are in the sheet. 0 keeps everything. */
  keepDays: number;
  /** The newest messages of every thread always stay, whatever their age, so the AI keeps its context */
  keepPerThread: number;
  /** Lead row as last sent, by conversation id, so only changed leads are sent again */
  leadHashes: Record<string, string>;
  /** Message counts per day (YYYY-MM-DD) of messages removed from the database, so insights still count them */
  tallies: Record<string, { in: number; out: number; ai: number }>;
  /** Spreadsheet files the archive has filled so far, newest last */
  files: { name: string; url: string }[];
  lastSyncAt?: string;
  lastError?: string;
  sent: number;
  pruned: number;
  lastPruneAt?: string;
}

export type KnowledgeKind = "question" | "objection";

/** Something a lead asked that the AI could not answer. It waits here until a person answers it. */
export interface KnowledgeGap {
  id: string;
  kind: KnowledgeKind;
  /** The question in general terms, so one answer serves every lead who asks it */
  question: string;
  /** The lead's own words the first time it came up */
  quote: string;
  status: "open" | "answered" | "dismissed";
  /** Every conversation it has come up in */
  conversationIds: string[];
  askedAt: string;
  lastAskedAt: string;
  answeredAt?: string;
  knowledgeId?: string;
}

/** An answer a person gave, kept so the AI can handle the same question from now on. */
export interface KnowledgeItem {
  id: string;
  kind: KnowledgeKind;
  question: string;
  answer: string;
  /** reply = taken from a message a person sent to a lead. manual = typed into the knowledge screen. */
  source: "reply" | "manual";
  /** What the person actually sent, before it was tidied into a reusable answer */
  raw?: string;
  gapId?: string;
  conversationId?: string;
  memberId?: string;
  enabled: boolean;
  /** Times the AI has used it in a reply */
  used: number;
  createdAt: string;
  updatedAt: string;
}

export interface Knowledge {
  items: KnowledgeItem[];
  gaps: KnowledgeGap[];
}

export type ProspectStatus = "queued" | "sending" | "sent" | "typed" | "unreachable" | "not_found" | "failed" | "skipped";

/** Someone on an outreach list who has not messaged the account yet. */
export interface Prospect {
  id: string;
  listId: string;
  handle: string;
  name: string;
  /** Extra columns from the import, usable in messages as {column} */
  fields: Record<string, string>;
  status: ProspectStatus;
  campaignId?: string;
  variantId?: string;
  /** The exact message that was sent */
  text?: string;
  taskId?: string;
  leaseUntil?: string;
  attempts: number;
  sentAt?: string;
  detail?: string;
  /** A one off test message from the Get connected screen. Skips campaigns, hours and pacing. */
  test?: boolean;
  testMode?: "auto" | "assisted";
  /** A reply written in the app's inbox, typed into the thread by the helper. Skips campaigns, hours and pacing. */
  reply?: { conversationId: string; messageId: string };
  addedAt: string;
}

export interface ProspectList {
  id: string;
  name: string;
  columns: string[];
  createdAt: string;
}

export interface OutreachVariant {
  id: string;
  text: string;
}

export interface OutreachCampaign {
  id: string;
  name: string;
  listIds: string[];
  variants: OutreachVariant[];
  status: "draft" | "active" | "paused";
  lastSentAt?: string;
  createdAt: string;
}

export interface OutreachSettings {
  enabled: boolean;
  /** auto = the extension presses send. assisted = it types the message and a person presses send. */
  mode: "auto" | "assisted";
  /** Instagram handle the extension must be signed in as. Blank accepts any. */
  account: string;
  dailyMin: number;
  dailyMax: number;
  hourStart: number;
  hourEnd: number;
  timezone: string;
  ramp: boolean;
  rampStart: number;
  rampStep: number;
  /** Days on which at least one message went out, used by the ramp */
  daysSent: number;
  minGapSeconds: number;
  typing: { wpmMin: number; wpmMax: number; typoRate: number; rewriteRate: number; pauseRate: number };
  paused: boolean;
  pauseReason: string;
  pausedAt?: string;
}

export interface OutreachLogItem {
  at: string;
  handle: string;
  campaign: string;
  status: string;
  detail: string;
  typedMs?: number;
  typos?: number;
}

/** A trackable ig.me link. Whoever opens a chat through it is tagged and can be greeted. */
export interface EntryLink {
  id: string;
  ref: string;
  label: string;
  opener: string;
  tags: string[];
  opened: number;
  createdAt: string;
}

/** When someone comments a keyword on a post, they get this private reply in their DMs. */
export interface CommentTrigger {
  id: string;
  name: string;
  keywords: string[];
  match: "exact" | "contains";
  reply: string;
  tags: string[];
  enabled: boolean;
  fired: number;
}

export interface Outreach {
  settings: OutreachSettings;
  lists: ProspectList[];
  prospects: Prospect[];
  campaigns: OutreachCampaign[];
  log: OutreachLogItem[];
  day: { date: string; target: number; sent: number; errors: number; nextAt: string | null };
  links: EntryLink[];
  commentTriggers: CommentTrigger[];
  /** Comment ids already answered, newest last */
  repliedComments: string[];
}

export interface Db {
  workspace: Workspace;
  conversations: Conversation[];
  messages: Message[];
  events: FunnelEvent[];
  labelQueue: LabelQueueItem[];
}
