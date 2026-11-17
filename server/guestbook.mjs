export const guestbookPath = "/api/guestbook";
export const guestbookSchema = `CREATE TABLE IF NOT EXISTS guestbook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`;

const pageSize = 30;
const maxBodyBytes = 8192;
const entryColumns = "id, name, message, created_at AS createdAt";
const requestIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function createGuestbookStore(query) {
  return {
    async list(before) {
      const where = before === null ? "" : "WHERE id < ?";
      const parameters = before === null ? [pageSize + 1] : [before, pageSize + 1];
      const rows = await query(
        `SELECT ${entryColumns} FROM guestbook_entries ${where} ORDER BY id DESC LIMIT ?`,
        parameters,
      );
      const entries = rows.slice(0, pageSize);
      return { entries, nextCursor: rows.length > pageSize ? entries.at(-1).id : null };
    },
    async add({ requestId, name, message }) {
      const [entry] = await query(
        `INSERT INTO guestbook_entries (request_id, name, message, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(request_id) DO NOTHING RETURNING ${entryColumns}`,
        [requestId, name, message, Date.now()],
      );
      if (entry) return entry;

      const [existing] = await query(
        `SELECT ${entryColumns} FROM guestbook_entries WHERE request_id = ?`,
        [requestId],
      );
      if (existing?.name === name && existing.message === message) return existing;
      return null;
    },
  };
}

async function readSubmission(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch {
    return null;
  }
}

export async function handleGuestbook(request, store, { origins = [], canWrite } = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const allowed = origin === url.origin || origins.includes(origin);
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (allowed) headers.set("Access-Control-Allow-Origin", origin);
  const json = (data, status = 200) => Response.json(data, { status, headers });

  if (origin && !allowed) return json({ error: "此网站地址尚未接入留言板。" }, 403);

  try {
    if (request.method === "GET") {
      const cursor = url.searchParams.get("before");
      const before = cursor === null ? null : Number(cursor);
      if (before !== null && (!Number.isSafeInteger(before) || before < 1)) {
        return json({ error: "留言页码无效。" }, 400);
      }
      return json(await store.list(before));
    }
    if (request.method === "OPTIONS") {
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      headers.set("Allow", "GET, POST, OPTIONS");
      return json({ error: "不支持此请求方式。" }, 405);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) {
      return json({ error: "留言格式不正确。" }, 415);
    }
    if (canWrite && !(await canWrite(request))) {
      headers.set("Retry-After", "60");
      return json({ error: "留言太频繁，请稍后再试。" }, 429);
    }
    const submission = await readSubmission(request);
    const requestId = submission?.requestId;
    const name = typeof submission?.name === "string" ? submission.name.trim() || "访客" : "访客";
    const message = typeof submission?.message === "string" ? submission.message.trim() : "";
    if (typeof requestId !== "string" || !requestIdPattern.test(requestId)
      || name.length > 32 || !message || message.length > 1000) {
      return json({ error: "请填写 1–1000 字的留言。昵称最多 32 字。" }, 400);
    }

    const entry = await store.add({ requestId, name, message });
    if (!entry) return json({ error: "留言内容有冲突，请修改后重试。" }, 409);
    return json({ entry }, 201);
  } catch (error) {
    console.error("Guestbook request failed:", error);
    return json({ error: "留言服务暂时不可用，请稍后再试。" }, 503);
  }
}
