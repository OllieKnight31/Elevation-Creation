// Runs once before the server takes requests: decides whether data lives in the local file or in Supabase.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initStore } = await import("./lib/store");
  const s = await initStore();
  console.log(`[setter] storage: ${s.mode}${s.error ? ` (${s.error})` : ""}`);
}
