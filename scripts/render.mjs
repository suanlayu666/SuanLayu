import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { escapeHtml, renderMarkdown } from "./content.mjs";
import { localUrl, outputRoot, sourceRoot } from "./site-files.mjs";

const pageTypes = {
  home: { template: "index.html", bodyAttributes: ' id="top"', styles: ["home"], script: "navigation" },
  blog: { template: "blog.html", bodyAttributes: ' class="reading-page"', styles: ["reading", "blog"] },
  post: {
    template: "blog-post.html",
    bodyAttributes: ' class="reading-page"',
    styles: ["reading", "blog", "markdown"],
  },
  learn: { template: "learn.html", bodyAttributes: ' class="study-page"', styles: ["learn", "markdown"] },
  guestbook: {
    template: "guestbook.html",
    bodyAttributes: ' class="reading-page"',
    styles: ["reading", "guestbook"],
    script: "guestbook",
  },
};

function readTemplate(directory, name) {
  return readFileSync(join(sourceRoot, directory, name), "utf8").trimEnd();
}

function fillTemplate(template, fields) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(fields, key)) throw new Error(`模板缺少字段 ${key}。`);
    return fields[key];
  });
}

function displayDate(date, includeYear = false) {
  const [year, month, day] = date.split("-");
  return `${includeYear ? `${year} 年 ` : ""}${Number(month)} 月 ${Number(day)} 日`;
}

function renderArchive(posts, page) {
  const byYear = new Map();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(post);
  }
  if (!byYear.size) return '      <p class="blog-list">还没有发布文章</p>';

  return [...byYear].map(([year, entries]) => {
    const rows = entries.map((entry) => `          <li>
            <a class="blog-row" href="${localUrl(page, entry.output)}">
              <span class="blog-post-title">${escapeHtml(entry.title)}</span>
              <time datetime="${entry.date}">${displayDate(entry.date)}</time>
            </a>
          </li>`).join("\n");
    return `      <section class="archive-group" aria-labelledby="blog-year-${year}">
        <h2 class="archive-year" id="blog-year-${year}">${year}</h2>
        <ul class="blog-list">
${rows}
        </ul>
      </section>`;
  }).join("\n");
}

function renderStudySidebar(sections, page) {
  return sections.map(({ title, lessons }) => {
    const current = lessons.some((lesson) => lesson.output === page);
    const links = lessons.map((lesson) => {
      const active = lesson.output === page ? ' aria-current="page"' : "";
      return `            <li><a href="${localUrl(page, lesson.output)}"${active}>${escapeHtml(lesson.title)}</a></li>`;
    }).join("\n");
    const contents = links
      ? `          <ul class="study-lessons">\n${links}\n          </ul>`
      : '          <p class="study-empty">目录待添加</p>';
    return `        <details class="study-menu"${current ? " open" : ""}>
          <summary>
            <span>${escapeHtml(title)}</span>
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </summary>
${contents}
        </details>`;
  }).join("\n");
}

export function renderPages({ posts, sections, lessons, routes }) {
  const document = readTemplate("layouts", "document.html");
  const logoTemplate = readTemplate("layouts", "logo.html");
  const lessonTemplate = readTemplate("layouts", "lesson.html");
  const templates = Object.fromEntries(
    Object.entries(pageTypes).map(([type, page]) => [type, readTemplate("pages", page.template)]),
  );
  const pages = new Map();

  function addPage(type, output, title, fields = {}) {
    const page = pageTypes[type];
    const pathToRoot = relative(dirname(output), outputRoot).split(sep).join("/");
    const root = `${pathToRoot || "."}/`;
    const logo = fillTemplate(logoTemplate, {
      root,
      href: type === "home" ? "#top" : `${root}index.html`,
      label: type === "home" ? "回到首页顶部" : "返回酸辣鱼首页",
    });
    const styles = ["base", ...page.styles];
    const resources = styles.map((style) => `    <link rel="stylesheet" href="${root}styles/${style}.css">`);
    if (page.script) resources.push(`    <script src="${root}js/${page.script}.js" defer></script>`);
    const body = fillTemplate(templates[type], { root, logo, ...fields });
    const html = fillTemplate(document, {
      root,
      title: escapeHtml(title),
      resources: resources.join("\n"),
      bodyAttributes: page.bodyAttributes,
      body,
    });
    pages.set(output, `${html}\n`);
  }

  const blogPage = join(outputRoot, "blog.html");
  const learnPage = join(outputRoot, "learn.html");

  addPage("home", join(outputRoot, "index.html"), "酸辣鱼");
  addPage("guestbook", join(outputRoot, "guestbook.html"), "留言板 · 酸辣鱼");
  addPage("blog", blogPage, "博客 · 酸辣鱼", { archive: renderArchive(posts, blogPage) });
  addPage("learn", learnPage, "学习 · 酸辣鱼", {
    sidebar: renderStudySidebar(sections, learnPage),
    main: '      <main aria-labelledby="study-page-title"></main>',
  });

  for (const post of posts) {
    addPage("post", post.output, `${post.title} · 酸辣鱼`, {
      title: escapeHtml(post.title),
      date: post.date,
      fullDate: displayDate(post.date, true),
      body: renderMarkdown(post, routes),
    });
  }
  for (const lesson of lessons) {
    const main = fillTemplate(lessonTemplate, {
      title: escapeHtml(lesson.title),
      body: renderMarkdown(lesson, routes),
    });
    addPage("learn", lesson.output, `${lesson.title} · 酸辣鱼`, {
      sidebar: renderStudySidebar(sections, lesson.output),
      main,
    });
  }
  return pages;
}
