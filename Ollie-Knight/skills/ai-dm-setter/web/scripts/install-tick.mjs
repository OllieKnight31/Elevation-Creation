// Sets up the once a minute clock for Autopilot inside the database (Supabase: pg_cron calls the app through pg_net).
// Usage: node scripts/install-tick.mjs <env file with SUPA_POSTGRES_URL_NON_POOLING> <site address> <file holding TICK_SECRET>
//        add --remove to take the timer out again.
import pg from "pg";
import { readFileSync } from "node:fs";

const [envFile, site, secretFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const remove = process.argv.includes("--remove");
if (!envFile || (!remove && (!site || !secretFile))) { console.error("Usage: node scripts/install-tick.mjs <env file> <site address> <secret file> [--remove]"); process.exit(1); }
const env = readFileSync(envFile, "utf8");
const raw = (env.match(/^SUPA_POSTGRES_URL_NON_POOLING="?([^"\n]+)"?/m) || [])[1];
if (!raw) { console.error("SUPA_POSTGRES_URL_NON_POOLING is not in that file."); process.exit(1); }
const c = new pg.Client({ connectionString: raw.split("?")[0], ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("create extension if not exists pg_cron");
  await c.query("create extension if not exists pg_net");
  await c.query("select cron.unschedule(jobid) from cron.job where jobname = 'setter-tick'");
  if (remove) console.log("Timer removed.");
  else {
    const secret = readFileSync(secretFile, "utf8").trim();
    const url = site.replace(/\/+$/, "") + "/api/cron/tick";
    const headers = JSON.stringify({ Authorization: "Bearer " + secret });
    // $1 style parameters are not allowed inside the stored command, so the two values are quoted by the server.
    const cmd = (await c.query("select format('select net.http_get(url := %L, headers := %L::jsonb, timeout_milliseconds := 20000)', $1::text, $2::text) as cmd", [url, headers])).rows[0].cmd;
    await c.query("select cron.schedule('setter-tick', '* * * * *', $1)", [cmd]);
    // Keep the timer's own history small.
    await c.query("select cron.unschedule(jobid) from cron.job where jobname = 'setter-tick-tidy'");
    await c.query("select cron.schedule('setter-tick-tidy', '17 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '2 days'; delete from net._http_response where created < now() - interval '1 day'$$)");
    console.log("Timer installed: " + url + " every minute.");
  }
  console.log((await c.query("select jobname, schedule, active from cron.job order by jobname")).rows);
} finally { await c.end(); }
