import OpenAI from "openai";

// One client for the whole server. Reads OPENAI_API_KEY from the environment.
// This file is only ever imported by API routes, so the key never reaches the browser.
export const openai = new OpenAI();

export const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";
