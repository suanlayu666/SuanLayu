const guestbookForm = document.querySelector(".guestbook-form");
const writeButton = document.querySelector(".guestbook-write");
const writeLabel = document.querySelector(".guestbook-write-label");
const guestName = document.querySelector("#guest-name");
const guestMessage = document.querySelector("#guest-message");
const yearGroups = document.querySelector(".guestbook-groups");
const emptyGuestbook = document.querySelector(".guestbook-empty");
const guestbookStatus = document.querySelector(".guestbook-status");
const yearTemplate = document.querySelector("#guestbook-year-template");
const entryTemplate = document.querySelector("#guestbook-entry-template");
const loadButton = document.querySelector(".guestbook-load");
const submitButton = guestbookForm.querySelector('[type="submit"]');
const entryPrefix = "suanlayu-guestbook:";
const cloudflareOrigin = "https://suanlayu.suanlayu666.workers.dev";
const sameOriginHosts = ["127.0.0.1", "localhost", "suanlayu.cn", new URL(cloudflareOrigin).hostname];
const apiOrigin = sameOriginHosts.includes(location.hostname) ? location.origin : cloudflareOrigin;
const apiUrl = new URL("/api/guestbook", apiOrigin);
const entriesById = new Map();
let nextCursor = null;
let submission;
const guestbookYear = new Intl.DateTimeFormat("en", {
  year: "numeric",
  timeZone: "Asia/Shanghai",
});
const guestbookDate = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
});

function setComposerOpen(open) {
  guestbookForm.hidden = !open;
  writeButton.setAttribute("aria-expanded", String(open));
  writeLabel.textContent = open ? "收起" : "写留言";
  guestbookStatus.textContent = "";
  if (!open) writeButton.focus();
}

function readEntry(key) {
  try {
    const entry = JSON.parse(localStorage.getItem(key));
    if (typeof entry?.name === "string" && typeof entry.message === "string"
      && typeof entry.createdAt === "number" && Number.isFinite(new Date(entry.createdAt).getTime())) {
      return entry;
    }
  } catch {
    return null;
  }
  return null;
}

function showLocalEntries() {
  let entries = [];
  try {
    entries = Object.keys(localStorage)
      .filter((key) => key.startsWith(entryPrefix))
      .map(readEntry)
      .filter(Boolean)
      .sort((left, right) => right.createdAt - left.createdAt);
  } catch { return; }
  if (entries.length === 0) return;

  const localEntries = document.querySelector(".guestbook-local");
  localEntries.querySelector("textarea").value = entries.map(({ name, message, createdAt }) => (
    `${name} · ${guestbookYear.format(createdAt)} 年 ${guestbookDate.format(createdAt)}\n${message}`
  )).join("\n\n");
  localEntries.hidden = false;
}

function renderGuestbook() {
  const entries = [...entriesById.values()].sort((left, right) => right.id - left.id);

  const archive = document.createDocumentFragment();
  const lists = new Map();
  for (const entry of entries) {
    const year = guestbookYear.format(entry.createdAt);
    if (!lists.has(year)) {
      const group = yearTemplate.content.cloneNode(true);
      const heading = group.querySelector("h2");
      heading.id = `guestbook-year-${year}`;
      heading.textContent = year;
      group.querySelector("section").setAttribute("aria-labelledby", heading.id);
      lists.set(year, group.querySelector("ol"));
      archive.append(group);
    }

    const item = entryTemplate.content.cloneNode(true);
    item.querySelector("h3").textContent = entry.name;
    const time = item.querySelector("time");
    time.dateTime = new Date(entry.createdAt).toISOString();
    time.textContent = guestbookDate.format(entry.createdAt);
    item.querySelector("p").textContent = entry.message;
    lists.get(year).append(item);
  }

  yearGroups.replaceChildren(archive);
  emptyGuestbook.textContent = "还没有留言，欢迎留下第一条。";
  emptyGuestbook.hidden = entries.length > 0;
}

function createRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

async function requestGuestbook(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url.href, { ...options, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "留言服务暂时不可用。", { cause: response.status });
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadEntries() {
  loadButton.disabled = true;
  const url = new URL(apiUrl);
  if (nextCursor !== null) url.searchParams.set("before", nextCursor);
  try {
    const page = await requestGuestbook(url);
    for (const entry of page.entries) entriesById.set(entry.id, entry);
    nextCursor = page.nextCursor;
    renderGuestbook();
    loadButton.textContent = "加载更多";
    loadButton.hidden = nextCursor === null;
  } catch (error) {
    if (entriesById.size === 0) {
      emptyGuestbook.textContent = error.name === "AbortError"
        ? "留言加载超时，请重试。"
        : "暂时无法加载留言，请重试。";
      emptyGuestbook.hidden = false;
    }
    loadButton.textContent = "重试加载";
    loadButton.hidden = false;
  } finally {
    loadButton.disabled = false;
  }
}

writeButton.addEventListener("click", () => setComposerOpen(guestbookForm.hidden));
loadButton.addEventListener("click", loadEntries);
guestbookForm.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.isComposing && !event.defaultPrevented) {
    setComposerOpen(false);
  }
});
guestMessage.addEventListener("input", () => guestMessage.setCustomValidity(""));

guestbookForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;
  guestbookStatus.textContent = "";
  const message = guestMessage.value.trim();
  if (!message) {
    guestMessage.setCustomValidity("请写下留言。");
    guestMessage.reportValidity();
    return;
  }

  const name = guestName.value.trim() || "访客";
  if (submission?.name !== name || submission.message !== message) {
    submission = { name, message, requestId: createRequestId() };
  }
  submitButton.disabled = true;
  guestbookStatus.textContent = "正在发布留言…";
  try {
    const { entry } = await requestGuestbook(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
    });
    entriesById.set(entry.id, entry);
    renderGuestbook();
    if ((guestName.value.trim() || "访客") === name && guestMessage.value.trim() === message) {
      guestbookForm.reset();
      setComposerOpen(false);
    }
    submission = undefined;
    guestbookStatus.textContent = "留言已发布。";
  } catch (error) {
    if (error.name === "AbortError") {
      guestbookStatus.textContent = "发布请求超时，请重试。";
    } else {
      guestbookStatus.textContent = typeof error.cause === "number"
        ? error.message
        : "暂时无法确认留言是否发布，请重试。";
    }
  } finally {
    submitButton.disabled = false;
  }
});

showLocalEntries();
writeButton.hidden = false;
loadEntries();
