// Supabase Edge Function: create an operator or PITX staff account.
//
// Why this exists: creating an auth user requires the service_role key,
// which bypasses Row Level Security. The static site is public, so that key
// can never live in the browser bundle. This function runs server-side on
// Supabase, reads the key from the SUPABASE_SERVICE_ROLE_KEY secret, and
// only proceeds after verifying the *caller* is signed in AND has the
// 'staff' role in the profiles table.
//
// Deploy:  supabase functions deploy create-account
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//          (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//           injected automatically by Supabase for deployed functions.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

const USERNAME_DOMAIN = "pitx.local";
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/i;

// Allow the GitHub Pages origin (and localhost for local testing) to call
// this function from the browser.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // --- 1. Authenticate the caller and confirm they are PITX staff ---------
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Not signed in." }, 401);
  }

  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await asCaller.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "Not signed in." }, 401);
  }

  const { data: callerProfile } = await asCaller
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (callerProfile?.role !== "staff") {
    return json({ error: "Only PITX staff may create accounts." }, 403);
  }

  // --- 2. Validate the requested account ---------------------------------
  let payload: {
    username?: string;
    password?: string;
    role?: string;
    operator_name?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const username = (payload.username ?? "").trim();
  const password = payload.password ?? "";
  const role = payload.role ?? "";
  const operatorName = (payload.operator_name ?? "").trim();

  if (!USERNAME_PATTERN.test(username)) {
    return json(
      {
        error:
          "Username must be 3-32 characters: letters, numbers, dot, dash, underscore.",
      },
      400
    );
  }
  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters." }, 400);
  }
  if (role !== "operator" && role !== "staff" && role !== "ticketing") {
    return json({ error: "Role must be 'operator', 'staff' or 'ticketing'." }, 400);
  }

  // --- 3. Create the account with the privileged client -------------------
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (existing) {
    return json({ error: "That username is already taken." }, 409);
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: `${username.toLowerCase()}@${USERNAME_DOMAIN}`,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { username, operator_name: operatorName || null },
    });

  if (createError || !created.user) {
    return json(
      { error: createError?.message ?? "Could not create account." },
      400
    );
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    role,
    operator_name: operatorName || null,
  });

  if (profileError) {
    // Roll back so we never leave an auth user without a profile row.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: profileError.message }, 400);
  }

  return json({ ok: true, username });
});
