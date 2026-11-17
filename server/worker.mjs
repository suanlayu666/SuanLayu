import { DurableObject } from "cloudflare:workers";
import { createGuestbookStore, guestbookPath, guestbookSchema, handleGuestbook } from "./guestbook.mjs";

export class GuestbookData extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(guestbookSchema);
    this.store = createGuestbookStore((sql, parameters) => ctx.storage.sql.exec(sql, ...parameters).toArray());
  }

  list(before) {
    return this.store.list(before);
  }

  add(submission) {
    return this.store.add(submission);
  }
}

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname !== guestbookPath) return env.ASSETS.fetch(request);

    const store = env.GUESTBOOK_DATA.getByName("public-guestbook");
    const origins = env.GUESTBOOK_ORIGINS?.split(/\s*,\s*/) ?? [];
    return handleGuestbook(request, store, {
      origins,
      async canWrite(request) {
        const key = request.headers.get("CF-Connecting-IP") || "unknown";
        const { success } = await env.GUESTBOOK_RATE_LIMIT.limit({ key });
        return success;
      },
    });
  },
};
