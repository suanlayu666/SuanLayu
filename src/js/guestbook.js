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
const entryPrefix = "suanlayu-guestbook:";
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

function renderGuestbook() {
  let entries;
  try {
    entries = Object.keys(localStorage)
      .filter((key) => key.startsWith(entryPrefix))
      .map(readEntry)
      .filter(Boolean)
      .sort((left, right) => right.createdAt - left.createdAt);
  } catch {
    entries = [];
  }

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
  emptyGuestbook.hidden = entries.length > 0;
}

writeButton.addEventListener("click", () => setComposerOpen(guestbookForm.hidden));
guestbookForm.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.isComposing && !event.defaultPrevented) {
    setComposerOpen(false);
  }
});
guestMessage.addEventListener("input", () => guestMessage.setCustomValidity(""));

guestbookForm.addEventListener("submit", (event) => {
  event.preventDefault();
  guestbookStatus.textContent = "";
  const message = guestMessage.value.trim();
  if (!message) {
    guestMessage.setCustomValidity("请写下留言。");
    guestMessage.reportValidity();
    return;
  }

  const entry = {
    name: guestName.value.trim() || "访客",
    message,
    createdAt: Date.now(),
  };
  const id = crypto.randomUUID?.() ?? `${entry.createdAt}-${Math.random().toString(36).slice(2)}`;
  try {
    localStorage.setItem(`${entryPrefix}${id}`, JSON.stringify(entry));
  } catch {
    guestbookStatus.textContent = "当前浏览器无法保存留言。";
    return;
  }

  guestbookForm.reset();
  renderGuestbook();
  setComposerOpen(false);
  guestbookStatus.textContent = "留言已保存。";
});

window.addEventListener("storage", (event) => {
  if (event.key === null || event.key.startsWith(entryPrefix)) renderGuestbook();
});

renderGuestbook();
writeButton.hidden = false;
