import OpenAI from "openai";

// One OpenAI client for the whole server. It reads OPENAI_API_KEY from .env.local.
// Only API routes import this file, so the key never reaches the browser.
// The list of models lives in lib/models.js.
export const openai = new OpenAI();
