// v8: saved chats, kept in the browser's own database (IndexedDB), so every chat gets a URL
// you can come back to: /chat/<id>. Two "tables":
//   chats   { id, title, docs: [{ filename, fileKey, tokens }], messages, mode, modelId, updatedAt }
//   pdfs    the PDF files themselves, by fileKey (a fingerprint of the file, so each PDF is stored once)
//
// Everything stays in THIS browser. To open chats on other devices, you'd keep them in a server
// database instead (and the PDFs in file storage such as S3).

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("talk-to-pdf", 1);
    // Runs the first time only: create the two tables.
    request.onupgradeneeded = () => {
      request.result.createObjectStore("chats", { keyPath: "id" });
      request.result.createObjectStore("pdfs");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Runs one action on a table and waits until it's done.
async function run(table, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(table, mode);
    const request = action(transaction.objectStore(table));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
  });
}

export const saveChat = (chat) => run("chats", "readwrite", (chats) => chats.put(chat));
export const getChat = (id) => run("chats", "readonly", (chats) => chats.get(id));
export const savePdf = (fileKey, file) => run("pdfs", "readwrite", (pdfs) => pdfs.put(file, fileKey));
export const getPdf = (fileKey) => run("pdfs", "readonly", (pdfs) => pdfs.get(fileKey));

// All chats, newest first.
export async function listChats() {
  const chats = await run("chats", "readonly", (store) => store.getAll());
  return chats.sort((a, b) => b.updatedAt - a.updatedAt);
}

// Deletes a chat, and its PDFs if no other chat uses them.
export async function deleteChat(id) {
  const chat = await getChat(id);
  await run("chats", "readwrite", (chats) => chats.delete(id));
  const stillUsed = new Set((await listChats()).flatMap((c) => c.docs.map((doc) => doc.fileKey)));
  for (const doc of chat?.docs || []) {
    if (!stillUsed.has(doc.fileKey)) await run("pdfs", "readwrite", (pdfs) => pdfs.delete(doc.fileKey));
  }
}

// A short random id for a new chat's URL, e.g. "k3x9a2b7q1mz".
export function newChatId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// A fingerprint of the file's bytes (SHA-256). The same PDF always gets the same key.
export async function fingerprintFile(file) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// "just now", "5 min ago", "3 h ago", "2 days ago"
export function timeAgo(time) {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
