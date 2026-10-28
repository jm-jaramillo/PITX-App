#!/usr/bin/env node
/**
 * One-off: creates the operator accounts held back from
 * _create-missing-operators.mjs pending the user's confirmation on 4
 * ambiguous groupings. All four were resolved as "separate accounts":
 *
 * - Bataan Transit Co., Inc / First North Luzon Transit, Inc. - identical
 *   contacts in the spreadsheet, kept as 2 accounts per the user.
 * - Eastern Metropolitan Bus Corp / Rizal Metrolink Inc - share one
 *   contact (Gretchen Ronquillo), kept as 2 accounts per the user.
 * - Elavil Tours Phils Inc / Elavil Transit - related family name,
 *   different regions/contacts, kept as 2 accounts per the user.
 * - San Agustin Trans Service Corp / St. Anthony of Padua Transport
 *   System, Inc. - split out from the 3-way combined row that also
 *   included Batman Starexpress Corporation (already created separately
 *   from its own standalone row in _create-missing-operators.mjs). The
 *   combined row's 5 contacts are split across these two new accounts
 *   (Romulo Santiaguel + Juan Carlos Dela Cruz -> San Agustin; Ruel
 *   Galvez + Jhoana Malbas -> St. Anthony), leaving Batman Starexpress's
 *   own already-assigned contacts untouched.
 *
 * Run once with .env.local present.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const PASSWORD = "TestPass123";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NEW_OPERATORS = {
  "bataantransit.ops": {
    operator_name: "Bataan Transit Co., Inc",
    company_name: "Bataan Transit Co., Inc",
    contact1: { name: "Rolando D. De Leon", position: "President", number: "09175457036", email: null },
    contact2: { name: "Jose Mari H. De Leon", position: "Operations Manager", number: "09175761321", email: "jhl_777@yahoo.com" },
  },
  "firstnorthluzon.ops": {
    operator_name: "First North Luzon Transit, Inc.",
    company_name: "First North Luzon Transit, Inc.",
    contact1: { name: "Rolando D. De Leon", position: "President", number: "09175457036", email: null },
    contact2: { name: "Jose Mari H. De Leon", position: "Operations Manager", number: "09175761321", email: "jhl_777@yahoo.com" },
  },
  "easternmetro.ops": {
    operator_name: "Eastern Metropolitan Bus Corp",
    company_name: "Eastern Metropolitan Bus Corp",
    contact1: { name: "Gretchen Ronquillo", position: "President", number: "09178361714", email: null },
  },
  "rizalmetrolink.ops": {
    operator_name: "Rizal Metrolink Inc",
    company_name: "Rizal Metrolink Inc",
    contact1: { name: "Gretchen Ronquillo", position: "President", number: "09178361714", email: null },
  },
  "elaviltours.ops": {
    operator_name: "Elavil Tours Phils Inc",
    company_name: "Elavil Tours Phils Inc",
    contact1: { name: "Greg", position: null, number: "09171626006", email: "peter_enot29@yahoo.com" },
    contact2: { name: "Adolfo L. Villamonte", position: "President", number: null, email: "avegail01evangelista@gmail.com" },
  },
  "elaviltransit.ops": {
    operator_name: "Elavil Transit",
    company_name: "Elavil Transit",
    contact1: { name: "John Paul Villamonte", position: "Operations Manager/Operator", number: "09610148213", email: "elaviltoursphilsinc@gmail.com" },
  },
  "sanagustin.ops": {
    operator_name: "San Agustin Trans Service Corp",
    company_name: "San Agustin Trans Service Corp",
    contact1: { name: "Romulo Santiaguel", position: "Company Owner", number: null, email: "tastranscorp@yahoo.com" },
    contact2: { name: "Juan Carlos Dela Cruz", position: "Operation OIC", number: "09335629790", email: null },
  },
  "stanthonypadua.ops": {
    operator_name: "St. Anthony of Padua Transport System, Inc.",
    company_name: "St. Anthony of Padua Transport System, Inc.",
    contact1: { name: "Ruel Galvez", position: "OIC Operation", number: "09237404425", email: null },
    contact2: { name: "Jhoana Malbas", position: "OIC Operation", number: "09338298802", email: null },
  },
};

(async () => {
  const results = [];
  for (const [username, data] of Object.entries(NEW_OPERATORS)) {
    const email = `${username}@pitx.local`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { role: "operator" },
      user_metadata: { username, operator_name: data.operator_name },
    });
    if (createError || !created.user) {
      results.push([username, "FAIL (auth): " + createError?.message]);
      continue;
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      username,
      role: "operator",
      operator_name: data.operator_name,
    });
    if (profileError) {
      results.push([username, "FAIL (profile): " + profileError.message]);
      continue;
    }

    const { error: opError } = await admin.from("operator_profiles").insert({
      operator_id: created.user.id,
      company_name: data.company_name,
      contact1_name: data.contact1?.name ?? null,
      contact1_position: data.contact1?.position ?? null,
      contact1_number: data.contact1?.number ?? null,
      contact1_email: data.contact1?.email ?? null,
      contact2_name: data.contact2?.name ?? null,
      contact2_position: data.contact2?.position ?? null,
      contact2_number: data.contact2?.number ?? null,
      contact2_email: data.contact2?.email ?? null,
    });
    if (opError) {
      results.push([username, "FAIL (operator_profiles): " + opError.message]);
      continue;
    }

    results.push([username, "OK"]);
  }

  const ok = results.filter((r) => r[1] === "OK").length;
  console.log(`${ok}/${results.length} operators created successfully.`);
  for (const [username, status] of results) {
    if (status !== "OK") console.log(" -", username, status);
  }
})();
