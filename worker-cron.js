import { scheduled } from "./src/cron.js";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return new Response("ok", { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  },
  scheduled
};
