// Tools the model may call while answering.
// The model never runs code itself. It only ASKS us: "please call calculate with { expression: '...' }".
// We run the function and send the result back to the model.
export const TOOLS = [
  {
    type: "function",
    name: "calculate",
    description:
      "Calculate an arithmetic expression exactly. Use it for ANY math: totals, differences, percentages, growth. " +
      "Use only numbers and + - * / ( ). No commas, no % signs, no units.",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: 'For example "(4.20 - 3.56) / 3.56 * 100"' },
      },
      required: ["expression"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "go_to_page",
    description:
      "Show a page in the PDF viewer next to the chat. Use it when the user asks to see, show or open something.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "integer", description: "Page position in the PDF file, starting at 1" },
        reason: { type: "string", description: "A short label for the user, e.g. 'Financial table'" },
      },
      required: ["page", "reason"],
      additionalProperties: false,
    },
    strict: true,
  },
];

// Runs one tool call and returns the result as text for the model.
export function runTool(name, args) {
  if (name === "calculate") {
    return calculate(args.expression);
  }
  if (name === "go_to_page") {
    // The server can't scroll the user's screen. The browser sees this tool call
    // in the stream and scrolls the viewer itself.
    return `The viewer now shows page ${args.page}.`;
  }
  return `Error: unknown tool "${name}"`;
}

function calculate(expression) {
  // Only allow digits, spaces, + - * / ( ) and the decimal point.
  // No letters means the model can't sneak in any other code.
  if (!/^[0-9+\-*/(). ]+$/.test(expression)) {
    return "Error: use only numbers and + - * / ( )";
  }
  try {
    const result = new Function(`return (${expression})`)();
    // Round away floating point noise like 0.30000000000000004
    return String(Math.round(result * 1_000_000) / 1_000_000);
  } catch {
    return "Error: that expression is not valid";
  }
}
