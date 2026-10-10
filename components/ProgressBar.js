// A slim rounded progress bar. `value` goes from 0 to 1.
// working: the bar is full and shimmers, for steps we can't measure (like "Reading your PDF…").
// warn: the bar turns orange, e.g. when the chat is nearly full.
export default function ProgressBar({ value, working = false, warn = false }) {
  return (
    <span className={`progress ${working ? "working" : ""} ${warn ? "warn" : ""}`}>
      <span style={{ width: `${Math.min(100, Math.round(value * 100))}%` }} />
    </span>
  );
}
