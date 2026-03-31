import { runDailyCheckin } from "../src/cron.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.CRON_SECRET) {
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  const token = request.headers.get("x-cron-secret");
  if (token !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runDailyCheckin(env);
    return Response.json({ ok: true, ...result });
  } catch {
    return Response.json({ ok: false, message: "cron execution failed" }, { status: 500 });
  }
}
