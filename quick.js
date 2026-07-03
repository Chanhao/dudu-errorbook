const SETTINGS_KEY = "dudu-errorbook:github-sync";
const $ = (selector) => document.querySelector(selector);

const els = {
  setupPanel: $("#setupPanel"),
  modeGrid: $("#modeGrid"),
  entryForm: $("#entryForm"),
  formTitle: $("#formTitle"),
  photoField: $("#photoField"),
  photoInput: $("#photoInput"),
  previewImg: $("#previewImg"),
  subject: $("#subject"),
  errorType: $("#errorType"),
  wrongText: $("#wrongText"),
  correctText: $("#correctText"),
  reason: $("#reason"),
  source: $("#source"),
  tags: $("#tags"),
  githubOwner: $("#githubOwner"),
  githubRepo: $("#githubRepo"),
  githubBranch: $("#githubBranch"),
  githubToken: $("#githubToken"),
  status: $("#status"),
};

const state = {
  mode: "",
  photoDataUrl: "",
};

function status(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

function loadSettings() {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    settings = {};
  }
  els.githubOwner.value = settings.owner || "Chanhao";
  els.githubRepo.value = settings.repo || "dudu-errorbook-data";
  els.githubBranch.value = settings.branch || "main";
  els.githubToken.value = settings.token || "";
  els.setupPanel.hidden = Boolean(settings.owner && settings.repo && settings.token);
}

function getSettings() {
  return {
    owner: els.githubOwner.value.trim(),
    repo: els.githubRepo.value.trim(),
    branch: els.githubBranch.value.trim() || "main",
    path: "data/entries.json",
    token: els.githubToken.value.trim(),
  };
}

function saveSettings() {
  const settings = getSettings();
  if (!settings.owner || !settings.repo || !settings.token) {
    status("请填写 Owner、Repo 和 Token", true);
    return;
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  els.setupPanel.hidden = true;
  status("设置已保存");
}

function uid() {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function normalizeTags(value) {
  return String(value || "")
    .split(/[,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
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
  const binary = atob(String(text || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function headers(settings) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${settings.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function contentUrl(settings, filePath) {
  const path = filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${path}`;
}

async function readEntries(settings) {
  const response = await fetch(`${contentUrl(settings, settings.path)}?ref=${encodeURIComponent(settings.branch)}`, {
    headers: headers(settings),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`读取数据失败：${response.status}`);
  const data = await response.json();
  return {
    sha: data.sha,
    entries: JSON.parse(decodeBase64(data.content || "") || "[]"),
  };
}

async function writeFile(settings, filePath, contentBase64, message, sha = "") {
  const body = { message, content: contentBase64, branch: settings.branch };
  if (sha) body.sha = sha;
  const response = await fetch(contentUrl(settings, filePath), {
    method: "PUT",
    headers: { ...headers(settings), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`写入失败：${response.status} ${(await response.text()).slice(0, 160)}`);
  return response.json();
}

async function uploadPhoto(settings) {
  if (!state.photoDataUrl) return { imagePath: "", imageMimeType: "" };
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const imagePath = `images/${stamp}-${Math.floor(1000 + Math.random() * 9000)}.jpg`;
  const content = state.photoDataUrl.split(",")[1];
  await writeFile(settings, imagePath, content, "Upload Dudu homework photo");
  return { imagePath, imageMimeType: "image/jpeg" };
}

async function saveEntry(event) {
  event.preventDefault();
  const settings = getSettings();
  if (!settings.owner || !settings.repo || !settings.token) {
    els.setupPanel.hidden = false;
    status("请先保存 GitHub 设置", true);
    return;
  }
  if (state.mode === "photo" && !state.photoDataUrl) {
    status("请先拍照或选择照片", true);
    return;
  }
  if (state.mode === "manual" && !els.wrongText.value.trim() && !els.correctText.value.trim()) {
    status("请填写错题、错字或正确答案", true);
    return;
  }

  status("正在保存...");
  try {
    const date = today();
    const photo = await uploadPhoto(settings);
    const entry = {
      id: uid(),
      subject: els.subject.value,
      errorType: els.errorType.value.trim() || (state.mode === "photo" ? "图片记录" : "其他"),
      source: els.source.value.trim(),
      wrongText: els.wrongText.value.trim() || (state.mode === "photo" ? "作业照片" : ""),
      correctText: els.correctText.value.trim(),
      reason: els.reason.value.trim(),
      tags: normalizeTags(els.tags.value || (state.mode === "photo" ? "拍照" : "")),
      date,
      imageDataUrl: "",
      imagePath: photo.imagePath,
      imageMimeType: photo.imageMimeType,
      reviewLevel: 0,
      nextReviewDate: date,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: "quick-page",
    };
    const data = await readEntries(settings);
    const entries = [entry, ...data.entries];
    await writeFile(settings, settings.path, encodeBase64(`${JSON.stringify(entries, null, 2)}\n`), "Add Dudu errorbook entry", data.sha);
    resetForm();
    status("已保存到错题本");
  } catch (error) {
    status(error.message, true);
  }
}

function openMode(mode) {
  state.mode = mode;
  els.modeGrid.hidden = true;
  els.entryForm.hidden = false;
  els.photoField.hidden = mode !== "photo";
  els.formTitle.textContent = mode === "photo" ? "拍照录入" : "手动录入";
  els.errorType.value = mode === "photo" ? "图片记录" : "错字/别字";
  els.tags.value = mode === "photo" ? "拍照" : "";
  status("填写后点保存");
}

function resetForm() {
  state.photoDataUrl = "";
  els.entryForm.reset();
  els.previewImg.hidden = true;
  els.previewImg.removeAttribute("src");
  els.entryForm.hidden = true;
  els.modeGrid.hidden = false;
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bind() {
  $("#saveSettingsBtn").addEventListener("click", saveSettings);
  $("#backBtn").addEventListener("click", resetForm);
  els.entryForm.addEventListener("submit", saveEntry);
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => openMode(button.dataset.mode));
  });
  els.photoInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    status("正在处理照片...");
    state.photoDataUrl = await readImageAsDataUrl(file);
    els.previewImg.src = state.photoDataUrl;
    els.previewImg.hidden = false;
    status("照片已准备好");
  });
}

loadSettings();
bind();
