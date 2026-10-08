import { isRateLimited, tooManyRequests, getIp } from "@/lib/rate-limit";
import { logEvent, hashIp } from "@/lib/log";

// 👍/👎 on an answer. The requestId links it to that answer's log line, so later you can ask:
// "Which questions, models or prompts get the most 👎?"
export async function POST(request) {
  if (isRateLimited(request, "feedback", 60, 10)) return tooManyRequests();

  const { requestId, rating } = await request.json();
  if (typeof requestId !== "string" || (rating !== "up" && rating !== "down")) {
    return Response.json({ error: "Invalid feedback" }, { status: 400 });
  }

  await logEvent({ type: "feedback", requestId: requestId.slice(0, 64), rating, user: hashIp(getIp(request)) });
  return Response.json({ ok: true });
}
