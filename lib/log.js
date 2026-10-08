import { appendFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

// Structured logs: one JSON object per line, in logs/events.jsonl.
// Every question, upload and 👍/👎 lands here, so you can answer:
// "What does this cost? How slow is it? Do people like the answers?"  (try: npm run stats)
//
// In production, send the same objects to a log service (Datadog, Axiom, ...) or a database table.
export async function logEvent(event) {
  const line = JSON.stringify({ time: new Date().toISOString(), ...event });
  console.log(line);
  try {
    await mkdir("logs", { recursive: true });
    await appendFile("logs/events.jsonl", line + "\n");
  } catch {
    // Some hosts don't let you write files. The console.log above is enough there.
  }
}

// We store a hash of the IP, not the IP itself: enough to count users and spot abuse,
// without keeping personal data.
export function hashIp(ip) {
  return createHash("sha256").update(ip).digest("hex").slice(0, 12);
}
