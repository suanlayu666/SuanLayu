import { readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const contentRoot = join(projectRoot, "content");
export const sourceRoot = join(projectRoot, "src");
export const outputRoot = join(projectRoot, "dist");

export const mediaTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

export function withinDirectory(directory, path) {
  const name = relative(directory, path);
  return !isAbsolute(name) && name !== ".." && !name.startsWith(`..${sep}`);
}

export function readDirectory(directory, options = { withFileTypes: true }) {
  try {
    return readdirSync(directory, options);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function visibleFiles(directory) {
  return readDirectory(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !relative(directory, path).split(sep).some((part) => part.startsWith(".")));
}

export function localUrl(from, to) {
  const path = relative(dirname(from), to).split(sep).map(encodeURIComponent).join("/");
  return path.startsWith("../") ? path : `./${path}`;
}
