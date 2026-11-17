const navigation = document.querySelector(".site-nav");
const contactEmail = "202521111421@mail.scuec.edu.cn";
const copyEmailButton = navigation.querySelector(".nav-email-copy");
const copyEmailStatus = navigation.querySelector(".nav-email-status");
let activeItem = null;
let pinned = false;

function setExpanded(item, expanded) {
  if (item.isDisclosure) item.trigger.setAttribute("aria-expanded", String(expanded));
  item.preview.hidden = !expanded;
  if (!expanded && item.preview.contains(copyEmailStatus)) copyEmailStatus.textContent = "";
}

function showPreview(item, keepOpen = false) {
  if (activeItem !== item) {
    if (activeItem) setExpanded(activeItem, false);
    if (item) setExpanded(item, true);
    activeItem = item;
  }
  pinned = keepOpen;
}

for (const element of navigation.querySelectorAll(".nav-item")) {
  const trigger = element.querySelector(".nav-trigger");
  const item = {
    trigger,
    preview: element.querySelector(".nav-preview"),
    isDisclosure: trigger.hasAttribute("aria-expanded"),
  };

  element.addEventListener("pointerenter", (event) => {
    const focusInPreview = activeItem?.preview.contains(document.activeElement);
    if (event.pointerType === "mouse" && activeItem !== item && !focusInPreview) showPreview(item);
  });

  element.addEventListener("pointerleave", (event) => {
    const keyboardFocus = trigger.matches(":focus-visible") || item.preview.contains(document.activeElement);
    if (event.pointerType === "mouse" && activeItem === item && !pinned && !keyboardFocus) {
      showPreview(null);
    }
  });

  trigger.addEventListener("focus", () => {
    if (trigger.matches(":focus-visible") && activeItem !== item) showPreview(item);
  });

  if (item.isDisclosure) {
    trigger.addEventListener("click", () => {
      if (activeItem === item && pinned) showPreview(null);
      else showPreview(item, true);
    });
  }
}

navigation.addEventListener("focusout", (event) => {
  if (!navigation.contains(event.relatedTarget)) showPreview(null);
});

document.addEventListener("pointerdown", (event) => {
  if (activeItem && !navigation.contains(event.target)) showPreview(null);
});

document.addEventListener("keydown", (event) => {
  if (!activeItem || event.key !== "Escape") return;

  if (activeItem.preview.contains(document.activeElement)) activeItem.trigger.focus();
  showPreview(null);
});

function copyWithTemporaryField(email) {
  const field = document.createElement("input");
  field.className = "nav-email-buffer";
  field.value = email;
  field.readOnly = true;
  copyEmailButton.after(field);

  try {
    field.focus({ preventScroll: true });
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    copyEmailButton.focus({ preventScroll: true });
    field.remove();
  }
}

copyEmailButton.addEventListener("click", async () => {
  copyEmailStatus.textContent = "";

  let copied;
  try {
    await navigator.clipboard.writeText(contactEmail);
    copied = true;
  } catch {
    copied = copyWithTemporaryField(contactEmail);
  }

  if (activeItem?.preview.contains(copyEmailStatus)) {
    copyEmailStatus.textContent = copied ? "已复制" : "复制失败，请重试";
  }
});
