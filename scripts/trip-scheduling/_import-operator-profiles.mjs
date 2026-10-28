#!/usr/bin/env node
/**
 * One-off import: populates operator_profiles for the 23 existing operator
 * accounts from "Operator Database.xlsx" (Operator Profile sheet), per the
 * mapping worked out with the user (see chat/CHANGELOG for the exact
 * reasoning on the Jac/Jam/LLI and Amihan/Philtranco ambiguities).
 *
 * Not meant to be reusable - this is a scratch script for a single import,
 * kept only for the record. Run once with .env.local present.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// username -> { company_name, contact1: {name, position, number, email}, contact2 }
const IMPORT = {
  "genesis.ops": {
    company_name: "Genesis Transport Service Inc",
    contact1: { name: "Rely Jalbuna", position: "Operations Manager", number: "09189336901", email: "droyjalbuna@yahoo.com" },
  },
  "jacliner.ops": {
    company_name: "Jac Liner Inc",
    contact1: { name: "Catherine Flores", position: "Operations Manager", number: "09190954166", email: "kcflores77@jacliner.com" },
  },
  "jamliner.ops": {
    company_name: "Jam Liner Inc",
    contact1: { name: "Jose U. Aguilo", position: "Operations Manager", number: "09175445272", email: "joe.aguilo@yahoo.com" },
    contact2: { name: "Catherine Flores", position: "Operations Manager", number: "09190954166", email: "kcflores77@jacliner.com" },
  },
  "jamlinerlli.ops": {
    company_name: "Lucena Lines Inc (LLI)",
    contact1: { name: "Jordan Maligaya", position: "Dispatcher", number: "0915-504-1707", email: null },
  },
  "amihan.ops": {
    company_name: "Amihan Bus Lines Inc.",
    contact1: { name: "Lidio Ancheta", position: "Area Head", number: "09953879488", email: null },
    contact2: { name: "Gerald Aladen", position: "Operations and Maintenance Head", number: "09178610683", email: "aladenvanz@gmail.com" },
  },
  "philtranco.ops": {
    company_name: "Philtranco Service Enterprises, Inc.",
    contact1: { name: "Richard Aristotle Rosales", position: "Company Owner", number: null, email: null },
    contact2: { name: "Gerald Aladen", position: "Operations and Maintenance Head", number: "09178610683", email: "aladenvanz@gmail.com" },
  },
  "alps.ops": {
    company_name: "Alps The Bus, Inc",
    contact1: { name: "John Patrick Perez", position: "Operations Manager", number: "09199101708 / 09175008923", email: "alpsperez@gmail.com" },
    contact2: { name: "Roger Nartates", position: "Teller/Dispatcher", number: "0917-709-3573", email: null },
  },
  "bicolisarog.ops": {
    company_name: "Bicol Isarog",
    contact1: { name: "Gelo Villanueva", position: "Office of Strategy Management Head", number: "09178824874", email: "gelo.villanueva@bicolisarog.com" },
    contact2: { name: "Jackilyn Tapel", position: "Sales and Marketing Supervisor", number: "09635995275 / 0930 848 3028", email: "jackie.tapel@bicolisarog.com" },
  },
  "dltb.ops": {
    company_name: "Del Monte Motor Works Inc (DLTB)",
    contact1: { name: "James Olayvar", position: "SVP/General Manager", number: "09178303366", email: "jao899@dltbbus.com.ph" },
    contact2: { name: "Laurence Gay De Mata-Bautista", position: "Operations Manager - Long Haul", number: "09338247126", email: "dltb_aom22@yahoo.com" },
  },
  "superlines.ops": {
    company_name: "Superlines Transportation Co., Inc.",
    contact1: { name: "Cieron Libardo", position: "Operations Manager", number: "09499141738", email: "superlinestrans@gmail.com" },
    contact2: { name: "Ronaldo Pabulayan", position: "Dispatcher", number: "0919-797-9955", email: null },
  },
  "raymond.ops": {
    company_name: "Raymond Transportation",
    contact1: { name: "Raymond M. Escobar", position: "Operator", number: "09088888763", email: "engr.rmescobar.rti@gmail.com" },
    contact2: { name: "Rommel Castillo", position: "Dispatcher", number: "0931-073-3188", email: null },
  },
  "tawtrasco.ops": {
    company_name: "Tabaco Women Transport Service (TAWTRASCO)",
    contact1: { name: "Alex B. Banares", position: "Chairman", number: "09562409429", email: "smartlex11346@gmail.com" },
    contact2: { name: "Mark Eljay Benitez", position: "Dispatcher", number: "0960-862-9720", email: null },
  },
  "cagsawa.ops": {
    company_name: "Cagsawa Travel & Tours",
    contact1: { name: "Domingo Madelar Jr", position: "Operations Head", number: "09338164598", email: "cagtours@yahoo.com" },
    contact2: { name: "Mark Eljay Benitez", position: "Teller/Dispatcher", number: "0965-652-1026", email: null },
  },
  "omtranscoop.ops": {
    company_name: "Occidental Mindoro Transport (OMTRANS)",
    contact1: { name: "Edgardo Gamboa", position: "General Manager", number: "09955176942", email: "montoyamiraflor44@gmail.com" },
    contact2: { name: "Renalyn Delos Santos", position: "Teller", number: "0906-774-6549", email: null },
  },
  "rorobus.ops": {
    company_name: "Rorobus Transport Services Inc",
    contact1: { name: "June Calangi", position: "Operations Manager", number: "09175560622", email: "rorobus.transport.services@gmail.com" },
    contact2: { name: "Reymund A. Flores", position: "Operation Supervisor", number: "09171204399", email: null },
  },
  "davaometroshuttle.ops": {
    company_name: "Davao Metro Shuttle (DMS)",
    contact1: { name: "Fheir Kenneth Sunga", position: "VP-Operations", number: "09176397392", email: "fheir_kenneth_sunga@davaometroshuttlecorp.com" },
    contact2: { name: "Anabelle Yee", position: "Finance Manager", number: "09171669365", email: "anabelle_yee@davaometroshuttlecorp.com" },
  },
  "ceresgoldstar.ops": {
    company_name: "Ceres Transport Inc / Goldstar Bus Transit Inc",
    contact1: { name: "Purvil Daing", position: "Operations Manager", number: "09988890302", email: null },
    contact2: { name: "Marie Ann Santerva", position: "Admin Manager", number: "09171571257", email: "santervaann@gmail.com" },
  },
  "ndelarosaliner.ops": {
    company_name: "N. Dela Rosa",
    contact1: { name: "Rodolfo E. Dela Rosa", position: "Operations Manager", number: "09338107435", email: "delarosa.rudy1966@gmail.com" },
  },
  "delarosaexpress.ops": {
    company_name: "Dela Rosa Express Inc",
    contact1: { name: "Rodolfo E. Dela Rosa", position: "Operations Manager", number: "09338107435", email: "delarosa.rudy1966@gmail.com" },
  },
  "abliner.ops": {
    company_name: "A&B Liner",
    contact1: { name: "Rienante R. Palomado", position: "Operations Manager", number: "09297400953", email: null },
    contact2: { name: "Patricia Camille B. Mandigma", position: "Operator", number: "09997593676", email: "patriciacamille.mandigma@gmail.com" },
  },
  "barneyautoline.ops": {
    company_name: "Barney Auto Lines (BAL Transport Corporation)",
    contact1: { name: "Kein Harvey P. Chito", position: "General Manager", number: "09338627483", email: "kein.chito@gmail.com" },
    contact2: { name: "Paul Barley P. Chito", position: "Vice President", number: "09253227639", email: "admin@barneyautolines.com" },
  },
  "potransport.ops": {
    company_name: "P&O Transportation",
    contact1: { name: "Merk Hanson Chito", position: "General Manager", number: "09399266751", email: "po.merkhanson@gmail.com" },
    contact2: { name: "Camille Distrajo", position: "Teller/Dispatcher", number: "0928-8347351", email: null },
  },
  "pangasinansolidnorth.ops": {
    company_name: "Pangasinan Solid North",
    contact1: { name: "Angelito Cabuslay", position: "Dispatcher", number: "0985-953-5441", email: null },
    contact2: { name: "Mier Isada", position: "Dispatcher", number: "0998-560-4718", email: null },
  },
};

(async () => {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, username")
    .in("username", Object.keys(IMPORT));

  if (error) {
    console.error("Failed to look up profiles:", error.message);
    process.exit(1);
  }

  const idByUsername = new Map(profiles.map((p) => [p.username, p.id]));
  const missing = Object.keys(IMPORT).filter((u) => !idByUsername.has(u));
  if (missing.length) {
    console.error("Missing accounts, aborting:", missing);
    process.exit(1);
  }

  const rows = Object.entries(IMPORT).map(([username, data]) => ({
    operator_id: idByUsername.get(username),
    company_name: data.company_name,
    company_owner: null,
    tin_no: null,
    or_serial_number: null,
    has_booking_system: false,
    booking_system_name: null,
    nau: null,
    contact1_name: data.contact1?.name ?? null,
    contact1_position: data.contact1?.position ?? null,
    contact1_number: data.contact1?.number ?? null,
    contact1_email: data.contact1?.email ?? null,
    contact2_name: data.contact2?.name ?? null,
    contact2_position: data.contact2?.position ?? null,
    contact2_number: data.contact2?.number ?? null,
    contact2_email: data.contact2?.email ?? null,
  }));

  const { data: upserted, error: upsertError } = await admin
    .from("operator_profiles")
    .upsert(rows, { onConflict: "operator_id" })
    .select("operator_id, company_name");

  if (upsertError) {
    console.error("Upsert failed:", upsertError.message);
    process.exit(1);
  }

  console.log(`Upserted ${upserted.length} operator profiles:`);
  for (const r of upserted) console.log(" -", r.company_name);
})();
