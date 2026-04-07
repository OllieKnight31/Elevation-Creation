/**
 * Property Labs Webinar Funnel Tracker — Vercel Serverless API v3
 * Production endpoint for dashboard data + webhook receiver + sheet writes + API sync
 *
 * Endpoints:
 *   GET /?action=ping              — health check
 *   GET /?action=dashboard_data    — live session data from Google Sheet
 *   GET /?action=funnel_summary    — aggregated funnel metrics
 *   GET /?action=test_connections  — connection status for all sources
 *   GET /?action=sync_webinarjam   — pull registrants/attendees from WJ API → Sheet
 *   GET /?action=sync_meta         — pull ad data from Meta Graph API → Sheet
 *   POST /?source=webinarjam       — WebinarJam webhook receiver (writes to sheet)
 *   POST /?source=calendly         — Calendly webhook receiver (writes to sheet)
 *   POST /?source=meta             — Meta ads data receiver (writes to sheet)
 *   POST /?source=manual           — Manual data entry (writes to sheet)
 */

const DEMO_MODE = process.env.DEMO_MODE === 'true';

let google, sheetsClient = null;
if (!DEMO_MODE) {
  google = require('googleapis').google;
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || 'PENDING';
const SHEET_URL_BASE = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`;

// ── Tab name constants ───────────────────────────────────────────────────────
const TAB_FUNNEL_FLOW = 'FUNNEL FLOW';
const TAB_WEBINAR_SESSIONS = 'WEBINAR SESSIONS';
const TAB_AD_METRICS = 'AD METRICS';
const TAB_DATA_SOURCES = 'DATA SOURCES';
const TAB_CAMPAIGNS = 'CAMPAIGNS';
const TAB_UTM = 'UTM ATTRIBUTION';

// ── Offer tiers (GBP) ───────────────────────────────────────────────────────
const OFFER_TIERS = {
  course: 500,
  course_finance: 1000,
  group: 3000,
  one_to_one: 5000,
};

// ── Demo data generator ──────────────────────────────────────────────────────
function getDemoDashboardData() {
  const sessions = [];
  const baseDate = new Date('2025-10-01');
  for (let i = 0; i < 24; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + (i * 7));
    const dateStr = d.toISOString().split('T')[0];
    const weekNum = i + 1;
    const growthFactor = 1 + (i * 0.04);
    const spend = Math.floor((1800 + Math.random() * 1200) * growthFactor);
    const impressions = Math.floor((45000 + Math.random() * 25000) * growthFactor);
    const clicks = Math.floor((1200 + Math.random() * 600) * growthFactor);
    const lpviews = Math.floor(clicks * (0.75 + Math.random() * 0.1));
    const regs = Math.floor((280 + Math.random() * 180) * growthFactor);
    const attendees = Math.floor(regs * (0.32 + Math.random() * 0.12));
    const stayToPitch = Math.floor(attendees * (0.58 + Math.random() * 0.15));
    const ctaClicks = Math.floor(stayToPitch * (0.25 + Math.random() * 0.15));
    const callsBooked = Math.floor(ctaClicks * (0.45 + Math.random() * 0.2));
    const callsShowed = Math.floor(callsBooked * (0.6 + Math.random() * 0.15));
    const buyers = Math.floor(callsShowed * (0.28 + Math.random() * 0.12));
    const dealSize = [OFFER_TIERS.course, OFFER_TIERS.course_finance, OFFER_TIERS.group, OFFER_TIERS.one_to_one][Math.floor(Math.random() * 4)];
    const revenue = buyers * dealSize;
    const courseBuyers = Math.floor(buyers * 0.4);
    const courseFinBuyers = Math.floor(buyers * 0.25);
    const groupBuyers = Math.floor(buyers * 0.2);
    const oneToOneBuyers = buyers - courseBuyers - courseFinBuyers - groupBuyers;
    sessions.push({
      date: dateStr,
      name: `Week ${weekNum} — Property Masterclass`,
      spend, impressions, clicks, lpviews,
      regs, smsOptins: Math.floor(regs * 0.6), attendees, stayToPitch, ctaClicks,
      callsBooked, callsShowed, buyers, revenue,
      watchTime: 35 + Math.floor(Math.random() * 25),
      tiers: { course: courseBuyers, course_finance: courseFinBuyers, group: groupBuyers, one_to_one: oneToOneBuyers },
    });
  }
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    source: 'demo_mode',
    sessions,
    all_sessions_count: sessions.length,
    active_campaign: {
      name: 'Property Masterclass — Q1 2026',
      start: '2025-10-01',
      end: '2026-04-01',
      webinar_date: '2026-03-22',
      active: true,
    },
    campaigns: [{
      name: 'Property Masterclass — Q1 2026',
      start: '2025-10-01',
      end: '2026-04-01',
      webinar_date: '2026-03-22',
      active: true,
    }],
    utmBreakdown: {
      facebook: { regs: 3850, attendees: 1260, revenue: 285000 },
      instagram: { regs: 1420, attendees: 485, revenue: 118000 },
      google: { regs: 680, attendees: 230, revenue: 62000 },
      organic: { regs: 920, attendees: 340, revenue: 78000 },
      tiktok: { regs: 410, attendees: 125, revenue: 32000 },
    },
  };
}

function getDemoFunnelSummary() {
  const data = getDemoDashboardData();
  const agg = data.sessions.reduce((a, s) => {
    a.regs += s.regs; a.attendees += s.attendees; a.stayToPitch += s.stayToPitch;
    a.ctaClicks += s.ctaClicks; a.callsBooked += s.callsBooked;
    a.callsShowed += s.callsShowed; a.buyers += s.buyers;
    a.spend += s.spend; a.revenue += s.revenue;
    return a;
  }, { regs:0, attendees:0, stayToPitch:0, ctaClicks:0, callsBooked:0, callsShowed:0, buyers:0, spend:0, revenue:0 });
  return {
    status: 'ok', timestamp: new Date().toISOString(), sessionCount: data.sessions.length,
    stages: { registrations: agg.regs, attendees: agg.attendees, stayToPitch: agg.stayToPitch, ctaClicks: agg.ctaClicks, callsBooked: agg.callsBooked, callsShowed: agg.callsShowed, buyers: agg.buyers },
    totals: { spend: agg.spend, revenue: agg.revenue },
    rates: {
      showRate: agg.regs ? +(agg.attendees / agg.regs).toFixed(3) : 0,
      stayRate: agg.attendees ? +(agg.stayToPitch / agg.attendees).toFixed(3) : 0,
      bookRate: agg.attendees ? +(agg.callsBooked / agg.attendees).toFixed(3) : 0,
      callShowRate: agg.callsBooked ? +(agg.callsShowed / agg.callsBooked).toFixed(3) : 0,
      closeRate: agg.callsShowed ? +(agg.buyers / agg.callsShowed).toFixed(3) : 0,
      roas: agg.spend ? +(agg.revenue / agg.spend).toFixed(2) : 0,
    },
  };
}

// ── Google Sheets API (write-enabled via Service Account or OAuth2) ───────────
function getSheetsClient() {
  if (DEMO_MODE) return null;
  if (sheetsClient) return sheetsClient;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) return null;
  try {
    const credentials = JSON.parse(key);
    let auth;
    if (credentials.type === 'authorized_user') {
      // OAuth2 user credentials (refresh token flow)
      const oauth2 = new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret
      );
      oauth2.setCredentials({ refresh_token: credentials.refresh_token });
      auth = oauth2;
    } else {
      // Service account credentials
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (err) {
    console.error('[API] Failed to init Sheets client:', err.message);
    return null;
  }
}

// ── Sheet write helper ────────────────────────────────────────────────────────
async function appendToSheet(sheetName, values) {
  const sheets = getSheetsClient();
  if (!sheets) {
    console.warn('[API] No Sheets client — GOOGLE_SERVICE_ACCOUNT_KEY not set');
    return { written: false, reason: 'no_credentials' };
  }
  try {
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
    return { written: true, updatedRows: result.data.updates?.updatedRows || 0 };
  } catch (err) {
    console.error('[API] Sheet write error:', err.message);
    return { written: false, reason: err.message };
  }
}

async function updateSheetRange(sheetName, range, values) {
  const sheets = getSheetsClient();
  if (!sheets) return { written: false, reason: 'no_credentials' };
  try {
    const result = await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!${range}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    return { written: true, updatedCells: result.data.updatedCells || 0 };
  } catch (err) {
    console.error('[API] Sheet update error:', err.message);
    return { written: false, reason: err.message };
  }
}

// ── Sheet read helper (via Sheets API, supports private sheets) ─────────────
async function readSheetRange(sheetName, range) {
  const sheets = getSheetsClient();
  if (!sheets) return null;
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!${range}`,
    });
    return result.data.values || [];
  } catch (err) {
    console.error('[API] Sheet read error:', err.message);
    return null;
  }
}

// ── FUNNEL FLOW upsert: find row by date, update specific cols or append ────
// FUNNEL FLOW columns (A=0 to AB=27):
//  A:Date  B:Name  C:Status  D:Impressions  E:Clicks  F:LP Views  G:LP Conv%
//  H:Unique Regs  I:Total Regs  J:Reg Rate  K:SMS Sent  L:SMS Opt-ins
//  M:SMS Rate  N:Emails Sent  O:Email Opens  P:Attendees  Q:Show-up%
//  R:Peak Viewers  S:Stay to Pitch  T:Stay%  U:CTA Clicks  V:CTA Rate
//  W:Calls Booked  X:Calls Showed  Y:Call Show%  Z:Buyers  AA:Spend  AB:Revenue
const FUNNEL_FLOW_DATA_START_ROW = 5; // Row 5 is first data row (1-indexed)

async function upsertFunnelFlowRow(dateStr, updates) {
  // updates is an object like { 8: 42, 15: 16 } where key=column index (0-based), value=new value
  const existing = await readSheetRange(TAB_FUNNEL_FLOW, `A${FUNNEL_FLOW_DATA_START_ROW}:AB54`);
  if (!existing) {
    console.warn('[API] Could not read FUNNEL FLOW tab');
    return { written: false, reason: 'read_failed' };
  }

  // Normalise the target date for comparison
  const targetDate = dateStr.split(' ')[0]; // Handle "2026-03-11 19:00" format

  // Find existing row matching this date
  let rowIndex = -1;
  for (let i = 0; i < existing.length; i++) {
    const cellDate = (existing[i][0] || '').toString().split(' ')[0];
    if (cellDate === targetDate) {
      rowIndex = i;
      break;
    }
  }

  if (rowIndex >= 0) {
    // Update existing row — merge updates into current values
    const row = existing[rowIndex];
    // Extend row to 28 columns if shorter
    while (row.length < 28) row.push('');
    for (const [colIdx, value] of Object.entries(updates)) {
      row[parseInt(colIdx)] = value;
    }
    const sheetRow = FUNNEL_FLOW_DATA_START_ROW + rowIndex;
    return await updateSheetRange(TAB_FUNNEL_FLOW, `A${sheetRow}:AB${sheetRow}`, [row]);
  } else {
    // Append new row
    const newRow = new Array(28).fill('');
    newRow[0] = targetDate;
    for (const [colIdx, value] of Object.entries(updates)) {
      newRow[parseInt(colIdx)] = value;
    }
    return await appendToSheet(TAB_FUNNEL_FLOW, [newRow]);
  }
}

// ── WEBINAR SESSIONS upsert: find row by date, update or append ─────────────
const WS_DATA_START_ROW = 3; // Row 3 is first data row (after headers in B2)

async function upsertWebinarSessionRow(dateStr, sessionData) {
  const existing = await readSheetRange(TAB_WEBINAR_SESSIONS, `B${WS_DATA_START_ROW}:N52`);
  if (!existing) return { written: false, reason: 'read_failed' };

  const targetDate = dateStr.split(' ')[0];
  let rowIndex = -1;
  for (let i = 0; i < existing.length; i++) {
    const cellDate = (existing[i][0] || '').toString().split(' ')[0];
    if (cellDate === targetDate) {
      rowIndex = i;
      break;
    }
  }

  if (rowIndex >= 0) {
    const sheetRow = WS_DATA_START_ROW + rowIndex;
    return await updateSheetRange(TAB_WEBINAR_SESSIONS, `B${sheetRow}:N${sheetRow}`, [sessionData]);
  } else {
    return await appendToSheet(TAB_WEBINAR_SESSIONS, [sessionData]);
  }
}

// ── AD METRICS dedup: clear old sync data, write fresh ──────────────────────
async function replaceAdMetrics(rows) {
  const sheets = getSheetsClient();
  if (!sheets) return { written: false, reason: 'no_credentials' };

  try {
    // Clear existing data rows (keep headers in row 1-2)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${TAB_AD_METRICS}'!A3:H200`,
    });
    // Write fresh data
    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${TAB_AD_METRICS}'!A3`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      });
    }
    return { written: true, rowCount: rows.length };
  } catch (err) {
    console.error('[API] AD METRICS replace error:', err.message);
    return { written: false, reason: err.message };
  }
}

// ── CORS headers applied to every response ───────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
}

// ── Fetch one sheet tab as a parsed gviz JSON table ─────────────────────────
async function fetchSheetRange(sheetName, range) {
  const url = `${SHEET_URL_BASE}?tqx=out:json&range=${encodeURIComponent(range)}&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status}`);
  const text = await response.text();
  // Strip Google Visualization wrapper — handle multiple formats
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);?\s*$/);
  let jsonStr;
  if (match) {
    jsonStr = match[1];
  } else {
    jsonStr = text.replace(/^\/\*[\s\S]*?\*\/\s*/, '').replace(/^google\.visualization\.Query\.setResponse\(/, '').replace(/\);?\s*$/, '');
  }
  return JSON.parse(jsonStr);
}

// ── Parse a gviz row into a value array ─────────────────────────────────────
function parseRow(row) {
  return (row.c || []).map(cell => (cell && cell.v != null) ? cell.v : null);
}

// ── Normalise a date value from gviz ────────────────────────────────────────
function normaliseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith('Date(')) {
    const parts = s.replace('Date(', '').replace(')', '').split(',');
    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]) + 1;
    const d = parseInt(parts[2]);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m}-${d}`;
  }
  return s;
}

// ── Map a FUNNEL FLOW row (cols 0-27, A-AB) to a session object ──────────────
function rowToSession(cols) {
  const num = i => { const v = cols[i]; return v != null ? parseFloat(v) || 0 : 0; };
  const str = i => cols[i] != null ? String(cols[i]) : '';
  const date = normaliseDate(cols[0]);
  if (!date) return null;
  return {
    date,
    name:         str(1) || 'Webinar Session',
    impressions:  num(3),
    clicks:       num(4),
    lpviews:      num(5),
    regs:         num(8),
    smsOptins:    num(11),
    attendees:    num(15),
    stayToPitch:  num(18),
    ctaClicks:    num(20),
    callsBooked:  num(22),
    callsShowed:  num(23),
    buyers:       num(25),
    spend:        num(26),
    revenue:      num(27),
    watchTime:    0,
    tiers: { course: 0, course_finance: 0, group: 0, one_to_one: 0 },
  };
}

// ── Build sessions from FUNNEL FLOW + enrich with watch time ─────────────────
async function buildSessions() {
  const [funnelGviz, sessGviz] = await Promise.all([
    fetchSheetRange(TAB_FUNNEL_FLOW, 'A5:AB54'),
    fetchSheetRange(TAB_WEBINAR_SESSIONS, 'B3:N52').catch(() => null),
  ]);

  const watchMap = {};
  if (sessGviz && sessGviz.table) {
    for (const row of sessGviz.table.rows || []) {
      const cols = parseRow(row);
      const d = normaliseDate(cols[0]);
      const wt = cols[11] != null ? parseFloat(cols[11]) : 0;
      if (d && wt) watchMap[d] = wt;
    }
  }

  const sessions = [];
  for (const row of (funnelGviz.table || {}).rows || []) {
    const cols = parseRow(row);
    const session = rowToSession(cols);
    if (!session) continue;
    if (watchMap[session.date]) session.watchTime = watchMap[session.date];
    sessions.push(session);
  }

  return sessions;
}

// ── ACTION: test_connections ──────────────────────────────────────────────────
async function testConnections() {
  const hasCredentials = !!getSheetsClient();
  const TARGET_EVENT_SLUG = process.env.CALENDLY_EVENT_SLUG || 'strategy-call';

  // Check DATA SOURCES tab for recent webhook events (via Sheets API for reliability)
  let metaEvents = 0, wjEvents = 0, calEvents = 0;
  let metaLast = null, wjLast = null, calLast = null;

  try {
    const rows = await readSheetRange(TAB_DATA_SOURCES, 'A1:D200');
    if (rows) {
      for (const cols of rows) {
        const source = cols[1] ? String(cols[1]).toLowerCase() : '';
        const ts = cols[0] ? String(cols[0]) : null;
        // Only count rows that look like event logs (ISO timestamps)
        if (!ts || !ts.includes('T')) continue;

        if (source.includes('meta')) {
          metaEvents++;
          if (!metaLast || ts > metaLast) metaLast = ts;
        }
        if (source.includes('webinar')) {
          wjEvents++;
          if (!wjLast || ts > wjLast) wjLast = ts;
        }
        if (source.includes('calendly')) {
          calEvents++;
          if (!calLast || ts > calLast) calLast = ts;
        }
      }
    }
  } catch (err) {
    console.log('[API] Could not read DATA SOURCES tab:', err.message);
  }

  // Validate Meta token by making a lightweight API call
  let metaTokenValid = false;
  let metaTokenNote = null;
  const metaToken = process.env.META_ACCESS_TOKEN;
  if (metaToken) {
    try {
      const resp = await fetch(`https://graph.facebook.com/v25.0/me?access_token=${metaToken}`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await resp.json();
      if (data.error) {
        metaTokenValid = false;
        metaTokenNote = `Token expired or invalid: ${data.error.message}`;
      } else {
        metaTokenValid = true;
      }
    } catch (e) {
      metaTokenNote = 'Could not validate token: ' + e.message;
    }
  }

  // Validate WebinarJam API key
  let wjKeyValid = false;
  const wjKey = process.env.WEBINARJAM_API_KEY;
  if (wjKey) {
    try {
      const body = new URLSearchParams({ api_key: wjKey, webinar_id: process.env.WEBINARJAM_WEBINAR_ID || '2' });
      const resp = await fetch('https://api.webinarjam.com/webinarjam/webinar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(5000),
      });
      const data = await resp.json();
      wjKeyValid = data.status === 'success';
    } catch (e) {
      // Key set but can't validate
    }
  }

  // Validate Calendly webhook via API
  let calWebhookActive = false;
  const calPat = process.env.CALENDLY_PAT;
  if (calPat) {
    try {
      const meResp = await fetch('https://api.calendly.com/users/me', {
        headers: { Authorization: `Bearer ${calPat}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      const meData = await meResp.json();
      const orgUri = meData.resource?.current_organization;
      if (orgUri) {
        const whResp = await fetch(`https://api.calendly.com/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&scope=organization`, {
          headers: { Authorization: `Bearer ${calPat}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        const whData = await whResp.json();
        calWebhookActive = (whData.collection || []).some(
          wh => wh.callback_url?.includes('terry-dwobeng-webinar-tracker') && wh.state === 'active'
        );
      }
    } catch (e) {
      // PAT set but can't validate
    }
  }

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    sheet_writes: hasCredentials ? 'enabled' : 'pending_credentials',
    meta: {
      connected: metaTokenValid,
      access_token_set: !!metaToken,
      token_valid: metaTokenValid,
      events_received: metaEvents,
      last_event: metaLast,
      note: !metaToken
        ? 'No META_ACCESS_TOKEN set. Generate token with ads_read permission from Meta Business Manager.'
        : metaTokenValid
          ? (metaEvents > 0 ? null : 'Token valid. Use /api?action=sync_meta to pull data.')
          : metaTokenNote || 'Token is expired. Generate a new token from Meta Business Manager.',
    },
    webinarjam: {
      connected: wjKeyValid || wjEvents > 0,
      api_key_set: !!wjKey,
      api_key_valid: wjKeyValid,
      events_received: wjEvents,
      last_event: wjLast,
      note: !wjKey
        ? 'No WEBINARJAM_API_KEY set.'
        : wjKeyValid
          ? null
          : 'API key set but could not validate. Check the key.',
    },
    calendly: {
      connected: calWebhookActive || calEvents > 0,
      webhook_active: calWebhookActive,
      events_received: calEvents,
      last_event: calLast,
      note: calWebhookActive
        ? (calEvents > 0 ? null : `Webhook active. Waiting for first booking on ${TARGET_EVENT_SLUG}.`)
        : 'No CALENDLY_PAT set. Add token to verify webhook status.',
    },
    utm: {
      connected: true,
      note: 'UTM tracking is deployed on funnel pages. Data populates when ads run with UTM parameters.',
    },
  };
}

// ── WebinarJam API helpers ──────────────────────────────────────────────────
const WJ_API_BASE = 'https://api.webinarjam.com/webinarjam';

async function wjApiCall(endpoint, params = {}) {
  const apiKey = process.env.WEBINARJAM_API_KEY;
  if (!apiKey) throw new Error('WEBINARJAM_API_KEY not set');

  const body = new URLSearchParams({ api_key: apiKey, ...params });
  const resp = await fetch(`${WJ_API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`WJ API ${endpoint} returned ${resp.status}`);
  return resp.json();
}

// ── ACTION: sync_webinarjam — pull data from WJ API into Google Sheet ──────
async function syncWebinarJam() {
  const webinarId = process.env.WEBINARJAM_WEBINAR_ID || '2';
  const results = { webinar: null, schedules: [], registrants: 0, attendees: 0, errors: [] };

  try {
    // 1. Get webinar details (includes schedule IDs)
    const webinarResp = await wjApiCall('webinar', { webinar_id: webinarId });
    if (webinarResp.status !== 'success') {
      results.errors.push('Failed to fetch webinar details: ' + JSON.stringify(webinarResp));
      return results;
    }
    const webinar = webinarResp.webinar || {};
    results.webinar = { name: webinar.name, id: webinar.webinar_id };
    const schedules = webinar.schedules || [];
    results.schedules = schedules.map(s => ({ schedule: s.schedule, date: s.date, comment: s.comment }));

    // 2. For each schedule, fetch registrants
    const allRegistrants = [];
    for (const sched of schedules) {
      try {
        const regResp = await wjApiCall('registrants', {
          webinar_id: webinarId,
          schedule: sched.schedule,
        });
        if (regResp.status === 'success' && Array.isArray(regResp.registrants)) {
          for (const reg of regResp.registrants) {
            allRegistrants.push({
              schedule: sched.schedule,
              scheduleDate: sched.date || '',
              firstName: reg.first_name || '',
              lastName: reg.last_name || '',
              email: reg.email || '',
              phone: reg.phone || '',
              country: reg.country || '',
              attended: reg.attended || 0,
              timeInRoom: reg.time_in_room || 0,
              registeredAt: reg.date || '',
            });
          }
        }
      } catch (schedErr) {
        results.errors.push(`Schedule ${sched.schedule}: ${schedErr.message}`);
      }
    }

    results.registrants = allRegistrants.length;
    results.attendees = allRegistrants.filter(r => r.attended > 0).length;

    // 3. Write to Google Sheet — log to DATA SOURCES + update FUNNEL FLOW + WEBINAR SESSIONS
    const ts = new Date().toISOString();
    await appendToSheet(TAB_DATA_SOURCES, [[ts, 'WebinarJam API', 'sync', `Fetched ${allRegistrants.length} registrants, ${results.attendees} attendees across ${schedules.length} schedules`]]);

    // Aggregate per schedule and write to both FUNNEL FLOW and WEBINAR SESSIONS (with dedup)
    for (const sched of schedules) {
      const schedRegs = allRegistrants.filter(r => r.schedule === sched.schedule);
      const schedAttendees = schedRegs.filter(r => r.attended > 0);
      const avgWatchTime = schedAttendees.length > 0
        ? Math.round(schedAttendees.reduce((sum, r) => sum + (r.timeInRoom || 0), 0) / schedAttendees.length)
        : 0;
      const stayedLong = schedAttendees.filter(r => r.timeInRoom >= 30).length;

      // Normalise schedule date to YYYY-MM-DD
      const schedDate = (sched.date || ts.split('T')[0]).split(' ')[0];
      // Convert "2026-03-11" format if it's in a different format
      let normDate = schedDate;
      if (/^\d{4}-\d{2}-\d{2}$/.test(schedDate)) {
        normDate = schedDate;
      } else {
        // Try to parse other date formats
        const d = new Date(schedDate);
        if (!isNaN(d)) normDate = d.toISOString().split('T')[0];
      }

      // ── Update FUNNEL FLOW tab (the master tab the dashboard reads) ──
      const funnelUpdates = {
        1: results.webinar.name || 'Webinar Session',  // B: Name
        8: schedRegs.length,        // I: Total Registrations
        15: schedAttendees.length,  // P: Attendees
        18: stayedLong,             // S: Stay to Pitch (proxy: stayed 30+ min)
      };
      // Only write non-zero values to avoid overwriting manually entered data
      if (schedRegs.length > 0 || schedAttendees.length > 0) {
        const fResult = await upsertFunnelFlowRow(normDate, funnelUpdates);
        console.log(`[WJ Sync] FUNNEL FLOW upsert for ${normDate}:`, fResult);
      }

      // ── Update WEBINAR SESSIONS tab (detail tab) ──
      const sessionRow = [
        normDate,                              // Date
        results.webinar.name || 'Webinar',     // Session Name
        schedRegs.length,                      // Registrations
        schedAttendees.length,                 // Attendees
        schedRegs.length > 0 ? (schedAttendees.length / schedRegs.length * 100).toFixed(1) + '%' : '0%',
        '',                                    // Peak Live Viewers
        stayedLong,                            // Stayed 30+ min
        '',                                    // Stayed to Pitch
        '',                                    // CTA Clicks
        '',                                    // Polls Answered
        '',                                    // Questions Asked
        avgWatchTime,                          // Avg Watch Time (min)
        '',                                    // Replay Views
      ];
      const wsResult = await upsertWebinarSessionRow(normDate, sessionRow);
      console.log(`[WJ Sync] WEBINAR SESSIONS upsert for ${normDate}:`, wsResult);
    }

    results.status = 'ok';
    results.timestamp = ts;
    results.message = `Synced ${results.registrants} registrants and ${results.attendees} attendees from ${schedules.length} schedules`;

  } catch (err) {
    results.errors.push(err.message);
    results.status = 'error';
  }

  return results;
}

// ── ACTION: sync_meta — pull ad data from Meta Graph API → Sheet ────────────
async function syncMeta() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID || 'PENDING';

  if (!accessToken) {
    return { status: 'error', message: 'META_ACCESS_TOKEN not set. Generate a token with ads_read permission from Meta Business Manager.' };
  }

  const ts = new Date().toISOString();
  const today = ts.split('T')[0];
  // Fetch last 30 days of campaign data
  const since = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  try {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'campaign_name,spend,impressions,clicks,ctr,actions,cost_per_action_type',
      time_range: JSON.stringify({ since, until: today }),
      level: 'campaign',
      limit: '100',
    });

    const resp = await fetch(
      `https://graph.facebook.com/v25.0/${adAccountId}/insights?${params}`,
    );
    const data = await resp.json();

    if (data.error) {
      return { status: 'error', message: `Meta API error: ${data.error.message}` };
    }

    const campaigns = (data.data || []).map(row => {
      const actions = row.actions || [];
      const costPerAction = row.cost_per_action_type || [];
      const leads = actions.find(a => a.action_type === 'offsite_conversion.fb_pixel_complete_registration')?.value || 0;
      const cpr = costPerAction.find(a => a.action_type === 'offsite_conversion.fb_pixel_complete_registration')?.value || 0;

      return {
        date: since + ' to ' + today,
        campaign_name: row.campaign_name || '',
        spend: parseFloat(row.spend) || 0,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        ctr: parseFloat(row.ctr) || 0,
        leads: parseInt(leads) || 0,
        cpr: parseFloat(cpr) || 0,
      };
    });

    // Aggregate totals across all campaigns
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalLeads = campaigns.reduce((s, c) => s + c.leads, 0);

    // Write to AD METRICS sheet (replace, not append — prevents duplicates)
    if (campaigns.length > 0) {
      const rows = campaigns.map(c => [
        c.date, c.campaign_name, c.spend, c.impressions, c.clicks, c.ctr, c.cpr, c.leads,
      ]);
      await replaceAdMetrics(rows);
    }

    // Update FUNNEL FLOW tab with aggregated ad data for the most recent webinar session
    // Find the latest session date in FUNNEL FLOW and update its ad metrics
    try {
      const existing = await readSheetRange(TAB_FUNNEL_FLOW, `A${FUNNEL_FLOW_DATA_START_ROW}:AB54`);
      if (existing && existing.length > 0) {
        // Update the latest session row with ad metrics
        const lastRow = existing.length - 1;
        const sheetRow = FUNNEL_FLOW_DATA_START_ROW + lastRow;
        const row = existing[lastRow];
        while (row.length < 28) row.push('');
        row[3] = totalImpressions;  // D: Impressions
        row[4] = totalClicks;       // E: Clicks
        row[26] = totalSpend;       // AA: Ad Spend
        await updateSheetRange(TAB_FUNNEL_FLOW, `A${sheetRow}:AB${sheetRow}`, [row]);
        console.log(`[Meta Sync] Updated FUNNEL FLOW row ${sheetRow} with ad metrics`);
      }
    } catch (e) {
      console.log('[Meta Sync] Could not update FUNNEL FLOW:', e.message);
    }

    // Log to DATA SOURCES
    await appendToSheet(TAB_DATA_SOURCES, [[ts, 'Meta API', 'sync', `Fetched ${campaigns.length} campaigns, total spend: \u00a3${totalSpend.toFixed(2)}`]]);

    return {
      status: 'ok',
      timestamp: ts,
      campaigns_fetched: campaigns.length,
      total_spend: totalSpend.toFixed(2),
      total_leads: totalLeads,
      date_range: { since, until: today },
    };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

// ── CAMPAIGNS MANAGEMENT ──────────────────────────────────────────────────────
const CAMPAIGNS_HEADERS = ['Campaign Name', 'Start Date', 'End Date', 'Webinar Date', 'Active', 'Created', 'Notes'];

// ── UTM ATTRIBUTION tab ─────────────────────────────────────────────────────
const UTM_HEADERS = ['Timestamp', 'Email', 'Funnel Source', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Content', 'UTM Term', 'Page', 'FBCLID', 'GCLID'];

async function ensureUTMTab() {
  const sheets = getSheetsClient();
  if (!sheets) return;
  try {
    await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${TAB_UTM}'!A1:A1` });
  } catch (e) {
    if (e.message && e.message.includes('Unable to parse range')) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { requests: [{ addSheet: { properties: { title: TAB_UTM, gridProperties: { rowCount: 1000, columnCount: 11 } } } }] }
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${TAB_UTM}'!A1:K1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [UTM_HEADERS] }
        });
      } catch (e2) { console.warn('[API] Failed to create UTM tab:', e2.message); }
    }
  }
}

async function handleUTMAttribution(body) {
  await ensureUTMTab();
  const row = [
    new Date().toISOString(),
    body.email || '',
    body.funnel_source || '',
    body.utm_source || '',
    body.utm_medium || '',
    body.utm_campaign || '',
    body.utm_content || '',
    body.utm_term || '',
    body.page || '',
    body.fbclid || '',
    body.gclid || '',
  ];
  await appendToSheet(TAB_UTM, [row]);
  return { status: 'ok', action: 'utm_tracked', source: body.funnel_source || 'unknown' };
}

async function getUTMBreakdown(startDate, endDate) {
  const rows = await readSheetRange(TAB_UTM, 'A2:K1000');
  if (!rows || !rows.length) return { by_source: {}, by_campaign: {}, by_medium: {}, total_registrations: 0 };

  // Optional date filtering (column A = timestamp ISO string)
  const start = startDate ? new Date(startDate + 'T00:00:00') : null;
  const end = endDate ? new Date(endDate + 'T23:59:59') : null;

  const bySource = {};
  const byCampaign = {};
  const byMedium = {};
  let total = 0;

  rows.forEach(r => {
    // Filter by campaign window if dates provided
    if (start && end) {
      const ts = new Date(r[0]);
      if (ts < start || ts > end) return;
    }

    const funnelSource = r[2] || 'direct';
    const utmSource = r[3] || '';
    const utmMedium = r[4] || '';
    const utmCampaign = r[5] || '';

    // Count by funnel source (organic vs paid) — primary breakdown
    bySource[funnelSource] = (bySource[funnelSource] || 0) + 1;

    // Count by UTM medium (facebook, instagram, google, etc.)
    if (utmMedium) {
      byMedium[utmMedium] = (byMedium[utmMedium] || 0) + 1;
    }

    // Count by campaign
    if (utmCampaign) {
      if (!byCampaign[utmCampaign]) byCampaign[utmCampaign] = { registrations: 0, spend: 0, cost_per_reg: 0 };
      byCampaign[utmCampaign].registrations += 1;
    }

    total++;
  });

  return { by_source: bySource, by_campaign: byCampaign, by_medium: byMedium, total_registrations: total };
}

async function ensureCampaignsTab() {
  const sheets = getSheetsClient();
  if (!sheets) return false;
  try {
    // Check if tab exists by trying to read it
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${TAB_CAMPAIGNS}'!A1:A1`,
    });
    return true; // Tab exists
  } catch (err) {
    if (err.message.includes('Unable to parse range') || err.code === 400) {
      // Tab doesn't exist — create it
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{ addSheet: { properties: { title: TAB_CAMPAIGNS, gridProperties: { rowCount: 50, columnCount: 7 } } } }]
          }
        });
        // Write headers
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${TAB_CAMPAIGNS}'!A1:G1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [CAMPAIGNS_HEADERS]
          }
        });
        console.log('[API] Created CAMPAIGNS tab with headers');
        return true;
      } catch (createErr) {
        console.error('[API] Failed to create CAMPAIGNS tab:', createErr.message);
        return false;
      }
    }
    console.error('[API] CAMPAIGNS tab check error:', err.message);
    return false;
  }
}

async function getCampaigns() {
  const tabReady = await ensureCampaignsTab();
  console.log('[API] CAMPAIGNS tab ready:', tabReady);
  const rows = await readSheetRange(TAB_CAMPAIGNS, 'A2:G50');
  console.log('[API] CAMPAIGNS rows:', rows ? rows.length : 'null', rows ? JSON.stringify(rows[0]) : 'n/a');
  if (!rows || !rows.length) return { campaigns: [], active_index: -1 };

  const campaigns = [];
  let activeIndex = -1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || String(r[0]).trim() === '') continue;
    const campaign = {
      index: i,
      name: r[0] || '',
      start: r[1] || '',
      end: r[2] || '',
      webinar_date: r[3] || '',
      active: String(r[4] || '').toUpperCase() === 'TRUE',
      created: r[5] || '',
      notes: r[6] || '',
    };
    if (campaign.active) activeIndex = campaigns.length;
    campaigns.push(campaign);
  }

  return { campaigns, active_index: activeIndex };
}

async function handleCampaignUpdate(body) {
  const sheets = getSheetsClient();
  if (!sheets) return { status: 'error', message: 'No Sheets credentials' };
  await ensureCampaignsTab();

  const action = body.action || '';

  if (action === 'create') {
    const { name, start, end, webinar_date, notes } = body;
    if (!name || !start || !end) return { status: 'error', message: 'name, start, end are required' };

    // First, clear any existing active flags
    const existing = await readSheetRange(TAB_CAMPAIGNS, 'A2:G50');
    if (existing) {
      for (let i = 0; i < existing.length; i++) {
        if (String(existing[i][4] || '').toUpperCase() === 'TRUE') {
          existing[i][4] = '';
        }
      }
      if (existing.length > 0) {
        await updateSheetRange(TAB_CAMPAIGNS, `A2:G${existing.length + 1}`, existing);
      }
    }

    // Append new campaign as active
    const newRow = [name, start, end, webinar_date || '', 'TRUE', new Date().toISOString().split('T')[0], notes || ''];
    await appendToSheet(TAB_CAMPAIGNS, [newRow]);

    return { status: 'ok', action: 'created', campaign: { name, start, end, webinar_date, active: true } };
  }

  if (action === 'activate') {
    const targetIndex = parseInt(body.index);
    if (isNaN(targetIndex)) return { status: 'error', message: 'index is required' };

    const existing = await readSheetRange(TAB_CAMPAIGNS, 'A2:G50');
    if (!existing) return { status: 'error', message: 'No campaigns found' };

    // Clear all active flags, set the target one
    for (let i = 0; i < existing.length; i++) {
      while (existing[i].length < 7) existing[i].push('');
      existing[i][4] = (i === targetIndex) ? 'TRUE' : '';
    }
    await updateSheetRange(TAB_CAMPAIGNS, `A2:G${existing.length + 1}`, existing);

    return { status: 'ok', action: 'activated', index: targetIndex, name: existing[targetIndex]?.[0] || '' };
  }

  if (action === 'activate_all') {
    // Deactivate all — means "All Time" mode
    const existing = await readSheetRange(TAB_CAMPAIGNS, 'A2:G50');
    if (existing) {
      for (let i = 0; i < existing.length; i++) {
        while (existing[i].length < 7) existing[i].push('');
        existing[i][4] = '';
      }
      await updateSheetRange(TAB_CAMPAIGNS, `A2:G${existing.length + 1}`, existing);
    }
    return { status: 'ok', action: 'all_time_mode' };
  }

  if (action === 'update') {
    const targetIndex = parseInt(body.index);
    if (isNaN(targetIndex)) return { status: 'error', message: 'index is required' };

    const existing = await readSheetRange(TAB_CAMPAIGNS, 'A2:G50');
    if (!existing || targetIndex >= existing.length) return { status: 'error', message: 'Invalid index' };

    // Update only the fields provided
    if (body.name !== undefined) existing[targetIndex][0] = body.name;
    if (body.start !== undefined) existing[targetIndex][1] = body.start;
    if (body.end !== undefined) existing[targetIndex][2] = body.end;
    if (body.webinar_date !== undefined) existing[targetIndex][3] = body.webinar_date;
    if (body.notes !== undefined) { while (existing[targetIndex].length < 7) existing[targetIndex].push(''); existing[targetIndex][6] = body.notes; }

    await updateSheetRange(TAB_CAMPAIGNS, `A2:G${existing.length + 1}`, existing);
    return { status: 'ok', action: 'updated', index: targetIndex, name: existing[targetIndex][0] };
  }

  if (action === 'delete') {
    const targetIndex = parseInt(body.index);
    if (isNaN(targetIndex)) return { status: 'error', message: 'index is required' };

    const existing = await readSheetRange(TAB_CAMPAIGNS, 'A2:G50');
    if (!existing || targetIndex >= existing.length) return { status: 'error', message: 'Invalid index' };

    existing.splice(targetIndex, 1);
    // Clear and rewrite
    const clearRange = `A2:G50`;
    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `'${TAB_CAMPAIGNS}'!${clearRange}` });
    if (existing.length > 0) {
      await updateSheetRange(TAB_CAMPAIGNS, `A2:G${existing.length + 1}`, existing);
    }
    return { status: 'ok', action: 'deleted', index: targetIndex };
  }

  return { status: 'error', message: 'Unknown action. Use create|activate|activate_all|delete' };
}

// ── ACTION: dashboard_data (with campaign filtering) ─────────────────────────
async function getDashboardData(query = {}) {
  const allSessions = await buildSessions();

  // Get active campaign for filtering
  let activeCampaign = null;
  let campaigns = [];
  try {
    const campData = await getCampaigns();
    campaigns = campData.campaigns;
    if (campData.active_index >= 0) {
      activeCampaign = campaigns[campData.active_index];
    }
  } catch (e) {
    console.log('[API] Could not load campaigns:', e.message);
  }

  // Allow query param override: ?campaign_start=...&campaign_end=...
  const filterStart = query.campaign_start || activeCampaign?.start || null;
  const filterEnd = query.campaign_end || activeCampaign?.end || null;

  let sessions = allSessions;
  if (filterStart && filterEnd) {
    const start = new Date(filterStart + 'T00:00:00');
    const end = new Date(filterEnd + 'T23:59:59');
    sessions = allSessions.filter(s => {
      const d = new Date(s.date + 'T00:00:00');
      return d >= start && d <= end;
    });
  }

  return {
    status:       'ok',
    timestamp:    new Date().toISOString(),
    source:       'vercel_serverless',
    spreadsheet:  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
    sessions,
    all_sessions_count: allSessions.length,
    active_campaign: activeCampaign || null,
    campaigns,
    utmBreakdown: await getUTMBreakdown(filterStart, filterEnd),
  };
}

// ── ACTION: funnel_summary ───────────────────────────────────────────────────
async function getFunnelSummary() {
  const sessions = await buildSessions();
  const agg = sessions.reduce((a, s) => {
    a.regs       += s.regs;
    a.attendees  += s.attendees;
    a.stayToPitch+= s.stayToPitch;
    a.ctaClicks  += s.ctaClicks;
    a.callsBooked+= s.callsBooked;
    a.callsShowed+= s.callsShowed;
    a.buyers     += s.buyers;
    a.spend      += s.spend;
    a.revenue    += s.revenue;
    return a;
  }, { regs:0, attendees:0, stayToPitch:0, ctaClicks:0, callsBooked:0, callsShowed:0, buyers:0, spend:0, revenue:0 });

  return {
    status:       'ok',
    timestamp:    new Date().toISOString(),
    sessionCount: sessions.length,
    stages: {
      registrations: agg.regs,
      attendees:     agg.attendees,
      stayToPitch:   agg.stayToPitch,
      ctaClicks:     agg.ctaClicks,
      callsBooked:   agg.callsBooked,
      callsShowed:   agg.callsShowed,
      buyers:        agg.buyers,
    },
    totals: { spend: agg.spend, revenue: agg.revenue },
    rates: {
      showRate:    agg.regs  ? +(agg.attendees  / agg.regs).toFixed(3)   : 0,
      stayRate:    agg.attendees  ? +(agg.stayToPitch / agg.attendees).toFixed(3)  : 0,
      bookRate:    agg.attendees  ? +(agg.callsBooked / agg.attendees).toFixed(3)  : 0,
      callShowRate:agg.callsBooked? +(agg.callsShowed / agg.callsBooked).toFixed(3): 0,
      closeRate:   agg.callsShowed? +(agg.buyers / agg.callsShowed).toFixed(3)     : 0,
      roas:        agg.spend ? +(agg.revenue / agg.spend).toFixed(2) : 0,
    },
  };
}

// ── Webhook handlers (write to sheet) ─────────────────────────────────────────

async function handleWebinarJam(body) {
  const event = body.event || body.action || 'unknown';
  const data = body.data || body;
  const ts = new Date().toISOString();

  // Log to DATA SOURCES tab
  const logRow = [ts, 'WebinarJam', event, JSON.stringify(data).slice(0, 500)];
  await appendToSheet(TAB_DATA_SOURCES, [logRow]);

  // Handle specific events
  if (event === 'registrant_registered' || data.email) {
    const name = data.first_name || data.name || '';
    const email = data.email || '';
    const phone = data.phone || '';
    const country = data.country || '';

    // We could increment registration count, but the sheet formulas handle this
    // Just log the registration for attribution tracking
    console.log(`[WJ] Registration: ${name} <${email}>`);
  }

  if (event === 'registrant_attended' || event === 'live_attended') {
    console.log(`[WJ] Attendance: ${data.email || 'unknown'}`);
  }

  return {
    status: 'received',
    source: 'webinarjam',
    event,
    timestamp: ts,
    sheet_write: getSheetsClient() ? 'logged' : 'pending_credentials',
  };
}

async function handleCalendly(body) {
  const event = body.event || 'unknown';
  const payload = body.payload || body;
  const ts = new Date().toISOString();

  // Target event type for webinar funnel strategy sessions
  const TARGET_EVENT_SLUG = process.env.CALENDLY_EVENT_SLUG || 'strategy-call';

  // Extract event type info from the payload
  const eventType = payload.event_type || {};
  const scheduledEvent = payload.scheduled_event || {};
  const eventTypeSlug = eventType.slug || scheduledEvent.event_type?.slug || '';
  const eventTypeName = eventType.name || scheduledEvent.name || '';
  const isWebinarFunnel = eventTypeSlug === TARGET_EVENT_SLUG ||
    eventTypeName.toLowerCase().includes('strategy') ||
    (scheduledEvent.uri || '').includes(TARGET_EVENT_SLUG);

  // Log to DATA SOURCES tab
  const logRow = [ts, 'Calendly', event, JSON.stringify(payload).slice(0, 500)];
  await appendToSheet(TAB_DATA_SOURCES, [logRow]);

  if (event === 'invitee.created' && isWebinarFunnel) {
    const invitee = payload.invitee || payload;
    const name = invitee.name || '';
    const email = invitee.email || '';
    console.log(`[Calendly] Call booked: ${name} <${email}> | Event: ${eventTypeName || eventTypeSlug} | Webinar funnel: ${isWebinarFunnel}`);

    // Increment "Calls Booked" (col W=22) in the latest FUNNEL FLOW row
    try {
      const existing = await readSheetRange(TAB_FUNNEL_FLOW, `A${FUNNEL_FLOW_DATA_START_ROW}:AB54`);
      if (existing && existing.length > 0) {
        const lastRow = existing.length - 1;
        const sheetRow = FUNNEL_FLOW_DATA_START_ROW + lastRow;
        const row = existing[lastRow];
        while (row.length < 28) row.push('');
        const currentBooked = parseInt(row[22]) || 0;
        row[22] = currentBooked + 1; // W: Calls Booked +1
        await updateSheetRange(TAB_FUNNEL_FLOW, `A${sheetRow}:AB${sheetRow}`, [row]);
        console.log(`[Calendly] Incremented calls booked to ${currentBooked + 1} in FUNNEL FLOW row ${sheetRow}`);
      }
    } catch (e) {
      console.log('[Calendly] Could not update FUNNEL FLOW:', e.message);
    }
  }

  if (event === 'invitee.created' && !isWebinarFunnel) {
    const invitee = payload.invitee || payload;
    console.log(`[Calendly] Non-funnel call booked: ${invitee.name || ''} <${invitee.email || ''}> | Event: ${eventTypeName || eventTypeSlug}`);
  }

  if (event === 'invitee.canceled') {
    const invitee = payload.invitee || payload;
    console.log(`[Calendly] Call canceled: ${invitee.email || 'unknown'} | Event: ${eventTypeName || eventTypeSlug}`);

    // Decrement "Calls Booked" if this was a webinar funnel event
    if (isWebinarFunnel) {
      try {
        const existing = await readSheetRange(TAB_FUNNEL_FLOW, `A${FUNNEL_FLOW_DATA_START_ROW}:AB54`);
        if (existing && existing.length > 0) {
          const lastRow = existing.length - 1;
          const sheetRow = FUNNEL_FLOW_DATA_START_ROW + lastRow;
          const row = existing[lastRow];
          while (row.length < 28) row.push('');
          const currentBooked = parseInt(row[22]) || 0;
          row[22] = Math.max(0, currentBooked - 1); // W: Calls Booked -1
          await updateSheetRange(TAB_FUNNEL_FLOW, `A${sheetRow}:AB${sheetRow}`, [row]);
          console.log(`[Calendly] Decremented calls booked to ${Math.max(0, currentBooked - 1)} in FUNNEL FLOW row ${sheetRow}`);
        }
      } catch (e) {
        console.log('[Calendly] Could not update FUNNEL FLOW:', e.message);
      }
    }
  }

  return {
    status: 'received',
    source: 'calendly',
    event,
    event_type: eventTypeName || eventTypeSlug || 'unknown',
    is_webinar_funnel: isWebinarFunnel,
    timestamp: ts,
    sheet_write: getSheetsClient() ? 'logged' : 'pending_credentials',
  };
}

async function handleMeta(body) {
  const ts = new Date().toISOString();

  // Log to DATA SOURCES tab
  const logRow = [ts, 'Meta Ads', 'sync', JSON.stringify(body).slice(0, 500)];
  await appendToSheet(TAB_DATA_SOURCES, [logRow]);

  // If body contains campaign data, write to AD METRICS
  if (body.campaigns && Array.isArray(body.campaigns)) {
    const rows = body.campaigns.map(c => [
      c.date || ts.split('T')[0],
      c.campaign_name || '',
      c.spend || 0,
      c.impressions || 0,
      c.clicks || 0,
      c.ctr || 0,
      c.cpr || 0,
      c.leads || 0,
    ]);
    await appendToSheet(TAB_AD_METRICS, rows);
    console.log(`[Meta] Wrote ${rows.length} campaign rows`);
  }

  return {
    status: 'received',
    source: 'meta',
    timestamp: ts,
    sheet_write: getSheetsClient() ? 'logged' : 'pending_credentials',
  };
}

async function handleRegistration(body) {
  const ts = new Date().toISOString();
  const ghlKey = process.env.GHL_API_KEY;
  const ghlLocationId = process.env.GHL_LOCATION_ID || 'hQmTEm5KyP9EkhgO8iXx';

  // Log to DATA SOURCES
  const logRow = [ts, 'Registration', 'new_lead', JSON.stringify(body).slice(0, 500)];
  await appendToSheet(TAB_DATA_SOURCES, [logRow]);

  // Create contact in GHL if API key is set
  let ghlResult = 'no_api_key';
  if (ghlKey) {
    try {
      const ghlRes = await fetch('https://services.leadconnectorhq.com/contacts/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ghlKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify({
          firstName: body.firstName || '',
          email: body.email || '',
          phone: body.phone || undefined,
          locationId: ghlLocationId,
          tags: ['webinar-registered'],
          source: body.source || 'paid',
          customFields: [
            { key: 'utm_source', field_value: body.utm_source || '' },
            { key: 'utm_medium', field_value: body.utm_medium || '' },
            { key: 'utm_campaign', field_value: body.utm_campaign || '' },
            { key: 'utm_content', field_value: body.utm_content || '' },
          ],
        }),
      });
      const ghlData = await ghlRes.json();
      ghlResult = ghlData.contact ? 'created' : 'failed';
      console.log(`[Registration] GHL contact: ${ghlResult} for ${body.email}`);
    } catch (e) {
      ghlResult = 'error: ' + e.message;
      console.error('[Registration] GHL error:', e.message);
    }
  }

  return {
    status: 'received',
    source: 'registration',
    ghl_contact: ghlResult,
    timestamp: ts,
    sheet_write: getSheetsClient() ? 'logged' : 'pending_credentials',
  };
}

async function handleManual(body) {
  const ts = new Date().toISOString();

  // Log the manual entry
  const logRow = [ts, 'Manual', 'data_entry', JSON.stringify(body).slice(0, 500)];
  await appendToSheet(TAB_DATA_SOURCES, [logRow]);

  return {
    status: 'received',
    source: 'manual',
    timestamp: ts,
    sheet_write: getSheetsClient() ? 'logged' : 'pending_credentials',
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  setCors(res);

  // Preflight
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query.action || '').toLowerCase();
  const source = (req.query.source || '').toLowerCase();

  try {
    // ── POST: webhook receiver ──────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body || {};

      if (source === 'webinarjam') {
        const result = await handleWebinarJam(body);
        return res.status(200).json(result);
      }

      if (source === 'calendly') {
        const result = await handleCalendly(body);
        return res.status(200).json(result);
      }

      if (source === 'meta') {
        const result = await handleMeta(body);
        return res.status(200).json(result);
      }

      if (source === 'manual') {
        const result = await handleManual(body);
        return res.status(200).json(result);
      }

      if (source === 'campaign_update') {
        const result = await handleCampaignUpdate(body);
        return res.status(200).json(result);
      }

      if (source === 'utm') {
        const result = await handleUTMAttribution(body);
        return res.status(200).json(result);
      }

      if (source === 'registration') {
        const result = await handleRegistration(body);
        return res.status(200).json(result);
      }

      // Unknown source
      return res.status(200).json({
        status: 'received',
        source: source || 'unknown',
        timestamp: new Date().toISOString(),
        note: 'Unrecognized source. Use ?source=webinarjam|calendly|meta|manual|campaign_update|utm',
      });
    }

    // ── GET endpoints ───────────────────────────────────────────────────────
    if (action === 'ping' || action === '') {
      const hasCredentials = DEMO_MODE || !!getSheetsClient();
      return res.status(200).json({
        status:         'ok',
        service:        'Property Labs Webinar Tracker API',
        version:        '2.0.0',
        spreadsheet_id: SPREADSHEET_ID,
        timestamp:      new Date().toISOString(),
        sheet_writes:   hasCredentials ? 'enabled' : 'pending_credentials',
        offer_tiers:    OFFER_TIERS,
        currency:       'GBP',
        endpoints: {
          ping:             '/api?action=ping',
          dashboard_data:   '/api?action=dashboard_data',
          funnel_summary:   '/api?action=funnel_summary',
          campaigns:        '/api?action=campaigns',
          test_connections: '/api?action=test_connections',
          sync_webinarjam:  '/api?action=sync_webinarjam',
          sync_meta:        '/api?action=sync_meta',
          webinarjam_hook:  'POST /api?source=webinarjam',
          calendly_hook:    'POST /api?source=calendly',
          meta_hook:        'POST /api?source=meta',
          manual_hook:      'POST /api?source=manual',
          campaign_update:  'POST /api?source=campaign_update',
          utm_hook:         'POST /api?source=utm',
        },
      });
    }

    if (action === 'campaigns') {
      const data = await getCampaigns();
      return res.status(200).json({ status: 'ok', ...data });
    }

    if (action === 'dashboard_data') {
      if (DEMO_MODE) return res.status(200).json(getDemoDashboardData());
      const data = await getDashboardData(req.query);
      return res.status(200).json(data);
    }

    if (action === 'funnel_summary') {
      if (DEMO_MODE) return res.status(200).json(getDemoFunnelSummary());
      const data = await getFunnelSummary();
      return res.status(200).json(data);
    }

    if (action === 'test_connections') {
      if (DEMO_MODE) return res.status(200).json({ status: 'ok', demo_mode: true, google_sheets: { connected: true }, webinarjam: { connected: true }, calendly: { connected: true }, meta: { connected: true } });
      const data = await testConnections();
      return res.status(200).json(data);
    }

    if (action === 'sync_webinarjam') {
      const data = await syncWebinarJam();
      return res.status(200).json(data);
    }

    if (action === 'sync_meta') {
      const data = await syncMeta();
      return res.status(200).json(data);
    }

    return res.status(400).json({ status: 'error', message: `Unknown action: "${action}"` });

  } catch (err) {
    console.error('[API Error]', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
