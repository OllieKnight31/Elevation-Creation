// A stand-in for api.calendly.com, used by build-videos.mjs so the walkthrough can show real looking free times
// without anyone's calendar. Same rules as the real API: bearer token, at most 7 days per request, start in the future.
// Weekdays, 9am to 5pm London time, every 30 minutes, lunch hour kept free.
import http from "node:http";

const USER = "https://api.calendly.com/users/U1";
const TYPES = [{ uri: "https://api.calendly.com/event_types/E1", name: "Strategy Call", duration: 30, scheduling_url: "https://calendly.com/yourbrand/strategy-call", active: true }];
const part = (d, o) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...o }).format(d);

export function startCalendly(port, token = "demo-token") {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { title: "Unauthenticated", message: "The access token is invalid" });
    if (u.pathname === "/users/me") return send(200, { resource: { uri: USER, name: "Your Name", scheduling_url: "https://calendly.com/yourbrand", timezone: "Europe/London" } });
    if (u.pathname === "/event_types") return send(200, { collection: TYPES });
    if (u.pathname === "/scheduled_events") return send(200, { collection: [] });
    if (u.pathname === "/event_type_available_times") {
      const s = new Date(u.searchParams.get("start_time")), e = new Date(u.searchParams.get("end_time"));
      if (s < new Date()) return send(400, { message: "start_time must be in the future" });
      if (e - s > 7 * 864e5 + 1000) return send(400, { message: "Date range can be no greater than 1 week" });
      const out = [];
      for (const t = new Date(Math.ceil(s.getTime() / 18e5) * 18e5); t < e; t.setTime(t.getTime() + 18e5)) {
        const h = Number(part(t, { hour: "2-digit", hourCycle: "h23" }));
        if (/Sat|Sun/.test(part(t, { weekday: "short" })) || h < 9 || h >= 17 || h === 12) continue;
        const iso = t.toISOString();
        out.push({ status: "available", start_time: iso, invitees_remaining: 1, scheduling_url: `${TYPES[0].scheduling_url}/${iso.replace(".000Z", "+00:00")}?month=${iso.slice(0, 7)}&date=${iso.slice(0, 10)}` });
      }
      return send(200, { collection: out });
    }
    send(404, { message: "Not found" });
  });
  server.listen(port);
  return server;
}
