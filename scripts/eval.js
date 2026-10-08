// EVALS: automatic tests for the AI.
// We ask a fixed list of questions (evals/cases.json) through the REAL pipeline (same prompt,
// same tools, same agent loop as the app) and check every answer automatically.
// Run it after every prompt or model change, to see what got better and what broke.
//
//   npm run eval                           all cases with the default model
//   npm run eval -- --model gpt-5-mini     try another model
//   npm run eval -- --only injection       only cases whose id contains "injection"
//   npm run eval -- --mode rag             v7: search the PDF (RAG) instead of sending all of it
//   npm run eval -- --big --mode rag       v7: also run the 200-page book cases (~110k tokens each in full mode!)
//
// Each case in evals/cases.json can check:
//   mustInclude      the answer contains ALL of these strings
//   mustIncludeAny   the answer contains AT LEAST ONE of these strings
//   mustNotInclude   the answer contains NONE of these strings
//   cites            the answer cites at least one of these pages, e.g. (p. 2)
//   mustNotCite      the answer cites none of these pages
//   refuses          the answer says the information isn't in the document
//   tool             the model called this tool (and, optionally, with these arguments)
//   judge            a second AI call grades the answer against this rubric ("LLM as judge")
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { toFile } from "openai";
import { openai } from "../lib/openai.js";
import { runAgent } from "../lib/agent.js";
import { findModel } from "../lib/models.js";
import { readPageTexts } from "../lib/pdf-text.js";
import { createIndex } from "../lib/rag.js";

// ---- Read the command line options ----
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
const model = findModel(option("--model"));
const only = option("--only");
const mode = option("--mode") === "rag" ? "rag" : "full";
const big = args.includes("--big");

let cases = JSON.parse(readFileSync("evals/cases.json", "utf8"));
if (only) cases = cases.filter((c) => c.id.includes(only));
// The big-book cases are expensive in full mode, so they only run with --big (or --only).
if (!big && !only) cases = cases.filter((c) => !c.big);

// ---- Helpers for the checks ----
function contains(text, snippet) {
  return text.toLowerCase().includes(snippet.toLowerCase());
}

// All the pages an answer cites, e.g. "(p. 2) ... (p. 4)" -> [2, 4]
function citedPages(text) {
  const pages = [];
  for (const match of text.matchAll(/\(p\. ?(\d+)\)/g)) {
    pages.push(Number(match[1]));
  }
  return pages;
}

// Ways a model says "that's not in the document".
const REFUSAL =
  /couldn['’]t find|could not find|not (mentioned|stated|included|specified|in the document)|does(n['’]t| not) (say|mention|contain|include|specify|name)|no information/i;

// LLM as judge: a second model call decides if the answer meets a rubric.
// We use structured outputs so the verdict is always { pass, reason }.
async function judge(rubric, question, answer) {
  const response = await openai.responses.create({
    model: model.id,
    instructions: "You grade answers from a PDF Q&A assistant. Decide strictly whether the answer meets the rubric.",
    input: `Rubric:\n${rubric}\n\nQuestion:\n${question}\n\nAnswer:\n${answer}`,
    text: {
      format: {
        type: "json_schema",
        name: "grade",
        strict: true,
        schema: {
          type: "object",
          properties: { pass: { type: "boolean" }, reason: { type: "string" } },
          required: ["pass", "reason"],
          additionalProperties: false,
        },
      },
    },
  });
  return JSON.parse(response.output_text);
}

// Runs every check in a case. Returns a list of problems (empty = passed).
async function check(testCase, answer, toolCalls) {
  const problems = [];

  for (const snippet of testCase.mustInclude || []) {
    if (!contains(answer, snippet)) problems.push(`missing "${snippet}"`);
  }
  if (testCase.mustIncludeAny && !testCase.mustIncludeAny.some((snippet) => contains(answer, snippet))) {
    problems.push(`missing any of: ${testCase.mustIncludeAny.join(", ")}`);
  }
  for (const snippet of testCase.mustNotInclude || []) {
    if (contains(answer, snippet)) problems.push(`must not say "${snippet}"`);
  }

  const pages = citedPages(answer);
  if (testCase.cites && !testCase.cites.some((page) => pages.includes(page))) {
    problems.push(`should cite p. ${testCase.cites.join(" or ")} (cited: ${pages.join(", ") || "nothing"})`);
  }
  for (const page of testCase.mustNotCite || []) {
    if (pages.includes(page)) problems.push(`wrongly cited p. ${page}`);
  }

  if (testCase.refuses && !REFUSAL.test(answer)) {
    problems.push("should have said the answer isn't in the document");
  }

  if (testCase.tool) {
    const call = toolCalls.find((t) => t.name === testCase.tool.name);
    if (!call) {
      problems.push(`didn't call the ${testCase.tool.name} tool`);
    } else {
      for (const [key, expected] of Object.entries(testCase.tool.args || {})) {
        if (call.args[key] !== expected) {
          problems.push(`${testCase.tool.name}.${key} was ${call.args[key]}, expected ${expected}`);
        }
      }
    }
  }

  if (testCase.judge) {
    const verdict = await judge(testCase.judge, testCase.question, answer);
    if (!verdict.pass) problems.push(`judge: ${verdict.reason}`);
  }

  return problems;
}

// ---- Upload each PDF once (and in RAG mode, index it once) ----
console.log(`Running ${cases.length} eval case(s) with ${model.id}, ${mode} mode\n`);

const fileIds = {}; // "demo/acme-q3-report.pdf" -> "file-abc123"
const vectorStoreIds = {}; // "demo/acme-q3-report.pdf" -> "vs_abc123" (RAG mode only)
for (const testCase of cases) {
  if (fileIds[testCase.pdf]) continue;
  const bytes = readFileSync(testCase.pdf);
  const filename = testCase.pdf.split("/").pop();
  const uploaded = await openai.files.create({
    file: await toFile(bytes, filename, { type: "application/pdf" }),
    purpose: "user_data",
    expires_after: { anchor: "created_at", seconds: 60 * 60 },
  });
  fileIds[testCase.pdf] = uploaded.id;

  if (mode === "rag") {
    console.log(`Indexing ${filename}…`);
    vectorStoreIds[testCase.pdf] = await createIndex(await readPageTexts(bytes), filename);
  }
}

// ---- Run the cases, one after another ----
const results = [];
for (const testCase of cases) {
  try {
    const { text, toolCalls, stats } = await runAgent({
      model,
      fileId: fileIds[testCase.pdf],
      messages: [{ role: "user", content: testCase.question }],
      mode,
      vectorStoreId: vectorStoreIds[testCase.pdf],
    });
    const problems = await check(testCase, text, toolCalls);
    results.push({ id: testCase.id, pass: problems.length === 0, problems, answer: text, toolCalls, stats });

    if (problems.length === 0) {
      console.log(`✅ ${testCase.id}`);
    } else {
      console.log(`❌ ${testCase.id}\n     ${problems.join("\n     ")}`);
    }
  } catch (error) {
    results.push({ id: testCase.id, pass: false, problems: [`error: ${error.message}`] });
    console.log(`💥 ${testCase.id}: ${error.message}`);
  }
}

// ---- Clean up and print a summary ----
for (const fileId of Object.values(fileIds)) {
  await openai.files.delete(fileId).catch(() => {});
}
for (const vectorStoreId of Object.values(vectorStoreIds)) {
  await openai.vectorStores.delete(vectorStoreId).catch(() => {});
}

const passed = results.filter((r) => r.pass).length;
const answered = results.filter((r) => r.stats);
const averageTokens = Math.round(
  answered.reduce((total, r) => total + r.stats.inputTokens, 0) / (answered.length || 1),
);
console.log(
  `\n${passed}/${results.length} passed · on average ${averageTokens.toLocaleString()} input tokens per question`,
);

mkdirSync("evals/results", { recursive: true });
const resultsFile = `evals/results/${new Date().toISOString().replace(/[:.]/g, "-")}-${model.id}-${mode}.json`;
writeFileSync(resultsFile, JSON.stringify({ model: model.id, mode, passed, total: results.length, results }, null, 2));
console.log(`Full answers saved to ${resultsFile}`);

// Exit code 1 when something failed, so this can block a deploy in CI.
process.exit(passed === results.length ? 0 : 1);
