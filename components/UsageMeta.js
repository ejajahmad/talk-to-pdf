import Icon from "./Icon";

// Formats a dollar amount: tiny amounts get more decimals, e.g. $0.0042
export function formatDollars(amount) {
  if (amount < 0.01) return "$" + amount.toFixed(4);
  return "$" + amount.toFixed(3);
}

// One small line under each answer: which model, how many tokens, how fast, how much.
export default function UsageMeta({ usage }) {
  const cachedPercent = Math.round((usage.cachedTokens / usage.inputTokens) * 100);

  return (
    <div className="usage">
      <span>
        {usage.model}
        {usage.mode === "rag" && <b> · RAG</b>}
      </span>
      <span title="Input tokens: instructions + PDF + chat history + question">
        {usage.inputTokens.toLocaleString()} in
        {usage.cachedTokens > 0 && <b className="cached"> ({cachedPercent}% cached)</b>}
      </span>
      <span title="Output tokens, including the model's hidden reasoning">
        {usage.outputTokens.toLocaleString()} out
        {usage.reasoningTokens > 0 && ` (${usage.reasoningTokens.toLocaleString()} reasoning)`}
      </span>
      {usage.secondsToFirstWord !== null && (
        <span title="Time to first word">
          <Icon name="zap" size={12} /> {usage.secondsToFirstWord.toFixed(1)}s
        </span>
      )}
      <span title="Total time">
        <Icon name="clock" size={12} /> {usage.totalSeconds.toFixed(1)}s
      </span>
      {usage.cost !== null && <span>{formatDollars(usage.cost)}</span>}
    </div>
  );
}
