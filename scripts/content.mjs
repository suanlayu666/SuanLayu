import { readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import MarkdownIt from "markdown-it";
import { parse } from "yaml";
import {
  contentRoot, localUrl, outputRoot, projectRoot, readDirectory, sourceRoot, withinDirectory,
} from "./site-files.mjs";

const markdown = new MarkdownIt({ html: false });
const order = new Intl.Collator("zh-CN", { numeric: true });

export const { escapeHtml } = markdown.utils;

function publishedPath(path) {
  const assets = join(sourceRoot, "assets");
  if (withinDirectory(assets, path)) {
    return join(outputRoot, "assets", relative(assets, path));
  }
  if (withinDirectory(outputRoot, path)) return path;
  if (withinDirectory(projectRoot, path)) {
    return join(outputRoot, relative(projectRoot, path));
  }
  return null;
}

// Resolve Markdown links relative to their source files, including links between articles.
for (const [rule, attribute] of [["link_open", "href"], ["image", "src"]]) {
  const original = markdown.renderer.rules[rule];
  markdown.renderer.rules[rule] = (tokens, index, options, file, renderer) => {
    const token = tokens[index];
    const url = token.attrGet(attribute);
    if (url && !/^(?:[a-z][a-z\d+.-]*:|[/?#])/i.test(url)) {
      const [, path, suffix] = url.match(/^([^?#]+)(.*)$/);
      const target = resolve(dirname(file.source), decodeURIComponent(path));
      const destination = file.routes.get(target) ?? publishedPath(target);
      if (destination) token.attrSet(attribute, localUrl(file.output, destination) + suffix);
    }
    return original
      ? original(tokens, index, options, file, renderer)
      : renderer.renderToken(tokens, index, options);
  };
}

function readEntries(sourceDirectory, outputDirectory, isBlog = false) {
  return readDirectory(sourceDirectory)
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && /\.md$/i.test(entry.name))
    .sort((a, b) => order.compare(a.name, b.name))
    .map(({ name }) => {
      const source = join(sourceDirectory, name);
      const stem = basename(name, extname(name));
      const output = join(outputDirectory, `${stem}.html`);
      try {
        const raw = readFileSync(source, "utf8").replace(/^\uFEFF/, "");
        const frontmatter = raw.match(/^(?:\\)?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:\\)?---[ \t]*(?:\r?\n|$)/);
        if (isBlog && !frontmatter) {
          throw new Error("请在文件开头用两行 --- 包住 title 和 date。");
        }
        const data = frontmatter ? parse(frontmatter[1]) ?? {} : {};
        let body = raw.slice(frontmatter?.[0].length ?? 0).trimStart();
        const heading = body.match(/^#[ \t]+(.+)(?:\r?\n|$)/)?.[1].trim();
        const title = data.title ?? (isBlog ? undefined : heading ?? stem.replace(/^\d+[-_ ]+/, ""));
        if (typeof title !== "string" || !title.trim()) throw new Error("请填写 title。");

        const date = data.date;
        if (isBlog) {
          const parsedDate = new Date(typeof date === "string" ? date : "");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime())
            || parsedDate.toISOString().slice(0, 10) !== date) {
            throw new Error("请填写有效的 date，格式为 YYYY-MM-DD。");
          }
        }
        if (heading === title.trim()) body = body.replace(/^#[ \t]+.+(?:\r?\n|$)/, "").trimStart();
        return { source, output, title: title.trim(), date, body };
      } catch (error) {
        throw new Error(`${relative(projectRoot, source)}：${error.message}`);
      }
    });
}

export function readContent() {
  const posts = readEntries(join(contentRoot, "blog"), join(outputRoot, "posts"), true)
    .sort((a, b) => b.date.localeCompare(a.date) || order.compare(a.source, b.source));
  const studyContent = join(contentRoot, "learn");
  const directories = readDirectory(studyContent)
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort(order.compare);
  const sections = ["getting-started", ...directories.filter((name) => name !== "getting-started")]
    .map((name) => ({
      title: name === "getting-started" ? "从这里开始" : name,
      lessons: directories.includes(name) ? readEntries(join(studyContent, name), join(outputRoot, "learn", name)) : [],
    }));
  const lessons = sections.flatMap((section) => section.lessons);
  const routes = new Map([...posts, ...lessons].map(({ source, output }) => [source, output]));
  if (new Set(routes.values()).size !== routes.size) throw new Error("两个 Markdown 文件对应了同一个网页路径。");
  return { posts, sections, lessons, routes };
}

export function renderMarkdown(entry, routes) {
  return markdown.render(entry.body, { ...entry, routes }).trimEnd();
}
