const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 5177);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "entries.json");
const BODY_LIMIT = 35 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

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

async function ensureDataFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    await fsp.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readEntries() {
  await ensureDataFile();
  const text = await fsp.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(text || "[]");
  return Array.isArray(parsed) ? parsed : [];
}

async function writeEntries(entries) {
  await ensureDataFile();
  await fsp.writeFile(DATA_FILE, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  if (Buffer.isBuffer(body)) return res.end(body);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error("请求内容太大，请降低照片分辨率或压缩后再上传。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("JSON 格式无效"));
      }
    });
    req.on("error", reject);
  });
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const clean = decoded === "/" ? "/index.html" : decoded;
  const filePath = path.normalize(path.join(ROOT, clean));
  if (!filePath.startsWith(ROOT)) return null;
  return filePath;
}

async function serveStatic(req, res, urlPath) {
  const filePath = safeStaticPath(urlPath);
  if (!filePath) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return send(res, 404, "Not Found", "text/plain; charset=utf-8");
    const ext = path.extname(filePath);
    send(res, 200, await fsp.readFile(filePath), MIME[ext] || "application/octet-stream");
  } catch {
    send(res, 404, "Not Found", "text/plain; charset=utf-8");
  }
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") return send(res, 204, "");

  if (url.pathname === "/api/health" && req.method === "GET") {
    const entries = await readEntries();
    return send(res, 200, { ok: true, entries: entries.length, date: localDate() });
  }

  if (url.pathname === "/api/entries" && req.method === "GET") {
    const entries = await readEntries();
    return send(res, 200, { entries });
  }

  if (url.pathname === "/api/entries" && req.method === "POST") {
    const payload = await readJson(req);
    const incoming = Array.isArray(payload) ? payload : payload.entries || payload.entry || payload;
    const items = Array.isArray(incoming) ? incoming : [incoming];
    const entries = await readEntries();
    const normalized = items.map(normalizeEntry);
    for (const entry of normalized) {
      const index = entries.findIndex((item) => item.id === entry.id);
      if (index >= 0) entries[index] = { ...entries[index], ...entry, createdAt: entries[index].createdAt };
      else entries.unshift(entry);
    }
    await writeEntries(entries);
    return send(res, 201, { ok: true, entries: normalized });
  }

  if (url.pathname === "/api/entries" && req.method === "PUT") {
    const payload = await readJson(req);
    const incoming = Array.isArray(payload) ? payload : payload.entries;
    if (!Array.isArray(incoming)) return send(res, 400, { ok: false, error: "entries 必须是数组" });
    const entries = incoming.map((entry) => normalizeEntry({ createdBy: "web", ...entry }));
    await writeEntries(entries);
    return send(res, 200, { ok: true, entries });
  }

  const match = url.pathname.match(/^\/api\/entries\/([^/]+)$/);
  if (match && req.method === "PUT") {
    const id = decodeURIComponent(match[1]);
    const payload = await readJson(req);
    const entries = await readEntries();
    const index = entries.findIndex((entry) => entry.id === id);
    const entry = normalizeEntry({ ...payload, id, createdBy: payload.createdBy || "web" });
    if (index >= 0) entries[index] = { ...entries[index], ...entry, createdAt: entries[index].createdAt };
    else entries.unshift(entry);
    await writeEntries(entries);
    return send(res, 200, { ok: true, entry: index >= 0 ? entries[index] : entry });
  }

  if (match && req.method === "DELETE") {
    const id = decodeURIComponent(match[1]);
    const entries = (await readEntries()).filter((entry) => entry.id !== id);
    await writeEntries(entries);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { ok: false, error: "API 不存在" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    send(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, "::", () => {
  console.log(`Dudu Errorbook running at http://localhost:${PORT}/`);
});
