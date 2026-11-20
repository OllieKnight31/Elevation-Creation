#!/usr/bin/env node
// ad-verdict-skill data puller — no deps, node 18+
// Usage: node pull-meta-ads.js --client example [--since 2026-07-02 --until 2026-07-05] [--outdir /path]
const fs = require('fs');
const path = require('path');

const args = {};
process.argv.slice(2).forEach((a, i, arr) => { if (a.startsWith('--')) args[a.slice(2)] = arr[i + 1]; });
if (!args.client) { console.error('Usage: node pull-meta-ads.js --client <slug> [--since YYYY-MM-DD --until YYYY-MM-DD] [--outdir dir]'); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'clients', `${args.client}.json`), 'utf8'));
const envFile = fs.readFileSync(cfg.token_source.file, 'utf8');
const m = envFile.match(new RegExp(`${cfg.token_source.var}=(.*)`));
if (!m) { console.error(`Token var ${cfg.token_source.var} not found in ${cfg.token_source.file}`); process.exit(1); }
const TOKEN = m[1].trim();
const V = cfg.api_version || 'v26.0';
const OUT = args.outdir || process.cwd();

async function get(p, params = {}) {
  const qs = new URLSearchParams({ access_token: TOKEN, ...params });
  const res = await fetch(`https://graph.facebook.com/${V}/${p}?${qs}`);
  const j = await res.json();
  if (j.error) { console.error('API ERR', p, JSON.stringify(j.error).slice(0, 300)); return null; }
  return j;
}
const conv = a => (a.actions || []).find(x => x.action_type === cfg.conversion_event);
const cpa = a => (a.cost_per_action_type || []).find(x => x.action_type === cfg.conversion_event);
const lpv = a => (a.actions || []).find(x => x.action_type === 'landing_page_view');

(async () => {
  const camps = await get(`${cfg.act_id}/campaigns`, { fields: 'id,name,status,effective_status,objective,daily_budget,created_time,start_time', limit: '100' });
  console.log('=== ALL CAMPAIGNS ===');
  camps.data.forEach(c => console.log(`${c.effective_status.padEnd(22)} ${c.id} ${c.name}`));
  const active = camps.data.filter(c => c.effective_status === 'ACTIVE');
  console.log(`\n=== ACTIVE: ${active.length} ===`);

  const dump = { config: { client: args.client, ...cfg, token_source: '<redacted>' }, campaigns: camps.data, active: [] };

  for (const c of active) {
    const since = args.since || (c.start_time || c.created_time).slice(0, 10);
    const until = args.until || new Date().toISOString().slice(0, 10);
    const tr = JSON.stringify({ since, until });
    const entry = { campaign: c, since, until };

    const sets = await get(`${c.id}/adsets`, { fields: 'id,name,effective_status,daily_budget,optimization_goal,learning_stage_info', limit: '100' });
    entry.adsets = sets ? sets.data : [];
    for (const s of entry.adsets) {
      const ads = await get(`${s.id}/ads`, { fields: 'id,name,effective_status', limit: '100' });
      s.ads = ads ? ads.data : [];
    }

    const FIELDS = 'adset_name,adset_id,ad_name,ad_id,spend,impressions,reach,frequency,cpm,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,actions,cost_per_action_type,video_play_actions,video_thruplay_watched_actions,video_p50_watched_actions,video_p100_watched_actions,video_avg_time_watched_actions';
    const life = await get(`${c.id}/insights`, { level: 'ad', fields: FIELDS, time_range: tr, limit: '200' });
    entry.lifetime = life ? life.data : [];
    const daily = await get(`${c.id}/insights`, { level: 'ad', fields: 'ad_name,ad_id,spend,inline_link_click_ctr,actions,frequency', time_increment: '1', time_range: tr, limit: '1000' });
    entry.daily = daily ? daily.data : [];
    const tot = await get(`${c.id}/insights`, { fields: 'spend,impressions,cpm,inline_link_click_ctr,actions,cost_per_action_type,frequency,reach', time_range: tr });
    entry.totals = tot ? tot.data : [];
    dump.active.push(entry);

    // ---- human summary ----
    console.log(`\n### ${c.name} (${since} → ${until})`);
    const t = entry.totals[0];
    if (t) {
      const r = conv(t), cl = cpa(t), l = lpv(t);
      console.log(`TOTALS: spend ${t.spend} | conv ${r ? r.value : 0} | CPL ${cl ? (+cl.value).toFixed(2) : '—'} (target ${cfg.target_cpl}, breakeven ${cfg.breakeven_cpl}) | LPV→conv ${l && r ? (r.value / l.value * 100).toFixed(1) + '%' : '—'} | freq ${(+t.frequency).toFixed(2)}`);
    }
    for (const a of entry.lifetime) {
      const imp = +a.impressions || 0, plays = +(a.video_play_actions?.[0]?.value || 0), thru = +(a.video_thruplay_watched_actions?.[0]?.value || 0);
      const r = conv(a), cl = cpa(a), l = lpv(a);
      const set = entry.adsets.find(s => s.id === a.adset_id);
      console.log([
        (set && set.effective_status !== 'ACTIVE' ? '[PAUSED] ' : '') + a.adset_name,
        `budget ${set ? (set.daily_budget / 100).toFixed(2) + '/d' : '?'}`,
        `spend ${a.spend}`, `conv ${r ? r.value : 0}`, `CPL ${cl ? (+cl.value).toFixed(2) : '—'}`,
        `linkCTR ${(+a.inline_link_click_ctr || 0).toFixed(2)}%`, `cpc ${(+a.cost_per_inline_link_click || 0).toFixed(2)}`,
        `cpm ${(+a.cpm).toFixed(2)}`, `freq ${(+a.frequency).toFixed(2)}`, `LPV ${l ? l.value : 0}`,
        `hook ${imp ? (plays / imp * 100).toFixed(0) : 0}%`, `hold ${plays ? (thru / plays * 100).toFixed(1) : 0}%`
      ].join(' | '));
    }
    // daily trend per ad
    const by = {};
    for (const r of entry.daily) { const cv = conv(r); (by[r.ad_name] ||= []).push({ d: r.date_start, s: +r.spend, c: cv ? +cv.value : 0 }); }
    console.log('--- daily trend (spend/conv → CPL) ---');
    for (const [n, rows] of Object.entries(by)) {
      rows.sort((x, y) => x.d.localeCompare(y.d));
      console.log(n.padEnd(42), rows.map(r => `${r.d.slice(5)}: ${r.s.toFixed(0)}/${r.c} (${r.c ? (r.s / r.c).toFixed(1) : '—'})`).join('  '));
    }
  }
  const out = path.join(OUT, `ad-verdict-${args.client}-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(out, JSON.stringify(dump, null, 2));
  console.log('\nRaw dump →', out);
})();
