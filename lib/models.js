// The models users can pick from. The server only accepts ids from this list,
// so nobody can make your API key run a model you didn't plan to pay for.
//
// Prices are in US dollars per 1 million tokens. Copy them from https://openai.com/api/pricing
// before your demo. While a price is null, the app shows token counts but no $ amount.
export const MODELS = [
  { id: "gpt-5.5", label: "GPT-5.5 (smartest)", inputPrice: null, cachedInputPrice: null, outputPrice: null },
  { id: "gpt-5-mini", label: "GPT-5 mini (fast & cheap)", inputPrice: null, cachedInputPrice: null, outputPrice: null },
];

// v7: in RAG mode, OpenAI also bills each file_search call and the index storage (see the pricing page).
// Set the price per search call (in dollars) to include searches in the cost meter.
export const FILE_SEARCH_PRICE = null;

// Find a model by id. Unknown ids get the first model on the list.
export function findModel(id) {
  const model = MODELS.find((m) => m.id === id);
  return model || MODELS[0];
}

// What one answer cost, in dollars. Returns null when the prices aren't filled in.
export function calculateCost(model, usage) {
  if (model.inputPrice === null || model.outputPrice === null) return null;

  // Cached input tokens are billed at a much lower price than normal input tokens.
  const cachedTokens = usage.input_tokens_details.cached_tokens;
  const normalTokens = usage.input_tokens - cachedTokens;
  const cachedPrice = model.cachedInputPrice ?? model.inputPrice;

  const dollars =
    normalTokens * model.inputPrice + cachedTokens * cachedPrice + usage.output_tokens * model.outputPrice;
  return dollars / 1_000_000;
}
