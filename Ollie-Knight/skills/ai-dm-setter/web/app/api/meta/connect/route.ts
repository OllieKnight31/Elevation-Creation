import { NextResponse } from "next/server";
import { freshDb } from "@/lib/store";
import { instagramAuthUrl, metaConfigured } from "@/lib/meta";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  // back=connect returns the person to the Get connected screen once Instagram has asked them to approve.
  const back = new URL(req.url).searchParams.get("back") === "connect" ? "connect" : "settings";
  if (!metaConfigured()) return NextResponse.redirect(`${origin}/${back}?meta=not_configured`);
  const res = NextResponse.redirect(instagramAuthUrl(origin, (await freshDb()).workspace.apiToken.slice(-16)));
  res.cookies.set("setter_back", back, { httpOnly: true, sameSite: "lax", maxAge: 900, path: "/" });
  return res;
}
