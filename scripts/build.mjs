import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { readContent } from "./content.mjs";
import { renderPages } from "./render.mjs";
import { contentRoot, mediaTypes, outputRoot, projectRoot, sourceRoot, visibleFiles } from "./site-files.mjs";

function collectFiles() {
  const content = readContent();
  const files = new Map(
    [...renderPages(content)].map(([path, html]) => [path, Buffer.from(html)]),
  );
  const staticDirectories = [
    { source: join(sourceRoot, "styles"), destination: "styles", extensions: [".css"] },
    { source: join(sourceRoot, "js"), destination: "js", extensions: [".js"] },
    { source: join(sourceRoot, "assets"), destination: "assets", extensions: Object.keys(mediaTypes) },
    { source: contentRoot, destination: "content", extensions: Object.keys(mediaTypes) },
  ];
  for (const { source, destination, extensions } of staticDirectories) {
    for (const path of visibleFiles(source)) {
      if (!extensions.includes(extname(path).toLowerCase())) continue;
      files.set(join(outputRoot, destination, relative(source, path)), readFileSync(path));
    }
  }
  return { files, postCount: content.posts.length, lessonCount: content.lessons.length };
}

function outputMatches(files) {
  const existing = visibleFiles(outputRoot);
  if (existing.length !== files.size) return false;
  return existing.every((path) => {
    const expected = files.get(path);
    if (!expected) return false;
    try {
      return readFileSync(path).equals(expected);
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  });
}

function publishFiles(files) {
  if (outputMatches(files)) return false;

  const staging = mkdtempSync(join(projectRoot, ".dist-build-"));
  const nextOutput = join(staging, "next");
  const previousOutput = join(staging, "previous");
  let keepBackup = false;
  try {
    for (const [path, bytes] of files) {
      const target = join(nextOutput, relative(outputRoot, path));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }

    try {
      renameSync(outputRoot, previousOutput);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    try {
      renameSync(nextOutput, outputRoot);
    } catch (error) {
      if (existsSync(previousOutput) && !existsSync(outputRoot)) {
        try {
          renameSync(previousOutput, outputRoot);
        } catch (rollbackError) {
          keepBackup = true;
          throw new Error(`发布失败，上一版保留在 ${previousOutput}。${rollbackError.message}`, { cause: error });
        }
      }
      throw error;
    }
  } finally {
    if (!keepBackup) rmSync(staging, { recursive: true, force: true });
  }
  return true;
}

function runBuild() {
  try {
    const { files, postCount, lessonCount } = collectFiles();
    const changed = publishFiles(files);
    console.log(`已构建 dist/，包含 ${postCount} 篇博客和 ${lessonCount} 篇教程。`);
    return changed;
  } catch (error) {
    console.error(error.message);
    return null;
  }
}

function sourceSnapshot() {
  const paths = [contentRoot, sourceRoot].flatMap(visibleFiles).sort();
  const stamps = paths.flatMap((path) => {
    const info = statSync(path, { throwIfNoEntry: false });
    return info ? [[path, info.ino, info.mtimeMs, info.size]] : [];
  });
  return JSON.stringify(stamps);
}

export function watchSite(onChange) {
  let previous = sourceSnapshot();
  if (runBuild()) onChange?.();
  console.log("正在监听 content/ 和 src/。保存后会重新构建 dist/。");
  return setInterval(() => {
    try {
      const current = sourceSnapshot();
      if (current === previous) return;
      previous = current;
      if (runBuild() !== null) onChange?.();
    } catch (error) {
      console.error(error.message);
    }
  }, 650);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--watch")) watchSite();
  else if (runBuild() === null) process.exitCode = 1;
}
