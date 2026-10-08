// A simple rate limiter: at most `limit` requests per person per time window.
// We recognise a "person" by their IP address.
//
// The counts live in this server's memory. That's fine for one server and for the demo.
// With many servers (e.g. on Vercel), each has its own memory, so use a shared store
// such as Redis (for example Upstash Ratelimit) instead.
const counters = new Map(); // "chat:1.2.3.4" -> { count, windowStart }

export function getIp(request) {
  const forwarded = request.headers.get("x-forwarded-for"); // set by proxies and hosting platforms
  if (forwarded) return forwarded.split(",")[0].trim();
  return "local";
}

// Returns true if this request should be blocked.
export function isRateLimited(request, name, limit, windowMinutes) {
  const key = name + ":" + getIp(request);
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;

  let counter = counters.get(key);
  // No counter yet, or the old window is over: start a new window.
  if (!counter || now - counter.windowStart > windowMs) {
    counter = { count: 0, windowStart: now };
    counters.set(key, counter);
  }

  counter.count++;
  return counter.count > limit;
}

export function tooManyRequests() {
  return Response.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429 });
}
