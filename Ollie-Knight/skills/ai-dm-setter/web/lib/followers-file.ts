/**
 * Reads the followers file from Instagram's own "Download your information" export
 * (connections/followers_and_following/followers_1.json, or the .html version) into handles, newest follower first.
 * Runs in the browser, so only the handles leave the owner's computer.
 */
const HANDLE = /^[a-z0-9._]{1,30}$/;
const RESERVED = new Set(["accounts", "explore", "reels", "direct", "p", "stories", "about", "legal", "privacy", "_u"]);

function fromLink(link: string) {
  const m = link.match(/instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/);
  return m ? m[1].toLowerCase() : "";
}

function clean(raw: unknown) {
  const s = String(raw ?? "").trim();
  const h = (s.includes("instagram.com") ? fromLink(s) : s.replace(/^@/, "").toLowerCase());
  return HANDLE.test(h) && !RESERVED.has(h) ? h : "";
}

export function followersFromFile(text: string): string[] {
  const found = new Map<string, number>();
  const add = (h: string, at: number) => { if (h && (!found.has(h) || at > found.get(h)!)) found.set(h, at); };
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { /* the .html version, read below */ }
  if (data !== null) {
    // Entries look like { title, string_list_data: [{ href, value, timestamp }] }. Newer exports leave value out and
    // put the handle in title. They sit in a bare array or under a key such as relationships_followers.
    const walk = (v: unknown) => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (!v || typeof v !== "object") return;
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.string_list_data)) {
        for (const e of o.string_list_data as Record<string, unknown>[]) add(clean(e?.value) || clean(e?.href) || clean(o.title), Number(e?.timestamp) || 0);
        return;
      }
      Object.values(o).forEach(walk);
    };
    walk(data);
  } else {
    let i = 0;
    for (const m of text.matchAll(/href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"/g)) add(clean(m[1]), -i++);
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}
