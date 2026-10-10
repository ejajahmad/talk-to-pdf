"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantMessage from "@/components/AssistantMessage";
import PdfViewer from "@/components/PdfViewer";
import UsageMeta, { formatDollars } from "@/components/UsageMeta";
import ToolCalls from "@/components/ToolCalls";
import FactsCard from "@/components/FactsCard";
import AnswerActions from "@/components/AnswerActions";
import ModeBar from "@/components/ModeBar";
import Orb from "@/components/Orb";
import Icon from "@/components/Icon";
import VoiceMode from "@/components/VoiceMode";
import PromptDrawer from "@/components/PromptDrawer";
import ProgressBar from "@/components/ProgressBar";
import ChatHistory from "@/components/ChatHistory";
import { LIMITS } from "@/lib/guardrails";
import { MODELS } from "@/lib/models";
import { readJsonLines } from "@/lib/read-json-lines";
import { chatToMarkdown, downloadFile } from "@/lib/chat-markdown";
import { uploadWithProgress } from "@/lib/upload-with-progress";
import { saveChat, getChat, listChats, deleteChat, savePdf, getPdf, newChatId, fingerprintFile } from "@/lib/chat-store";

const SUGGESTIONS = [
  { icon: "file", color: "purple", text: "Summarise this document" },
  { icon: "calendar", color: "blue", text: "List any dates or deadlines" },
  { icon: "chart", color: "orange", text: "Show me the most important table" }, // the model should call go_to_page
  { icon: "calculator", color: "pink", text: "What's the % change between the two biggest numbers?" }, // the model should call calculate
];

const MAX_DOCS = 3; // v8: chat with up to 3 PDFs at once

// This one page serves "/" (start) AND "/chat/<id>" (a saved chat): see the [[...slug]] folder name.
export default function Home() {
  // v8: every chat has its own URL, /chat/<id>. The chat on screen is the one in the address bar.
  const pathname = usePathname();
  const urlChatId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;
  const [chatId, setChatIdState] = useState(null); // the chat currently on screen
  // The same id in a ref: a ref updates at once, so the URL effect below never sees an old id.
  const chatIdRef = useRef(null);
  function setChatId(id) {
    chatIdRef.current = id;
    setChatIdState(id);
  }
  const [savedChats, setSavedChats] = useState([]); // for the history list
  const [historyOpen, setHistoryOpen] = useState(false);
  const openingChat = useRef(null); // the chat being loaded right now, so we don't load it twice
  // v8: a LIST of PDFs. Each one: { token, indexToken, filename, tokens, url, file, fileKey }
  const [docs, setDocs] = useState([]);
  const [activeDoc, setActiveDoc] = useState(0); // which PDF the viewer shows
  // v8: null when not uploading, else 0 → 1 while the file is sent. At 1 the server is still working.
  const [uploadProgress, setUploadProgress] = useState(null);
  const uploading = uploadProgress !== null;
  // Chat messages: { role: "user" | "assistant", content, tools, usage, prompt, followUps }
  // Key facts cards: { role: "facts", facts, doc }
  // v8: side-by-side answers: { role: "compare", content, answers: [fullAnswer, ragAnswer] }
  const [messages, setMessages] = useState([]);
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState({ page: 1, quote: "", jump: 0 }); // what the PDF viewer shows
  const [mode, setMode] = useState("full"); // "full", "rag" or "compare"
  const [indexing, setIndexing] = useState(false);
  const [simple, setSimple] = useState(false); // v8: "Explain simply"
  const [openPrompt, setOpenPrompt] = useState(null); // v8: the prompt shown in the drawer
  const [voiceOpen, setVoiceOpen] = useState(false); // v8: full-screen voice mode
  const stopController = useRef(null); // lets the Stop button cancel the request
  const bottomOfChat = useRef(null);

  // v8: how full is this chat? The server refuses chats over LIMITS (lib/guardrails.js), because the
  // whole chat is re-sent with every question. Showing it here means users are never surprised.
  const chatMessages = messages.filter((m) => m.role !== "facts");
  const maxQuestions = Math.floor(LIMITS.maxMessages / 2);
  const questionsAsked = chatMessages.filter((m) => m.role === "user").length;
  const chatCharacters = chatMessages.reduce((sum, m) => sum + m.content.length, 0);
  const chatUsed = Math.max(questionsAsked / maxQuestions, chatCharacters / LIMITS.maxChatLength);
  const chatFull = chatMessages.length + 1 > LIMITS.maxMessages || chatCharacters >= LIMITS.maxChatLength;

  // v8: the address changed (a link, a history click, or the browser's Back button): show that chat.
  useEffect(() => {
    if (urlChatId === chatIdRef.current) return;
    if (urlChatId) openSavedChat(urlChatId);
    else showStart();
  }, [urlChatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // v8: save the chat after every change. Not while an answer is still streaming in.
  useEffect(() => {
    if (!chatId || docs.length === 0 || loading) return;
    const firstQuestion = messages.find((m) => m.role === "user");
    saveChat({
      id: chatId,
      title: firstQuestion ? firstQuestion.content.slice(0, 80) : docs[0].filename,
      docs: docs.map((doc) => ({ filename: doc.filename, fileKey: doc.fileKey, tokens: doc.tokens })),
      messages,
      mode,
      modelId,
      updatedAt: Date.now(),
    }).catch(() => {}); // e.g. private browsing without storage: the chat just isn't saved
  }, [chatId, docs, messages, mode, modelId, loading]);

  // Keep the history list fresh on the start screen and whenever the history panel opens.
  useEffect(() => {
    if (docs.length === 0 || historyOpen) listChats().then(setSavedChats).catch(() => {});
  }, [docs.length, historyOpen]);

  // Changes the address WITHOUT reloading the page. The effect above then shows the right chat.
  function goTo(path) {
    window.history.pushState(null, "", path);
  }

  function showStart() {
    setChatId(null);
    setDocs([]);
    setMessages([]);
    setMode("full");
  }

  // v8: open a saved chat. The PDFs are stored in the browser, but OpenAI deletes uploaded files
  // after 24 hours, so we send them to the server again (it reuses the file if it still has it).
  async function openSavedChat(id) {
    if (openingChat.current === id) return;
    openingChat.current = id;
    setError("");
    setDocs([]);
    try {
      const chat = await getChat(id);
      if (!chat) throw new Error("That chat isn't saved in this browser.");
      const restored = [];
      for (const saved of chat.docs) {
        const file = await getPdf(saved.fileKey);
        if (!file) throw new Error("The PDF for this chat is missing.");
        restored.push({ ...(await sendPdfToServer(file)), fileKey: saved.fileKey });
      }
      setChatId(id);
      setMessages(chat.messages);
      setModelId(chat.modelId);
      setMode(chat.mode === "full" || restored[0].indexToken ? chat.mode : "full");
      setActiveDoc(0);
      setViewer({ page: 1, quote: "", jump: 0 });
      setDocs(restored);
    } catch (err) {
      setError(err.message);
      window.history.replaceState(null, "", "/");
      showStart();
    }
    setUploadProgress(null);
    openingChat.current = null;
  }

  async function removeSavedChat(id) {
    await deleteChat(id);
    setSavedChats(await listChats());
    if (id === chatId) goTo("/");
  }

  // Sends a PDF to /api/upload with a progress bar. Returns the doc, or throws with a message.
  async function sendPdfToServer(file) {
    setUploadProgress(0);
    const form = new FormData();
    form.append("file", file);
    const response = await uploadWithProgress("/api/upload", form, setUploadProgress);
    if (!response.ok) throw new Error(response.data.error);
    // A local address for the file, so the viewer can show it without downloading it again.
    // Keep the file too: RAG indexing sends it again.
    return { ...response.data, url: URL.createObjectURL(file), file };
  }

  // Scroll to the newest message whenever the messages change.
  useEffect(() => {
    bottomOfChat.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // `add` = true adds the PDF to the chat. Otherwise it starts a new chat with just this PDF.
  async function uploadPdf(file, add = false) {
    if (!file) return;
    setError("");

    try {
      const doc = { ...(await sendPdfToServer(file)), fileKey: await fingerprintFile(file) };
      await savePdf(doc.fileKey, file).catch(() => {}); // keep the PDF, so this chat can be reopened
      if (add) {
        setDocs([...docs, doc]);
        setActiveDoc(docs.length);
        setMode("full"); // RAG and Compare work with one PDF
      } else {
        // A new chat gets a new URL.
        const id = newChatId();
        setChatId(id);
        goTo(`/chat/${id}`);
        setDocs([doc]);
        setActiveDoc(0);
        setMessages([]);
        // Already indexed (the same PDF was uploaded before)? Then start in RAG mode.
        setMode(doc.indexToken ? "rag" : "full");
      }
      setViewer({ page: 1, quote: "", jump: 0 });
    } catch (err) {
      setError(err.message);
    }
    setUploadProgress(null);
  }

  // v8: a fresh chat about the same PDFs, at a new URL.
  function newChatSameDocs() {
    const id = newChatId();
    setChatId(id);
    goTo(`/chat/${id}`);
    setMessages([]);
  }

  function removeDoc(index) {
    setDocs(docs.filter((doc, i) => i !== index));
    setActiveDoc(0);
    setViewer({ page: 1, quote: "", jump: 0 });
  }

  // Sends the chat to /api/chat in one mode and reads the streamed answer.
  // onUpdate is called with the answer so far, every time a new piece arrives.
  async function streamAnswer(conversation, answerMode, signal, onUpdate) {
    const answer = { mode: answerMode, content: "", tools: [], usage: null, prompt: null };

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokens: docs.map((doc) => doc.token),
        docNames: docs.map((doc) => doc.filename),
        indexToken: docs[0].indexToken,
        messages: conversation,
        mode: answerMode,
        modelId,
        simple,
      }),
      signal,
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error);
    }

    // Each line from the server is one event: text, a tool call, the prompt, the usage stats, or an error.
    await readJsonLines(response, (event) => {
      if (event.type === "text") answer.content += event.text;
      if (event.type === "usage") answer.usage = event;
      if (event.type === "prompt") answer.prompt = event;
      if (event.type === "error") setError(event.message);
      if (event.type === "tool") {
        answer.tools = [...answer.tools, event];
        // The model asked to show a page, so the browser scrolls the viewer.
        if (event.name === "go_to_page") goToPage({ ...event.args, quote: event.args.reason });
      }
      onUpdate({ ...answer });
    });
    return answer;
  }

  async function sendMessage(question) {
    if (question.trim() === "" || loading || chatFull) return;

    // Everything on screen so far, plus the new question.
    const newMessages = [...messages, { role: "user", content: question }];
    // What the model sees: only questions and answers. Facts cards are just for the screen.
    const conversation = newMessages
      .filter((m) => m.role !== "facts")
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

    setInput("");
    setLoading(true);
    setError("");
    const controller = new AbortController();
    stopController.current = controller;

    try {
      if (mode === "compare") {
        // v8: ask in Full PDF AND RAG mode at the same time, and show both answers side by side.
        const answers = [{ mode: "full", content: "" }, { mode: "rag", content: "" }];
        const show = () =>
          setMessages([...newMessages, { role: "compare", content: answers[0].content, answers: [...answers] }]);
        show();
        await Promise.all(
          answers.map((answer, i) =>
            streamAnswer(conversation, answer.mode, controller.signal, (update) => {
              answers[i] = update;
              show();
            }),
          ),
        );
      } else {
        // Add an empty answer that we fill in as the text streams in.
        setMessages([...newMessages, { role: "assistant", content: "" }]);
        const answer = await streamAnswer(conversation, mode, controller.signal, (update) =>
          setMessages([...newMessages, { role: "assistant", ...update }]),
        );
        if (answer.content !== "") loadFollowUps(question, answer.content, newMessages.length);
      }
    } catch (err) {
      // Pressing Stop throws an "AbortError". That's not a real error.
      if (err.name !== "AbortError") setError(err.message);
    }

    // Stopped before any text arrived? Then drop the empty answer bubble.
    setMessages((old) => {
      const last = old[old.length - 1];
      return last.role === "assistant" && last.content === "" ? old.slice(0, -1) : old;
    });
    setLoading(false);
  }

  // v8: three suggested next questions, added to the answer when they arrive.
  async function loadFollowUps(question, answer, index) {
    try {
      const response = await fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      const { questions } = await response.json();
      setMessages((old) => old.map((m, i) => (i === index ? { ...m, followUps: questions } : m)));
    } catch {
      // No follow-ups this time. Not worth an error message.
    }
  }

  // Structured outputs: ask for the key facts as JSON and show them as a table.
  async function extractFacts() {
    setLoading(true);
    setExtracting(true);
    setError("");

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: docs[activeDoc].token, modelId }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessages([...messages, { role: "facts", facts: data, doc: activeDoc + 1 }]);
      } else {
        setError(data.error);
      }
    } catch {
      setError("Could not reach the server");
    }
    setLoading(false);
    setExtracting(false);
  }

  // v7: RAG (and Compare, which uses RAG too) needs a search index. The first time, we build it.
  async function changeMode(newMode) {
    if (newMode === "full" || docs[0].indexToken) {
      setMode(newMode);
      return;
    }

    setIndexing(true);
    setError("");
    try {
      const form = new FormData();
      form.append("token", docs[0].token);
      form.append("file", docs[0].file);
      const response = await fetch("/api/index", { method: "POST", body: form });
      const data = await response.json();

      if (response.ok) {
        setDocs([{ ...docs[0], indexToken: data.indexToken }]);
        setMode(newMode);
      } else {
        setError(data.error);
      }
    } catch {
      setError("Could not reach the server");
    }
    setIndexing(false);
  }

  function stop() {
    stopController.current.abort();
  }

  function exportChat() {
    const filenames = docs.map((doc) => doc.filename);
    downloadFile(chatToMarkdown(messages, filenames), filenames[0].replace(/\.pdf$/i, "") + " - chat.md");
  }

  // Add up tokens and cost for the whole conversation.
  let sessionTokens = 0;
  let sessionCost = 0;
  for (const message of messages) {
    for (const answer of message.answers || [message]) {
      if (answer.usage) {
        sessionTokens += answer.usage.inputTokens + answer.usage.outputTokens;
        sessionCost += answer.usage.cost || 0;
      }
    }
  }

  // Opens a cited page. `quote` is the text to highlight on it. `doc` is 1, 2 or 3.
  function goToPage({ doc = 1, page, quote = "" }) {
    if (doc >= 1 && doc <= docs.length) setActiveDoc(doc - 1);
    // Using the "old" value (instead of `viewer`) keeps the count right even when
    // this runs several times during one streamed answer.
    setViewer((old) => ({ page, quote, jump: old.jump + 1 }));
  }

  if (docs.length === 0) {
    return (
      <main className="welcome">
        <h1>
          Your <span className="highlight">Smart PDF Assistant</span> for Any Document
        </h1>
        <div className="hero">
          <span className="hello">Hello!</span>
          <Orb size="large" />
        </div>
        <p className="muted">Upload a PDF (up to 32 MB) and get instant answers to anything inside it</p>
        <label className="get-started">
          <input
            type="file"
            accept="application/pdf"
            disabled={uploading}
            onChange={(e) => uploadPdf(e.target.files[0])}
          />
          {uploading ? (
            <span className="upload-status">
              <span>{uploadProgress < 1 ? `Uploading… ${Math.round(uploadProgress * 100)}%` : "Reading your PDF…"}</span>
              <ProgressBar value={uploadProgress} working={uploadProgress >= 1} />
            </span>
          ) : (
            <>
              Get started <Icon name="arrow-right" />
            </>
          )}
        </label>
        {error && <p className="error">{error}</p>}
        {urlChatId && <p className="muted">Opening your saved chat…</p>}
        {savedChats.length > 0 && (
          <section className="recent">
            <h2>
              <Icon name="history" size={16} /> Recent chats
            </h2>
            <ChatHistory chats={savedChats.slice(0, 6)} onOpen={(id) => goTo(`/chat/${id}`)} onDelete={removeSavedChat} />
          </section>
        )}
      </main>
    );
  }

  // One answer: the tools it used, the text, its stats, and the buttons under it.
  function renderAnswer(answer, isLast) {
    return (
      <>
        <div className="bubble">
          {answer.tools && answer.tools.length > 0 && <ToolCalls tools={answer.tools} onCitationClick={goToPage} />}
          {answer.content === "" && <span className="dots">Reading</span>}
          <AssistantMessage content={answer.content} onCitationClick={goToPage} />
        </div>
        {answer.usage && <UsageMeta usage={answer.usage} />}
        {answer.usage && (
          <AnswerActions
            content={answer.content}
            requestId={answer.usage.requestId}
            onShowPrompt={answer.prompt ? () => setOpenPrompt(answer.prompt) : null}
          />
        )}
        {isLast && !loading && answer.followUps && (
          <div className="follow-ups">
            {answer.followUps.map((question) => (
              <button key={question} onClick={() => sendMessage(question)}>
                <Icon name="reply" size={14} /> {question}
              </button>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="workspace">
      <section className="viewer-panel">
        <nav className="doc-tabs">
          {docs.map((doc, i) => (
            <span key={doc.url} className={`doc-tab ${i === activeDoc ? "active" : ""}`}>
              <button
                onClick={() => {
                  setActiveDoc(i);
                  setViewer({ page: 1, quote: "", jump: 0 });
                }}
                title={doc.filename}
              >
                <Icon name="file" size={14} />
                {docs.length > 1 && <b>Doc {i + 1}</b>}
                <span className="doc-name">{doc.filename}</span>
              </button>
              {docs.length > 1 && (
                <button className="remove" onClick={() => removeDoc(i)} disabled={loading} title="Remove this PDF">
                  <Icon name="x" size={13} />
                </button>
              )}
            </span>
          ))}
          {docs.length < MAX_DOCS && (
            <label className={`add-doc ${uploading ? "busy" : loading ? "disabled" : ""}`} title="Chat with several PDFs at once">
              <input
                type="file"
                accept="application/pdf"
                disabled={uploading || loading}
                onChange={(e) => {
                  uploadPdf(e.target.files[0], true);
                  e.target.value = ""; // so the same file can be chosen again
                }}
              />
              {uploading ? (
                <span className="add-doc-progress">
                  {uploadProgress < 1 ? `${Math.round(uploadProgress * 100)}%` : "Reading…"}
                  <ProgressBar value={uploadProgress} working={uploadProgress >= 1} />
                </span>
              ) : (
                <>
                  <Icon name="plus" size={14} /> Add PDF
                </>
              )}
            </label>
          )}
        </nav>
        <PdfViewer
          key={docs[activeDoc].url}
          pdfUrl={docs[activeDoc].url}
          page={viewer.page}
          quote={viewer.quote}
          jump={viewer.jump}
        />
      </section>

      <main className="chat">
        <header>
          <button className="round" onClick={() => goTo("/")} title="New PDF">
            <Icon name="arrow-left" />
          </button>
          <div className="title">
            <span className="filename">{docs.length > 1 ? `${docs.length} PDFs` : docs[0].filename}</span>
            {sessionTokens > 0 ? (
              <span className="session-total">
                <Icon name="sparkles" size={12} /> {sessionTokens.toLocaleString()} tokens
                {sessionCost > 0 && ` · ${formatDollars(sessionCost)}`}
              </span>
            ) : (
              <span className="muted small">Talk to PDF</span>
            )}
          </div>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={loading}>
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <button className="pill" onClick={extractFacts} disabled={loading}>
            <Icon name="sparkles" size={15} /> {extracting ? "Extracting…" : "Key facts"}
          </button>
          <button className="round" onClick={() => setHistoryOpen(true)} title="Your chats">
            <Icon name="history" />
          </button>
          <button className="round" onClick={exportChat} disabled={messages.length === 0} title="Download the chat">
            <Icon name="download" />
          </button>
        </header>

        <ModeBar
          tokens={docs.some((doc) => doc.tokens === null) ? null : docs.reduce((sum, doc) => sum + doc.tokens, 0)}
          docCount={docs.length}
          mode={mode}
          onModeChange={changeMode}
          indexing={indexing}
          disabled={loading}
        />

        <section className="messages">
          {messages.length === 0 && (
            <div className="empty">
              <Orb size="medium" />
              <h2>Hi there!</h2>
              <p className="muted">How may I help you with {docs.length > 1 ? "these PDFs" : "this PDF"} today?</p>
              <div className="suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion.text} onClick={() => sendMessage(suggestion.text)}>
                    <span className={`icon ${suggestion.color}`}>
                      <Icon name={suggestion.icon} size={20} />
                    </span>
                    {suggestion.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, i) => {
            const isLast = i === messages.length - 1;
            if (message.role === "facts") {
              return (
                <div key={i} className="message">
                  <FactsCard facts={message.facts} doc={message.doc} onCitationClick={goToPage} />
                </div>
              );
            }
            if (message.role === "user") {
              return (
                <div key={i} className="message user">
                  <div className="bubble">{message.content}</div>
                </div>
              );
            }
            if (message.role === "compare") {
              return (
                <div key={i} className="message assistant">
                  <div className="author">
                    <Orb thinking={loading && isLast} /> AI-Assistant
                    <span className="muted small">· same question, two ways</span>
                  </div>
                  <div className="compare">
                    {message.answers.map((answer) => (
                      <div key={answer.mode} className="compare-column">
                        <span className="compare-label">{answer.mode === "rag" ? "RAG (search)" : "Full PDF"}</span>
                        {renderAnswer(answer, false)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="message assistant">
                <div className="author">
                  <Orb thinking={loading && isLast} /> AI-Assistant
                </div>
                {renderAnswer(message, isLast)}
              </div>
            );
          })}
          <div ref={bottomOfChat} />
        </section>

        {error && <p className="error">{error}</p>}

        {questionsAsked > 0 && (
          <div className={`chat-limit ${chatFull ? "full" : ""}`}>
            <span>
              {chatFull ? "This chat is full" : `${questionsAsked} of ${maxQuestions} questions`}
            </span>
            <ProgressBar value={chatUsed} warn={chatUsed >= 0.8} />
            {chatFull ? (
              <button className="pill" onClick={newChatSameDocs} disabled={loading}>
                <Icon name="plus" size={14} /> New chat
              </button>
            ) : (
              <span className="muted">{Math.round(chatUsed * 100)}% used</span>
            )}
          </div>
        )}

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
        >
          <Orb size="button" thinking={loading} />
          <button
            type="button"
            className={`icon-button ${simple ? "on" : ""}`}
            onClick={() => setSimple(!simple)}
            title={simple ? "Explain simply: on" : "Explain simply (like I'm 10)"}
          >
            <Icon name="lightbulb" size={18} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              chatFull
                ? "Start a new chat to keep going"
                : simple
                  ? "Ask anything, I'll keep it simple…"
                  : "Ask a question about the PDF…"
            }
            maxLength={LIMITS.maxQuestionLength}
            disabled={chatFull}
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => setVoiceOpen(true)}
            disabled={loading || chatFull}
            title="Ask out loud"
          >
            <Icon name="mic" size={18} />
          </button>
          {loading ? (
            <button type="button" className="send stop" onClick={stop} title="Stop">
              <Icon name="stop" />
            </button>
          ) : (
            <button type="submit" className="send" disabled={input.trim() === ""} title="Send">
              <Icon name="arrow-up" />
            </button>
          )}
        </form>
      </main>

      {openPrompt && <PromptDrawer prompt={openPrompt} onClose={() => setOpenPrompt(null)} />}
      {voiceOpen && <VoiceMode onSend={sendMessage} onClose={() => setVoiceOpen(false)} />}
      {historyOpen && (
        <div className="backdrop" onClick={() => setHistoryOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <header>
              <div>
                <h2>Your chats</h2>
                <p className="muted small">Every chat has its own link. They are saved in this browser.</p>
              </div>
              <button className="round" onClick={() => setHistoryOpen(false)} title="Close">
                <Icon name="x" />
              </button>
            </header>
            <div className="history-actions">
              <button className="pill" onClick={newChatSameDocs} disabled={loading}>
                <Icon name="plus" size={14} /> New chat, same PDF{docs.length > 1 ? "s" : ""}
              </button>
              <button className="pill" onClick={() => goTo("/")}>
                <Icon name="file" size={14} /> New PDF
              </button>
            </div>
            <ChatHistory
              chats={savedChats}
              currentId={chatId}
              onOpen={(id) => {
                setHistoryOpen(false);
                goTo(`/chat/${id}`);
              }}
              onDelete={removeSavedChat}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
