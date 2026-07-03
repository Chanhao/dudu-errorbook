const STORE_KEY = "dudu-errorbook:v1";
const SETTINGS_KEY = "dudu-errorbook:settings";
const GITHUB_SYNC_KEY = "dudu-errorbook:github-sync";
const REVIEW_INTERVALS = [0, 1, 2, 4, 7, 14, 30, 60];
const SERVER_SYNC = location.protocol === "http:" || location.protocol === "https:";
const AI_PROVIDERS = {
  openai: {
    label: "OpenAI / GPT",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hint: "使用 OpenAI Chat Completions；适合 GPT 系列模型。",
  },
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.5-flash",
    hint: "使用 Gemini 的 OpenAI-compatible endpoint；API Key 来自 Google AI Studio。",
  },
  kimi: {
    label: "Kimi / Moonshot",
    baseUrl: "https://api.moonshot.ai/v1",
    model: "kimi-k2.6",
    hint: "使用 Kimi Open Platform；Kimi K2 系列建议温度 0.6。",
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    hint: "使用 DeepSeek OpenAI-compatible endpoint；也可改用 deepseek-v4-pro。",
  },
  custom: {
    label: "自定义 OpenAI-compatible",
    baseUrl: "",
    model: "",
    hint: "用于 OpenRouter、硅基流动、火山方舟等兼容 Chat Completions 的服务。",
  },
};

const state = {
  entries: [],
  selectedSubject: "语文",
  imageDataUrl: "",
  githubSha: "",
  view: "capture",
  practiceSelection: new Set(),
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  viewTitle: $("#viewTitle"),
  statTotal: $("#statTotal"),
  statWeek: $("#statWeek"),
  statDue: $("#statDue"),
  statHot: $("#statHot"),
  entryForm: $("#entryForm"),
  entryId: $("#entryId"),
  subjectGroup: $("#subjectGroup"),
  errorType: $("#errorType"),
  source: $("#source"),
  wrongText: $("#wrongText"),
  correctText: $("#correctText"),
  reason: $("#reason"),
  tags: $("#tags"),
  entryDate: $("#entryDate"),
  imageInput: $("#imageInput"),
  imagePreview: $("#imagePreview"),
  previewImg: $("#previewImg"),
  recentList: $("#recentList"),
  libraryList: $("#libraryList"),
  reviewQueue: $("#reviewQueue"),
  insightList: $("#insightList"),
  searchInput: $("#searchInput"),
  subjectFilter: $("#subjectFilter"),
  typeFilter: $("#typeFilter"),
  selectedPracticeCount: $("#selectedPracticeCount"),
  clearPracticeSelectionBtn: $("#clearPracticeSelectionBtn"),
  summaryOutput: $("#summaryOutput"),
  generateOutput: $("#generateOutput"),
  genSource: $("#genSource"),
  genSelectionHint: $("#genSelectionHint"),
  apiProvider: $("#apiProvider"),
  apiBaseUrl: $("#apiBaseUrl"),
  apiKey: $("#apiKey"),
  apiModel: $("#apiModel"),
  apiTemperature: $("#apiTemperature"),
  apiFormat: $("#apiFormat"),
  apiProviderHint: $("#apiProviderHint"),
  githubOwner: $("#githubOwner"),
  githubRepo: $("#githubRepo"),
  githubBranch: $("#githubBranch"),
  githubPath: $("#githubPath"),
  githubToken: $("#githubToken"),
  syncStatus: $("#syncStatus"),
  toast: $("#toast"),
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const d = new Date(`${dateString || today()}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function uid() {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTags(value) {
  return String(value || "")
    .split(/[,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2300);
}

function loadEntries() {
  try {
    state.entries = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
  } catch {
    state.entries = [];
  }
}

function saveEntries() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.entries));
  render();
}

function setSyncStatus(text) {
  if (els.syncStatus) els.syncStatus.textContent = text;
}

function entryTime(entry) {
  return Date.parse(entry.updatedAt || entry.createdAt || `${entry.date || today()}T00:00:00`) || 0;
}

function mergeEntries(primary, fallback) {
  const byId = new Map();
  [...fallback, ...primary].forEach((entry) => {
    if (!entry?.id) return;
    const old = byId.get(entry.id);
    if (!old || entryTime(entry) >= entryTime(old)) byId.set(entry.id, entry);
  });
  return [...byId.values()].sort((a, b) => entryTime(b) - entryTime(a));
}

function fingerprint(entries) {
  return JSON.stringify(entries.map((entry) => [entry.id, entry.updatedAt, entry.date, entry.nextReviewDate]));
}

async function syncFromServer({ initial = false, silent = true } = {}) {
  if (githubConfigured()) {
    try {
      await syncFromGitHub({ initial, silent });
    } catch (error) {
      setSyncStatus("GitHub 同步失败，本机临时保存");
      if (!silent) toast(error.message);
    }
    return;
  }
  if (!SERVER_SYNC) {
    setSyncStatus("当前为文件模式，仅本机浏览器保存");
    return;
  }
  try {
    const response = await fetch("/api/entries", { cache: "no-store" });
    if (!response.ok) throw new Error(`同步服务返回 ${response.status}`);
    const data = await response.json();
    const serverEntries = Array.isArray(data.entries) ? data.entries : [];
    const nextEntries = initial ? mergeEntries(serverEntries, state.entries) : serverEntries;
    if (initial && fingerprint(nextEntries) !== fingerprint(serverEntries)) {
      await syncReplaceEntries(nextEntries, { silent: true });
    }
    if (fingerprint(nextEntries) !== fingerprint(state.entries)) {
      state.entries = nextEntries;
      localStorage.setItem(STORE_KEY, JSON.stringify(state.entries));
      render();
      if (!silent) toast("已同步最新记录");
    }
    setSyncStatus(`已同步 · ${state.entries.length} 条`);
  } catch (error) {
    setSyncStatus("同步服务未连接，本机临时保存");
    if (!silent) toast(error.message);
  }
}

function handleSyncError(error) {
  console.warn(error);
  setSyncStatus("同步失败，本机已临时保存");
}

function backgroundSync(promise) {
  if (!SERVER_SYNC) return;
  promise.catch(handleSyncError);
}

async function syncUpsertEntry(entry) {
  if (githubConfigured()) {
    if (!githubWritable()) throw new Error("GitHub 写入需要 token");
    await githubWriteEntries(state.entries);
    setSyncStatus(`GitHub 已同步 · ${state.entries.length} 条`);
    return;
  }
  if (!SERVER_SYNC) return;
  const response = await fetch(`/api/entries/${encodeURIComponent(entry.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...entry, createdBy: "web" }),
  });
  if (!response.ok) throw new Error(await response.text());
  setSyncStatus(`已同步 · ${state.entries.length} 条`);
}

async function syncPostEntries(entries) {
  if (githubConfigured()) {
    if (!githubWritable()) throw new Error("GitHub 写入需要 token");
    await githubWriteEntries(state.entries);
    setSyncStatus(`GitHub 已同步 · ${state.entries.length} 条`);
    return;
  }
  if (!SERVER_SYNC) return;
  const response = await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries: entries.map((entry) => ({ ...entry, createdBy: "web" })) }),
  });
  if (!response.ok) throw new Error(await response.text());
  setSyncStatus(`已同步 · ${state.entries.length} 条`);
}

async function syncDeleteEntry(id) {
  if (githubConfigured()) {
    if (!githubWritable()) throw new Error("GitHub 写入需要 token");
    await githubWriteEntries(state.entries);
    setSyncStatus(`GitHub 已同步 · ${state.entries.length} 条`);
    return;
  }
  if (!SERVER_SYNC) return;
  const response = await fetch(`/api/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
  setSyncStatus(`已同步 · ${state.entries.length} 条`);
}

async function syncReplaceEntries(entries, { silent = false } = {}) {
  if (githubConfigured()) {
    if (!githubWritable()) throw new Error("GitHub 写入需要 token");
    await githubWriteEntries(entries);
    setSyncStatus(`GitHub 已同步 · ${entries.length} 条`);
    if (!silent) toast("GitHub 数据已更新");
    return;
  }
  if (!SERVER_SYNC) return;
  const response = await fetch("/api/entries", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  if (!response.ok) throw new Error(await response.text());
  setSyncStatus(`已同步 · ${entries.length} 条`);
  if (!silent) toast("服务端数据已更新");
}

function loadSettings() {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    settings = {};
  }
  const provider = settings.provider || inferProvider(settings.baseUrl);
  els.apiProvider.value = provider;
  els.apiBaseUrl.value = settings.baseUrl || AI_PROVIDERS[provider]?.baseUrl || AI_PROVIDERS.openai.baseUrl;
  els.apiKey.value = settings.apiKey || "";
  els.apiModel.value = settings.model || AI_PROVIDERS[provider]?.model || "";
  els.apiTemperature.value = settings.temperature ?? "0.4";
  els.apiFormat.value = settings.format || "openai";
  updateProviderHint();
}

function getSettings() {
  return {
    provider: els.apiProvider.value,
    baseUrl: els.apiBaseUrl.value.trim().replace(/\/+$/, ""),
    apiKey: els.apiKey.value.trim(),
    model: els.apiModel.value.trim(),
    temperature: Number(els.apiTemperature.value || 0.4),
    format: els.apiFormat.value,
  };
}

function saveSettings() {
  const settings = getSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  toast("AI 设置已保存");
}

function inferProvider(baseUrl = "") {
  const url = String(baseUrl || "");
  if (url.includes("generativelanguage.googleapis.com")) return "gemini";
  if (url.includes("moonshot.ai") || url.includes("moonshot.cn")) return "kimi";
  if (url.includes("deepseek.com")) return "deepseek";
  if (url.includes("openai.com")) return "openai";
  return "openai";
}

function updateProviderHint() {
  const provider = AI_PROVIDERS[els.apiProvider.value] || AI_PROVIDERS.custom;
  els.apiProviderHint.textContent = provider.hint;
}

function applyProviderPreset({ force = false } = {}) {
  const provider = AI_PROVIDERS[els.apiProvider.value] || AI_PROVIDERS.custom;
  if (provider.baseUrl && (force || !els.apiBaseUrl.value.trim())) els.apiBaseUrl.value = provider.baseUrl;
  if (provider.model && (force || !els.apiModel.value.trim())) els.apiModel.value = provider.model;
  if (els.apiProvider.value === "kimi" && (force || !els.apiTemperature.value || Number(els.apiTemperature.value) < 0.1)) {
    els.apiTemperature.value = "0.6";
  }
  updateProviderHint();
}

function loadGitHubSettings() {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(GITHUB_SYNC_KEY) || "{}");
  } catch {
    settings = {};
  }
  if (!els.githubOwner) return;
  els.githubOwner.value = settings.owner || "Chanhao";
  els.githubRepo.value = settings.repo || "dudu-errorbook-data";
  els.githubBranch.value = settings.branch || "main";
  els.githubPath.value = settings.path || "data/entries.json";
  els.githubToken.value = settings.token || "";
}

function getGitHubSettings() {
  return {
    owner: els.githubOwner?.value.trim() || "",
    repo: els.githubRepo?.value.trim() || "",
    branch: els.githubBranch?.value.trim() || "main",
    path: els.githubPath?.value.trim() || "data/entries.json",
    token: els.githubToken?.value.trim() || "",
  };
}

function saveGitHubSettings() {
  const settings = getGitHubSettings();
  localStorage.setItem(GITHUB_SYNC_KEY, JSON.stringify(settings));
  toast("GitHub 同步设置已保存");
  syncFromServer({ initial: true, silent: false });
}

function githubConfigured() {
  const settings = getGitHubSettings();
  return Boolean(settings.owner && settings.repo && settings.path && settings.token);
}

function githubWritable() {
  return githubConfigured();
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(text) {
  const clean = String(text || "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function githubFileUrl(settings) {
  const filePath = settings.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${filePath}`;
}

function githubHeaders(settings) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (settings.token) headers.Authorization = `Bearer ${settings.token}`;
  return headers;
}

async function githubReadEntries() {
  const settings = getGitHubSettings();
  if (!settings.owner || !settings.repo || !settings.path) {
    throw new Error("请先填写 GitHub owner、repo 和 data path。");
  }
  const response = await fetch(`${githubFileUrl(settings)}?ref=${encodeURIComponent(settings.branch)}`, {
    headers: githubHeaders(settings),
    cache: "no-store",
  });
  if (response.status === 404) {
    state.githubSha = "";
    return { entries: [], sha: "" };
  }
  if (!response.ok) throw new Error(`GitHub 读取失败：${response.status}`);
  const data = await response.json();
  state.githubSha = data.sha || "";
  const text = decodeBase64(data.content || "");
  const parsed = JSON.parse(text || "[]");
  const entries = Array.isArray(parsed) ? parsed : parsed.entries || [];
  await hydrateGitHubImages(entries, settings);
  return { entries, sha: state.githubSha };
}

async function githubWriteEntries(entries, { retry = true } = {}) {
  const settings = getGitHubSettings();
  if (!githubWritable()) throw new Error("GitHub 写入需要填写 token。");
  const body = {
    message: `Update Dudu errorbook entries ${new Date().toISOString()}`,
    content: encodeBase64(`${JSON.stringify(entriesForRemote(entries), null, 2)}\n`),
    branch: settings.branch,
  };
  if (state.githubSha) body.sha = state.githubSha;
  const response = await fetch(githubFileUrl(settings), {
    method: "PUT",
    headers: { ...githubHeaders(settings), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 409 && retry) {
    const remote = await githubReadEntries();
    const merged = mergeEntries(entries, remote.entries);
    return githubWriteEntries(merged, { retry: false });
  }
  if (!response.ok) throw new Error(`GitHub 写入失败：${response.status} ${(await response.text()).slice(0, 160)}`);
  const data = await response.json();
  state.githubSha = data.content?.sha || "";
  return entries;
}

async function hydrateGitHubImages(entries, settings) {
  const imageEntries = entries.filter((entry) => entry.imagePath && !entry.imageDataUrl && !entry.resolvedImageDataUrl).slice(0, 80);
  await Promise.all(
    imageEntries.map(async (entry) => {
      try {
        const filePath = entry.imagePath
          .split("/")
          .map((part) => encodeURIComponent(part))
          .join("/");
        const url = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${filePath}?ref=${encodeURIComponent(settings.branch)}`;
        const response = await fetch(url, { headers: githubHeaders(settings), cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const mime = entry.imageMimeType || "image/jpeg";
        entry.resolvedImageDataUrl = `data:${mime};base64,${String(data.content || "").replace(/\s/g, "")}`;
      } catch {
        entry.resolvedImageDataUrl = "";
      }
    }),
  );
}

async function syncFromGitHub({ initial = false, silent = true } = {}) {
  const remote = await githubReadEntries();
  const nextEntries = initial ? mergeEntries(remote.entries, state.entries) : remote.entries;
  if (initial && githubWritable() && fingerprint(nextEntries) !== fingerprint(remote.entries)) {
    await githubWriteEntries(nextEntries);
  }
  if (fingerprint(nextEntries) !== fingerprint(state.entries)) {
    state.entries = nextEntries;
    localStorage.setItem(STORE_KEY, JSON.stringify(state.entries));
    render();
    if (!silent) toast("已从 GitHub 同步");
  }
  setSyncStatus(`GitHub 已同步 · ${state.entries.length} 条`);
}

async function testGitHubSync() {
  saveGitHubSettings();
  try {
    await syncFromGitHub({ initial: true, silent: false });
    toast(githubWritable() ? "GitHub 读写配置可用" : "GitHub 读取可用，写入需 token");
  } catch (error) {
    toast(error.message);
  }
}

function setView(view) {
  state.view = view;
  $$(".nav-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  $$(".view").forEach((section) => section.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  const titles = {
    capture: "记录一个错误",
    library: "错题库",
    review: "复习与归纳",
    generate: "AI 生成练习",
    settings: "设置",
  };
  els.viewTitle.textContent = titles[view] || "嘟嘟错题本";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateSubject(value) {
  state.selectedSubject = value;
  $$("#subjectGroup button").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.value === value);
  });
  const defaults = {
    语文: "错字/别字",
    数学: "计算错误",
    英文: "英语单词",
    其他: "其他",
  };
  els.errorType.value = defaults[value] || "其他";
}

function getFormEntry() {
  const now = new Date().toISOString();
  const id = els.entryId.value || uid();
  const old = state.entries.find((entry) => entry.id === id);
  const date = els.entryDate.value || today();
  return {
    id,
    subject: state.selectedSubject,
    errorType: els.errorType.value,
    source: els.source.value.trim(),
    wrongText: els.wrongText.value.trim(),
    correctText: els.correctText.value.trim(),
    reason: els.reason.value.trim(),
    tags: normalizeTags(els.tags.value),
    date,
    imageDataUrl: state.imageDataUrl || "",
    reviewLevel: old?.reviewLevel || 0,
    nextReviewDate: old?.nextReviewDate || date,
    createdAt: old?.createdAt || now,
    updatedAt: now,
  };
}

function clearForm(keepSubject = true) {
  const subject = state.selectedSubject;
  els.entryId.value = "";
  els.entryForm.reset();
  els.entryDate.value = today();
  state.imageDataUrl = "";
  els.imagePreview.hidden = true;
  els.previewImg.removeAttribute("src");
  updateSubject(keepSubject ? subject : "语文");
}

function saveFormEntry(event) {
  event.preventDefault();
  const entry = getFormEntry();
  if (!entry.wrongText && !entry.correctText && !entry.imageDataUrl) {
    toast("至少填写错题、答案或拍一张图");
    return;
  }
  const index = state.entries.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    state.entries[index] = entry;
    toast("记录已更新");
  } else {
    state.entries.unshift(entry);
    toast("记录已保存");
  }
  saveEntries();
  backgroundSync(syncUpsertEntry(entry));
  clearForm();
}

function editEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  setView("capture");
  els.entryId.value = entry.id;
  updateSubject(entry.subject);
  els.errorType.value = entry.errorType;
  els.source.value = entry.source || "";
  els.wrongText.value = entry.wrongText || "";
  els.correctText.value = entry.correctText || "";
  els.reason.value = entry.reason || "";
  els.tags.value = (entry.tags || []).join(", ");
  els.entryDate.value = entry.date || today();
  state.imageDataUrl = entry.imageDataUrl || "";
  if (state.imageDataUrl) {
    els.previewImg.src = state.imageDataUrl;
    els.imagePreview.hidden = false;
  } else {
    els.imagePreview.hidden = true;
  }
}

function deleteEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  if (!window.confirm("确认删除这条记录？")) return;
  state.entries = state.entries.filter((item) => item.id !== id);
  state.practiceSelection.delete(id);
  saveEntries();
  backgroundSync(syncDeleteEntry(id));
  toast("记录已删除");
}

function reviewEntry(id, score) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  const nextLevel = score <= 1 ? 1 : Math.min((entry.reviewLevel || 0) + score, REVIEW_INTERVALS.length - 1);
  entry.reviewLevel = nextLevel;
  entry.nextReviewDate = addDays(today(), REVIEW_INTERVALS[nextLevel]);
  entry.updatedAt = new Date().toISOString();
  saveEntries();
  backgroundSync(syncUpsertEntry(entry));
  toast("已安排下次复习");
}

function filteredEntries() {
  const q = els.searchInput.value.trim().toLowerCase();
  const subject = els.subjectFilter.value;
  const type = els.typeFilter.value;
  return state.entries.filter((entry) => {
    if (subject && entry.subject !== subject) return false;
    if (type && entry.errorType !== type) return false;
    if (!q) return true;
    const haystack = [
      entry.subject,
      entry.errorType,
      entry.source,
      entry.wrongText,
      entry.correctText,
      entry.reason,
      ...(entry.tags || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function dueEntries() {
  return state.entries
    .filter((entry) => (entry.nextReviewDate || entry.date || today()) <= today())
    .sort((a, b) => (a.nextReviewDate || a.date).localeCompare(b.nextReviewDate || b.date));
}

function renderStats() {
  const weekStart = daysAgo(7);
  const due = dueEntries();
  const tagCounts = new Map();
  state.entries.forEach((entry) => {
    [entry.errorType, ...(entry.tags || [])].filter(Boolean).forEach((tag) => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  const hot = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  els.statTotal.textContent = state.entries.length;
  els.statWeek.textContent = state.entries.filter((entry) => entry.date >= weekStart).length;
  els.statDue.textContent = due.length;
  els.statHot.textContent = hot ? hot[0] : "-";
}

function entryCard(entry, compact = false) {
  const text = escapeHtml(entry.wrongText || entry.correctText || "图片记录");
  const selected = state.practiceSelection.has(entry.id);
  const selector = compact
    ? ""
    : `<label class="practice-select-label" title="勾选后可在 AI 出题中只针对这条错题生成练习">
        <input class="practice-select" type="checkbox" data-id="${escapeHtml(entry.id)}" ${selected ? "checked" : ""} />
        <span>出题</span>
      </label>`;
  const tags = [entry.subject, entry.errorType, ...(entry.tags || [])]
    .filter(Boolean)
    .map((tag, index) => `<span class="tag ${index === 0 ? "subject-chip" : ""}">${escapeHtml(tag)}</span>`)
    .join("");
  const imageSrc = entryImageSrc(entry);
  const image = imageSrc && !compact ? `<img class="thumb" src="${imageSrc}" alt="题目图片" />` : "";
  return `
    <article class="entry-card" data-id="${entry.id}">
      <header>
        <div>
          <h4 class="entry-title">${text}</h4>
          <div class="meta">${escapeHtml(entry.date || "")} · ${escapeHtml(entry.source || "未填写来源")} · 下次复习 ${escapeHtml(entry.nextReviewDate || entry.date || today())}</div>
        </div>
        ${selector}
      </header>
      ${image}
      ${entry.correctText ? `<div><strong>正确：</strong>${escapeHtml(entry.correctText)}</div>` : ""}
      ${entry.reason && !compact ? `<div><strong>原因：</strong>${escapeHtml(entry.reason)}</div>` : ""}
      <div class="tag-row">${tags}</div>
      <div class="card-actions">
        <button class="mini-button" type="button" data-action="edit" data-id="${entry.id}">编辑</button>
        <button class="mini-button" type="button" data-action="review-ok" data-id="${entry.id}">会了</button>
        <button class="mini-button" type="button" data-action="review-hard" data-id="${entry.id}">还不熟</button>
        <button class="mini-button" type="button" data-action="delete" data-id="${entry.id}">删除</button>
      </div>
    </article>
  `;
}

function renderRecent() {
  const recent = state.entries.slice(0, 6);
  els.recentList.innerHTML = recent.length
    ? recent.map((entry) => entryCard(entry, true)).join("")
    : `<div class="empty">还没有记录。先保存一条错题或错字。</div>`;
}

function renderLibrary() {
  const entries = filteredEntries();
  els.libraryList.innerHTML = entries.length
    ? entries.map((entry) => entryCard(entry)).join("")
    : `<div class="empty">没有找到符合条件的记录。</div>`;
  updatePracticeSelectionUI();
}

function updatePracticeSelectionUI() {
  const validIds = new Set(state.entries.map((entry) => entry.id));
  state.practiceSelection = new Set([...state.practiceSelection].filter((id) => validIds.has(id)));
  const count = state.practiceSelection.size;
  if (els.selectedPracticeCount) els.selectedPracticeCount.textContent = `已勾选 ${count} 条`;
  if (els.genSelectionHint) {
    els.genSelectionHint.textContent = count
      ? `当前已勾选 ${count} 条错题。选择“仅使用错题库里勾选的错题”即可针对它们出题。`
      : "需要针对某一条错题出题时，先到“错题库”勾选它，再回到这里生成。";
  }
}

function renderReview() {
  const due = dueEntries();
  els.reviewQueue.innerHTML = due.length
    ? due
        .map(
          (entry) => `
          <article class="entry-card">
            <h4 class="entry-title">${escapeHtml(entry.wrongText || entry.correctText || "图片记录")}</h4>
            <div class="meta">${escapeHtml(entry.subject)} · ${escapeHtml(entry.errorType)} · ${escapeHtml(entry.source || "未填写来源")}</div>
            ${entry.correctText ? `<div><strong>正确：</strong>${escapeHtml(entry.correctText)}</div>` : ""}
            ${entry.reason ? `<div><strong>提醒：</strong>${escapeHtml(entry.reason)}</div>` : ""}
            <div class="review-score">
              <button type="button" data-action="review-score" data-score="1" data-id="${entry.id}">不会</button>
              <button type="button" data-action="review-score" data-score="2" data-id="${entry.id}">有点熟</button>
              <button type="button" data-action="review-score" data-score="3" data-id="${entry.id}">会了</button>
            </div>
          </article>
        `,
        )
        .join("")
    : `<div class="empty">今天没有待复习记录。</div>`;
  renderInsights();
}

function renderInsights() {
  const counts = new Map();
  state.entries.forEach((entry) => {
    const key = `${entry.subject} · ${entry.errorType}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const items = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  els.insightList.innerHTML = items.length
    ? items
        .map(
          ([label, count]) => `
          <div class="entry-card">
            <strong>${escapeHtml(label)}</strong>
            <div class="meta">${count} 条记录</div>
          </div>
        `,
        )
        .join("")
    : `<div class="empty">记录多一点后，这里会显示薄弱点。</div>`;
}

function renderTypeOptions() {
  const current = els.typeFilter.value;
  const types = [...new Set(state.entries.map((entry) => entry.errorType).filter(Boolean))].sort();
  els.typeFilter.innerHTML = `<option value="">全部类型</option>${types.map((type) => `<option>${escapeHtml(type)}</option>`).join("")}`;
  els.typeFilter.value = types.includes(current) ? current : "";
}

function render() {
  renderStats();
  renderTypeOptions();
  renderRecent();
  if (state.view === "library") renderLibrary();
  if (state.view === "review") renderReview();
  updatePracticeSelectionUI();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compactEntries(entries) {
  return entries.map((entry) => ({
    日期: entry.date,
    学科: entry.subject,
    类型: entry.errorType,
    来源: entry.source,
    错误: entry.wrongText,
    正确: entry.correctText,
    原因: entry.reason,
    标签: entry.tags,
  }));
}

function entryImageSrc(entry) {
  return entry.imageDataUrl || entry.resolvedImageDataUrl || "";
}

function entriesForRemote(entries) {
  return entries.map(({ resolvedImageDataUrl, ...entry }) => entry);
}

function aiConfigured() {
  const settings = getSettings();
  return Boolean(settings.baseUrl && settings.apiKey && settings.model);
}

function chatCompletionsUrl(settings) {
  const baseUrl = settings.baseUrl.replace(/\/+$/, "");
  return `${baseUrl}/chat/completions`;
}

function normalizeAiBody(settings, body) {
  if (settings.provider === "kimi" && /^kimi-k2\./i.test(settings.model)) {
    const temp = Number(body.temperature);
    body.temperature = temp >= 0.9 ? 1 : 0.6;
  }
  return body;
}

async function callAi(messages, { json = false } = {}) {
  const settings = getSettings();
  if (!settings.baseUrl || !settings.apiKey || !settings.model) {
    throw new Error("请先在设置里填写 Base URL、API Key 和模型名。");
  }
  const body = {
    model: settings.model,
    messages,
    temperature: settings.temperature,
  };
  if (json) {
    body.response_format = { type: "json_object" };
  }
  normalizeAiBody(settings, body);
  const response = await fetch(chatCompletionsUrl(settings), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API 调用失败：${response.status} ${text.slice(0, 240)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function parseAiJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : raw);
}

async function aiClassifyCurrent() {
  const entry = getFormEntry();
  if (!entry.wrongText && !entry.correctText && !entry.imageDataUrl) {
    toast("先输入错题或拍照");
    return;
  }
  toast("正在调用 AI 分类...");
  const content = [
    {
      type: "text",
      text: `请帮一名即将升二年级的小学生错题记录做结构化补全。只返回 JSON：{"errorType":"","reason":"","tags":[""]}。记录：${JSON.stringify(compactEntries([entry])[0])}`,
    },
  ];
  if (entry.imageDataUrl) {
    content.push({ type: "image_url", image_url: { url: entry.imageDataUrl } });
  }
  try {
    const result = await callAi(
      [
        { role: "system", content: "你是小学低年级错题分析助手，分类要简洁，原因要适合家长快速记录。" },
        { role: "user", content },
      ],
      { json: true },
    );
    const parsed = parseAiJson(result);
    if (parsed.errorType) els.errorType.value = parsed.errorType;
    if (parsed.reason) els.reason.value = parsed.reason;
    if (Array.isArray(parsed.tags)) els.tags.value = parsed.tags.join(", ");
    toast("AI 分类已填入");
  } catch (error) {
    toast(error.message);
  }
}

async function aiExtractFromPhoto({ auto = false } = {}) {
  if (!state.imageDataUrl) {
    if (!auto) toast("请先拍照或上传图片");
    return;
  }
  if (auto && !aiConfigured()) {
    toast("照片已上传；配置 AI 后可自动识别");
    return;
  }
  toast(auto ? "照片已上传，正在自动识别..." : "正在识别照片...");
  try {
    const result = await callAi(
      [
        {
          role: "system",
          content:
            "你是小学低年级作业照片识别助手。尽量从图片中提取错题或错字，判断学科、错误类型、学生写错的内容、正确答案和错因。只返回 JSON。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                '请识别这张作业照片。只返回 JSON：{"subject":"语文/数学/英文/其他","errorType":"","wrongText":"","correctText":"","reason":"","tags":[""]}。如果无法确定正确答案，也要尽量说明需要家长补充。',
            },
            { type: "image_url", image_url: { url: state.imageDataUrl } },
          ],
        },
      ],
      { json: true },
    );
    const parsed = parseAiJson(result);
    if (parsed.subject) updateSubject(parsed.subject);
    if (parsed.errorType) els.errorType.value = parsed.errorType;
    if (parsed.wrongText) els.wrongText.value = parsed.wrongText;
    if (parsed.correctText) els.correctText.value = parsed.correctText;
    if (parsed.reason) els.reason.value = parsed.reason;
    if (Array.isArray(parsed.tags)) els.tags.value = parsed.tags.join(", ");
    toast(auto ? "已自动识别，可检查后保存" : "照片内容已识别");
  } catch (error) {
    toast(auto ? `自动识别失败，可手动填写：${error.message}` : error.message);
  }
}

async function aiSummary() {
  const entries = state.entries.slice(0, 80);
  if (!entries.length) {
    toast("还没有可归纳的记录");
    return;
  }
  els.summaryOutput.hidden = false;
  els.summaryOutput.textContent = "正在归纳...";
  try {
    const result = await callAi([
      { role: "system", content: "你是小学低年级学习诊断助手。输出要短，面向家长，给出可执行复习建议。" },
      {
        role: "user",
        content: `基于这些错题记录，归纳嘟嘟最近最需要巩固的 3-5 个薄弱点，并给出每个薄弱点的家庭练习建议。\n${JSON.stringify(compactEntries(entries), null, 2)}`,
      },
    ]);
    els.summaryOutput.textContent = result;
  } catch (error) {
    els.summaryOutput.textContent = error.message;
  }
}

async function generatePractice() {
  const subject = $("#genSubject").value;
  const range = Number($("#genRange").value);
  const since = range > 0 ? daysAgo(range) : "";
  const sourceMode = els.genSource.value;
  const entries =
    sourceMode === "selected"
      ? state.entries.filter((entry) => state.practiceSelection.has(entry.id)).slice(0, 30)
      : state.entries.filter((entry) => (!subject || entry.subject === subject) && (!since || entry.date >= since)).slice(0, 80);
  if (!entries.length) {
    toast(sourceMode === "selected" ? "请先在错题库勾选要出题的错题" : "当前范围没有错题记录");
    return;
  }
  const count = Number($("#genCount").value || 10);
  const mode = $("#genMode").value;
  const extra = $("#genExtra").value.trim();
  const scopeText =
    sourceMode === "selected"
      ? `已勾选的 ${entries.length} 条错题${entries.length === 1 ? "，请重点围绕这一条做同类变式和小测" : ""}`
      : `${subject || "全部学科"}，${range > 0 ? `最近 ${range} 天` : "全部记录"}`;
  els.generateOutput.textContent = "正在生成练习...";
  try {
    const result = await callAi([
      {
        role: "system",
        content:
          "你是小学一升二阶段的家庭练习出题助手。题目要贴近错因，不要超纲；先给题目，再给答案与简短讲解；中文排版清晰，适合打印。",
      },
      {
        role: "user",
        content: `请根据以下错题记录生成${count}题「${mode}」。出题依据：${scopeText}。额外要求：${extra || "无"}。\n错题记录：\n${JSON.stringify(compactEntries(entries), null, 2)}`,
      },
    ]);
    els.generateOutput.textContent = result;
  } catch (error) {
    els.generateOutput.textContent = error.message;
  }
}

function exportJson() {
  downloadFile(`dudu-errorbook-${today()}.json`, JSON.stringify({ version: 1, entries: state.entries }, null, 2), "application/json");
}

function exportMarkdown() {
  const lines = ["# 嘟嘟错题本", "", `导出日期：${today()}`, ""];
  state.entries.forEach((entry, index) => {
    lines.push(`## ${index + 1}. ${entry.date} ${entry.subject} ${entry.errorType}`);
    if (entry.source) lines.push(`- 来源：${entry.source}`);
    if (entry.wrongText) lines.push(`- 错误：${entry.wrongText}`);
    if (entry.correctText) lines.push(`- 正确：${entry.correctText}`);
    if (entry.reason) lines.push(`- 原因：${entry.reason}`);
    if (entry.tags?.length) lines.push(`- 标签：${entry.tags.join(", ")}`);
    lines.push("");
  });
  downloadFile(`dudu-errorbook-${today()}.md`, lines.join("\n"), "text/markdown");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function importJson(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const entries = Array.isArray(data) ? data : data.entries;
    if (!Array.isArray(entries)) throw new Error("不是有效的错题本 JSON");
    state.entries = entries;
    saveEntries();
    backgroundSync(syncReplaceEntries(state.entries));
    toast("数据已导入");
  } catch (error) {
    toast(error.message);
  }
}

function addSampleData() {
  const sample = [
    {
      id: uid(),
      subject: "语文",
      errorType: "错字/别字",
      source: "暑假预习",
      wrongText: "把“已经”写成“以经”",
      correctText: "已经",
      reason: "形近音近词混淆，需要放到句子里记。",
      tags: ["常用词", "形近字"],
      date: today(),
      imageDataUrl: "",
      reviewLevel: 0,
      nextReviewDate: today(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uid(),
      subject: "数学",
      errorType: "计算错误",
      source: "口算练习",
      wrongText: "36 + 17 = 43",
      correctText: "36 + 17 = 53",
      reason: "个位进位后十位没有加 1。",
      tags: ["进位加法", "口算"],
      date: today(),
      imageDataUrl: "",
      reviewLevel: 0,
      nextReviewDate: today(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  state.entries = [...sample, ...state.entries];
  saveEntries();
  backgroundSync(syncPostEntries(sample));
  toast("示例已加入");
}

function bindEvents() {
  $$(".nav-tab").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
  $$("#subjectGroup button").forEach((btn) => btn.addEventListener("click", () => updateSubject(btn.dataset.value)));
  els.entryForm.addEventListener("submit", saveFormEntry);
  $("#clearFormBtn").addEventListener("click", () => clearForm());
  $("#copyLastSourceBtn").addEventListener("click", () => {
    const last = state.entries[0];
    if (last?.source) {
      els.source.value = last.source;
      toast("已沿用最近来源");
    }
  });
  els.imageInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.imageDataUrl = await readImageAsDataUrl(file);
    els.previewImg.src = state.imageDataUrl;
    els.imagePreview.hidden = false;
    await aiExtractFromPhoto({ auto: true });
  });
  $("#removeImageBtn").addEventListener("click", () => {
    state.imageDataUrl = "";
    els.imageInput.value = "";
    els.imagePreview.hidden = true;
  });
  $("#aiExtractBtn").addEventListener("click", aiExtractFromPhoto);
  $("#aiClassifyBtn").addEventListener("click", aiClassifyCurrent);
  $("#aiSummaryBtn").addEventListener("click", aiSummary);
  $("#generateBtn").addEventListener("click", generatePractice);
  els.genSource.addEventListener("change", updatePracticeSelectionUI);
  els.clearPracticeSelectionBtn.addEventListener("click", () => {
    state.practiceSelection.clear();
    renderLibrary();
    updatePracticeSelectionUI();
  });
  els.apiProvider.addEventListener("change", () => applyProviderPreset({ force: true }));
  $("#saveSettingsBtn").addEventListener("click", saveSettings);
  $("#testApiBtn").addEventListener("click", testApi);
  $("#saveGitHubBtn").addEventListener("click", saveGitHubSettings);
  $("#testGitHubBtn").addEventListener("click", testGitHubSync);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#exportMdBtn").addEventListener("click", exportMarkdown);
  $("#importJsonInput").addEventListener("change", (event) => importJson(event.target.files?.[0]));
  $("#sampleDataBtn").addEventListener("click", addSampleData);
  $("#wipeDataBtn").addEventListener("click", () => {
    if (!window.confirm("确认清空全部错题记录？建议先导出备份。")) return;
    state.entries = [];
    saveEntries();
    backgroundSync(syncReplaceEntries([]));
    toast("数据已清空");
  });
  $("#copyOutputBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(els.generateOutput.textContent);
    toast("已复制");
  });
  $("#printOutputBtn").addEventListener("click", () => window.print());
  [els.searchInput, els.subjectFilter, els.typeFilter].forEach((el) => el.addEventListener("input", renderLibrary));
  document.body.addEventListener("click", handleDelegatedClick);
  document.body.addEventListener("change", handleDelegatedChange);
}

function handleDelegatedClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === "edit") editEntry(id);
  if (action === "delete") deleteEntry(id);
  if (action === "review-ok") reviewEntry(id, 3);
  if (action === "review-hard") reviewEntry(id, 1);
  if (action === "review-score") reviewEntry(id, Number(button.dataset.score || 1));
}

function handleDelegatedChange(event) {
  const checkbox = event.target.closest(".practice-select");
  if (!checkbox) return;
  const id = checkbox.dataset.id;
  if (!id) return;
  if (checkbox.checked) state.practiceSelection.add(id);
  else state.practiceSelection.delete(id);
  updatePracticeSelectionUI();
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 900 * 1024) {
          resolve(reader.result);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function testApi() {
  saveSettings();
  toast("正在测试 API...");
  try {
    const result = await callAi([
      { role: "system", content: "你只需要简短回答。" },
      { role: "user", content: "回复：错题本 API 测试成功" },
    ]);
    toast(result.slice(0, 80) || "API 测试成功");
  } catch (error) {
    toast(error.message);
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function init() {
  loadEntries();
  loadSettings();
  loadGitHubSettings();
  bindEvents();
  clearForm();
  render();
  syncFromServer({ initial: true });
  window.setInterval(() => syncFromServer({ silent: true }), 6000);
  registerServiceWorker();
  window.addEventListener("load", () => {
    if (window.lucide) window.lucide.createIcons();
  });
}

init();
