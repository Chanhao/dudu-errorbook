const fs = require("node:fs");
const path = require("node:path");

const DATA_FILE = path.join(process.cwd(), "data", "entries.json");

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function uid() {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  return String(value || "")
    .split(/[,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeImage(payload) {
  if (payload.imageDataUrl) return String(payload.imageDataUrl);
  if (!payload.imageBase64) return "";
  const mime = payload.imageMimeType || "image/jpeg";
  return `data:${mime};base64,${String(payload.imageBase64).replace(/\s/g, "")}`;
}

function normalizeEntry(payload = {}) {
  const now = new Date().toISOString();
  const date = payload.date || localDate();
  return {
    id: payload.id || uid(),
    subject: payload.subject || "语文",
    errorType: payload.errorType || "其他",
    source: payload.source || "",
    wrongText: payload.wrongText || payload.text || "",
    correctText: payload.correctText || "",
    reason: payload.reason || payload.note || "",
    tags: normalizeTags(payload.tags),
    date,
    imageDataUrl: normalizeImage(payload),
    reviewLevel: Number(payload.reviewLevel || 0),
    nextReviewDate: payload.nextReviewDate || date,
    createdAt: payload.createdAt || now,
    updatedAt: now,
    createdBy: payload.createdBy || "shortcut",
  };
}

function readEntries() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const text = fs.readFileSync(DATA_FILE, "utf8");
  const parsed = JSON.parse(text || "[]");
  return Array.isArray(parsed) ? parsed : [];
}

const payload = JSON.parse(process.env.CLIENT_PAYLOAD || "{}");
const incoming = Array.isArray(payload.entries) ? payload.entries : [payload.entry || payload];
const entries = readEntries();

for (const item of incoming) {
  const entry = normalizeEntry(item);
  const index = entries.findIndex((old) => old.id === entry.id);
  if (index >= 0) entries[index] = { ...entries[index], ...entry, createdAt: entries[index].createdAt };
  else entries.unshift(entry);
}

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.writeFileSync(DATA_FILE, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Wrote ${incoming.length} entry to ${DATA_FILE}`);
