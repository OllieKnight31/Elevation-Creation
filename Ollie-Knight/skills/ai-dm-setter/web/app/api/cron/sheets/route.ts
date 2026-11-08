import { fail, json } from "@/lib/api";
import { freshDb, flushNow } from "@/lib/store";
import { sheetsDaily } from "@/lib/sheets";

export const maxDuration = 300;

// Run once a day by Vercel Cron (vercel.json). Vercel signs the call with CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return fail("Not allowed", 401);
  try {
    const r = await sheetsDaily(await freshDb());
    await flushNow();
    return json(r);
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
