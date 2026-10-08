// Checks on everything the browser sends to /api/chat.
// Never trust the browser: a user can send anything, even fake "assistant" messages.
export const LIMITS = {
  maxMessages: 20, // about 10 questions per chat. The whole chat is re-sent every time, so cost grows.
  maxQuestionLength: 2000, // characters
  maxChatLength: 60000, // characters in the whole chat
};

// Returns an error message for the user, or null if everything is fine.
export function checkMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "No messages";
  }
  if (messages.length > LIMITS.maxMessages) {
    return "This chat has reached its limit. Start a new chat to keep going.";
  }

  let totalLength = 0;
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") return "Invalid message";
    if (typeof message.content !== "string") return "Invalid message";
    totalLength += message.content.length;
  }

  const question = messages[messages.length - 1];
  if (question.role !== "user" || question.content.trim() === "") {
    return "Please type a question";
  }
  if (question.content.length > LIMITS.maxQuestionLength) {
    return `Questions can be up to ${LIMITS.maxQuestionLength} characters.`;
  }
  if (totalLength > LIMITS.maxChatLength) {
    return "This chat is too long. Start a new chat to keep going.";
  }
  return null;
}

// Turns an error from OpenAI into a message that is safe and useful to show users.
export function friendlyError(error) {
  if (error.status === 429) return "The AI service is busy right now. Try again in a few seconds.";
  if (error.status >= 500) return "The AI service had a problem. Try again.";
  return "Something went wrong. Try again.";
}
