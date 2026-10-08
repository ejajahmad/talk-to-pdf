// A tiny dashboard over logs/events.jsonl: usage, cost, speed, errors and 👍/👎.
// Usage: npm run stats
import { existsSync, readFileSync } from "node:fs";

if (!existsSync("logs/events.jsonl")) {
  console.log("No logs yet. Ask a few questions in the app first.");
  process.exit(0);
}

// One JSON object per line.
const events = readFileSync("logs/events.jsonl", "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line));

const uploads = events.filter((e) => e.type === "upload");
const questions = events.filter((e) => e.type === "chat");
const answered = questions.filter((e) => !e.outcome); // no "stopped" or "error"
const feedback = events.filter((e) => e.type === "feedback");

function sum(numbers) {
  let total = 0;
  for (const n of numbers) total += n;
  return total;
}
function median(numbers) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const inputTokens = sum(answered.map((e) => e.inputTokens));
const cachedTokens = sum(answered.map((e) => e.cachedTokens));
const costs = answered.map((e) => e.cost).filter((cost) => cost !== null);
const thumbsUp = feedback.filter((f) => f.rating === "up").length;
const thumbsDown = feedback.filter((f) => f.rating === "down").length;

console.log(`
Uploads             ${uploads.length}
Questions           ${questions.length} (${questions.length - answered.length} stopped or failed)
Unique users        ${new Set(questions.map((e) => e.user)).size}

Time to first word  median ${median(answered.map((e) => e.secondsToFirstWord || 0)).toFixed(1)}s
Total time          median ${median(answered.map((e) => e.totalSeconds)).toFixed(1)}s
Input tokens        ${inputTokens.toLocaleString()} (${inputTokens ? Math.round((cachedTokens / inputTokens) * 100) : 0}% cached)
Output tokens       ${sum(answered.map((e) => e.outputTokens)).toLocaleString()}
Cost                ${costs.length ? "$" + sum(costs).toFixed(4) : "fill in the prices in lib/models.js"}

Feedback            👍 ${thumbsUp}   👎 ${thumbsDown}
`);

// Bad answers are the most useful thing in the logs: look them up by requestId.
const disliked = feedback.filter((f) => f.rating === "down").map((f) => f.requestId);
if (disliked.length > 0) {
  console.log("👎 Answers to look at (search logs/events.jsonl for these ids):");
  for (const id of disliked.slice(-5)) console.log("   " + id);
  console.log();
}
