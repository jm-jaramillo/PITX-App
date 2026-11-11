// Terminal Operating System: device endpoint for gate cameras, barriers and
// the local gate controller. Contract: docs/modules/terminal-operating-system/DEVICE-API.md
//
// Every call carries the header  x-device-key: tos_...  (created on Devices & rules).
// Deployed with verify_jwt = false: the device key is the authentication.
//
//   POST /tos-device/read        one plate read          -> decision + what to do with the barrier
//   POST /tos-device/reads       up to 100 queued reads  -> one answer per read, same order
//   GET  /tos-device/event?id=N  current state of a read (poll while waiting for staff)
//   POST /tos-device/heartbeat   device status list
//   GET  /tos-device/bundle      rules, gates, today's trips and the vehicle masterfile (offline use)
//   GET  /tos-device/ping        no key needed; server time

import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const MAX_BATCH = 100;

type Read = {
  gate?: string;
  plate?: string;
  confidence?: number;
  read_at?: string;
  read_id?: string;
  test?: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Database errors carry a code word the device can act on.
function fail(message: string) {
  const code =
    message.startsWith("DEVICE_AUTH") ? "unauthorized" :
    message.startsWith("DEVICE_GATE") ? "wrong_gate" :
    message.startsWith("DEVICE_NOT_FOUND") ? "not_found" : "rejected";
  const status = { unauthorized: 401, wrong_gate: 403, not_found: 404, rejected: 422 }[code];
  return { status, body: { error: code, message: message.replace(/^DEVICE_\w+:\s*/, "") } };
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) return fail(error.message);
  return { status: 200, body: data };
}

function readArgs(key: string, r: Read) {
  if (!r || typeof r !== "object") return null;
  if (typeof r.gate !== "string" || typeof r.plate !== "string" || typeof r.confidence !== "number") return null;
  return {
    p_key: key,
    p_gate: r.gate,
    p_plate: r.plate,
    p_confidence: r.confidence,
    p_read_at: r.read_at ?? null,
    p_read_id: r.read_id ?? null,
    p_test: r.test === true,
  };
}

const BAD_READ = { error: "bad_request", message: "A read needs gate (text), plate (text) and confidence (0 to 1)" };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/tos-device/, "") || "/";

  if (route === "/ping") return json({ ok: true, server_time: new Date().toISOString() });

  const key = req.headers.get("x-device-key") ?? "";
  if (!key) return json({ error: "unauthorized", message: "Missing x-device-key header" }, 401);

  let body: any = null;
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_request", message: "Body must be JSON" }, 400);
    }
  }

  if (req.method === "POST" && route === "/read") {
    const args = readArgs(key, body);
    if (!args) return json(BAD_READ, 400);
    const r = await rpc("tos_device_read", args);
    return json(r.body, r.status);
  }

  if (req.method === "POST" && route === "/reads") {
    const reads: Read[] = Array.isArray(body) ? body : body?.reads;
    if (!Array.isArray(reads)) return json({ error: "bad_request", message: "Send { \"reads\": [ ... ] }" }, 400);
    if (reads.length > MAX_BATCH) return json({ error: "bad_request", message: `At most ${MAX_BATCH} reads per call` }, 400);
    // Oldest first, so queued reads are judged in the order the buses arrived.
    const results = [];
    for (const r of reads) {
      const args = readArgs(key, r);
      if (!args) { results.push({ read_id: r?.read_id ?? null, status: 400, ...BAD_READ }); continue; }
      const out = await rpc("tos_device_read", args);
      if (out.status === 401) return json(out.body, 401);
      results.push({ read_id: r.read_id ?? null, status: out.status, ...out.body });
    }
    return json({ results });
  }

  if (req.method === "GET" && route === "/event") {
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return json({ error: "bad_request", message: "Pass ?id=<event_id>" }, 400);
    const r = await rpc("tos_device_event", { p_key: key, p_event_id: id });
    return json(r.body, r.status);
  }

  if (req.method === "POST" && route === "/heartbeat") {
    const devices = Array.isArray(body) ? body : body?.devices;
    if (!Array.isArray(devices)) return json({ error: "bad_request", message: "Send { \"devices\": [ { \"id\": \"G1-LPR\", \"status\": \"online\" } ] }" }, 400);
    const r = await rpc("tos_device_heartbeat", { p_key: key, p_devices: devices });
    return json(r.body, r.status);
  }

  if (req.method === "GET" && route === "/bundle") {
    const r = await rpc("tos_device_bundle", { p_key: key });
    return json(r.body, r.status);
  }

  return json({ error: "not_found", message: `No route ${req.method} ${route}` }, 404);
});
