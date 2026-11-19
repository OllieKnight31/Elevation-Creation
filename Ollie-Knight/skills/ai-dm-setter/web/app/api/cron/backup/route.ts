import { fail, json } from "@/lib/api";
import { runBackup } from "@/lib/backup";
import { databaseUrl, hostedTable } from "@/lib/hosted";

export const maxDuration = 300;

// Run once a night by Vercel Cron (vercel.json). Vercel signs the call with CRON_SECRET.
// Copies the live store into the old Neon database as a dated snapshot and keeps the newest 7.
// The answer says when the backup was taken and how many rows it holds, or that it was skipped and why.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return fail("Not allowed", 401);
  try {
    return json(await runBackup({ sourceUrl: databaseUrl(), sourceTable: hostedTable() }));
  } catch (e) {
    console.error("[setter] nightly backup failed:", (e as Error).message);
    return fail((e as Error).message, 502);
  }
}
