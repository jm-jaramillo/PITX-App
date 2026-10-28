#!/usr/bin/env node
/**
 * One-off: creates accounts (+ operator_profiles) for every operator in
 * "Operator Database.xlsx" (Operator Profile sheet) that didn't already
 * have an account. Password is TestPass123, same as every other account
 * created in this project so far.
 *
 * A handful of company groupings in the spreadsheet are genuinely
 * ambiguous (identical contacts across two differently-named companies,
 * or a 3-way combined row overlapping a standalone row already handled
 * here) and are deliberately NOT included - held back for the user to
 * decide, same as the Jac/Jam/LLI and Amihan/Philtranco calls made
 * earlier.
 *
 * Not meant to be reusable - scratch script for a single import, kept for
 * the record. Run once with .env.local present.
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

// username -> { operator_name, company_name, contact1, contact2 }
const NEW_OPERATORS = {
  "arandialine.ops": {
    operator_name: "A. Arandia Line",
    company_name: "A. Arandia Line",
    contact1: { name: "Alan Arandia", position: "President", number: "09957895983", email: "geneli.arandia27@gmail.com" },
    contact2: { name: "Elvie Cornejo", position: "Operations Manager", number: "09957895983", email: "a.arandialine@gmail.com" },
  },
  "antoninaline.ops": {
    operator_name: "Antonina Line",
    company_name: "Antonina Line",
    contact1: { name: "Magin Bron Jr.", position: "Company Owner/President", number: "09566794995", email: "magin.bron@gmail.com" },
    contact2: { name: "Magin Anthony Bron III", position: "Treasurer", number: "09175522180", email: "antoninaline@yahoo.com" },
  },
  "baliwagtransit.ops": {
    operator_name: "Baliwag Transit",
    company_name: "Baliwag Transit",
    contact1: { name: "Wilson Laurente", position: null, number: "09238948720", email: "dhennilynsandiego@gmail.com" },
    contact2: { name: "Teodoro Castro", position: "Operation OIC", number: "09228284739 / 09296867159", email: "bti.bizdev@mail.com" },
  },
  "batmanstarexpress.ops": {
    operator_name: "Batman Starexpress Corporation",
    company_name: "Batman Starexpress Corporation",
    contact1: { name: "Jeffrey Mondoy", position: "HR and Admin", number: "09954496268", email: "tastranscorp@yahoo.com" },
    contact2: { name: "Rodel Basan", position: "Dispatcher", number: "09223914693", email: null },
  },
  "bellezatransport.ops": {
    operator_name: "Belleza Transport Corporation",
    company_name: "Belleza Transport Corporation",
    contact1: { name: "Edsel Belleza", position: "President", number: "09199917281", email: "bellezatransportcorporation08@gmail.com" },
    contact2: { name: "Myla Belleza", position: "Manager", number: "09199917282", email: "bellezatransportcorporation08@gmail.com" },
  },
  "bobisliner.ops": {
    operator_name: "Bobis Liner",
    company_name: "Bobis Liner",
    contact1: { name: "Jocelyn Bobis", position: "OIC", number: "09778055991", email: "bobis4036@yahoo.com" },
    contact2: { name: "Felixberta Bobis", position: "Company Owner", number: "09209254301", email: "bobisliner.ph@gmail.com" },
  },
  "cbragaisliner.ops": {
    operator_name: "C Bragais Liner",
    company_name: "C Bragais Liner",
    contact1: { name: "Carmen B. Bragais", position: "Operator", number: "09189123979 / 09175382852", email: "bragaisbusliner@gmail.com" },
    contact2: { name: "Amelia Ilagan", position: "Chief Admin", number: "09175382852", email: "bragaisbusliner@gmail.com" },
  },
  "cultransport.ops": {
    operator_name: "C.U.L. Transport",
    company_name: "C.U.L. Transport",
    contact1: { name: "Carolina U. Lam", position: "President", number: null, email: null },
    contact2: { name: "Melvin Viray", position: "Operations/Franchising Officer", number: "09682818175", email: "viraymelvin@yahoo.com.ph" },
  },
  "cemtransport.ops": {
    operator_name: "CEM Transport Services Inc",
    company_name: "CEM Transport Services Inc",
    contact1: { name: "Myla Belleza", position: "Liaison Officer", number: "09199917282", email: "bellezamyla@gmail.com" },
    contact2: { name: "Leah Lipnica", position: "Liaison Officer", number: "09103476476", email: null },
  },
  "ceresvallacar.ops": {
    operator_name: "Ceres Transport Inc / Vallacar Transit",
    company_name: "Ceres Transport Inc / Vallacar Transit",
    contact1: { name: "Marie Ann Santerva", position: "Admin Manager", number: "09171571257", email: "santervaann1973@gmail.com" },
    contact2: { name: "Geoffrey Ong", position: "Branch Manager", number: "09988890280", email: "geoffreyjong@yahoo.com" },
  },
  "chertransport.ops": {
    operator_name: "Cher Transport Corp.",
    company_name: "Cher Transport Corp.",
    contact1: { name: "Orly De Guzman", position: "Operations Manager", number: "09166318359", email: null },
  },
  "cibl.ops": {
    operator_name: "CIBL",
    company_name: "CIBL",
    contact1: { name: "James Natad", position: "Operations Manager", number: "09530547694", email: null },
    contact2: { name: "Marilyn Gacela Hernandez", position: "Teller/Dispatcher", number: "0946-215-5867", email: null },
  },
  "daetexpress.ops": {
    operator_name: "Daet Auto Express Transit Inc.",
    company_name: "Daet Auto Express Transit Inc.",
    contact1: { name: "Jerome Larang", position: null, number: null, email: "daetexpress@gmail.com" },
  },
  "diamondstar.ops": {
    operator_name: "Diamond Star Transit Services",
    company_name: "Diamond Star Transit Services",
    contact1: { name: "Eduardo Palma", position: "Operator", number: "0973156778", email: null },
  },
  "dmmctravel.ops": {
    operator_name: "DMMC Travel and Tours, Inc.",
    company_name: "DMMC Travel and Tours, Inc.",
    contact1: { name: "Sherwin Hernandez", position: "CEO", number: "09690180341", email: "dmmctravelandtrours@gmail.com" },
  },
  "easterngoldtrans.ops": {
    operator_name: "Eastern Goldtrans Tours, Inc.",
    company_name: "Eastern Goldtrans Tours, Inc.",
    contact1: { name: "Jack Schmidt", position: "Dispatcher", number: "0945-755-5744", email: null },
    contact2: { name: "Cris Bantay", position: "Operations Manager", number: null, email: "easterngoldtranstours@gmail.com" },
  },
  "erjohnalmark.ops": {
    operator_name: "Erjohn and Almark Transit Corporation",
    company_name: "Erjohn and Almark Transit Corporation",
    contact1: { name: "Alexis Santiaguel", position: "Transport Operator/Owner", number: "09194522801", email: "santiaguel.alexis@yahoo.com" },
    contact2: { name: "Ronnie Manlupig", position: "Dispatcher", number: "0931-174-9938", email: null },
  },
  "goldtransbts.ops": {
    operator_name: "Goldtrans Bus Transportation Services",
    company_name: "Goldtrans Bus Transportation Services",
    contact1: { name: "Tyrone Paul Aduza Weber", position: "Operator", number: "09566443030", email: "reginald.weber39@gmail.com" },
  },
  "gvflorida.ops": {
    operator_name: "GV Florida Transport, Inc",
    company_name: "GV Florida Transport, Inc",
    contact1: { name: "Leo Batacan", position: "Terminal Manager", number: "09155410464", email: "gvfloridatrans@gmail.com" },
  },
  "jbinaslines.ops": {
    operator_name: "J Binas Lines",
    company_name: "J Binas Lines",
    contact1: { name: "Josefina V. Biñas", position: "Operator", number: "09278175339", email: "abinas021980@gmail.com" },
  },
  "jvhtransport.ops": {
    operator_name: "JVH Transport / R. Volante Line",
    company_name: "JVH Transport / R. Volante Line",
    contact1: { name: "Rolando Volante", position: "Owner/Operator", number: "09452957966 / 09107136704", email: "yuricabrillas@gmail.com" },
    contact2: { name: "Augusto Butial", position: "Liaison Officer", number: "09959610195", email: null },
  },
  "mavictoria.ops": {
    operator_name: "Ma Victoria Transportation Inc",
    company_name: "Ma Victoria Transportation Inc",
    contact1: { name: "Eva B. Bornilla", position: "Operator", number: "09770853977 / 09103505519", email: "marafaelamesias@gmail.com" },
    contact2: { name: "Joseph Cielo", position: "Dispatcher", number: "0905-091-9717", email: null },
  },
  "markevestransit.ops": {
    operator_name: "Mark Eves Transit",
    company_name: "Mark Eves Transit",
    contact1: { name: "Evangeline B. Bonaobra", position: "Operator", number: "09399027713", email: "markeves2010@yahoo.com" },
    contact2: { name: "Richard Bolanon", position: "Dispatcher", number: "0930-419-9439", email: null },
  },
  "megabuslines.ops": {
    operator_name: "Mega Bus Lines Corp.",
    company_name: "Mega Bus Lines Corp.",
    contact1: { name: "Myla Belleza", position: "Liaison Officer", number: "09199917282", email: "bellezamyla@gmail.com" },
    contact2: { name: "Cadigal", position: "Dispatcher", number: "0928-593-4337", email: null },
  },
  "pangasinanfivestar.ops": {
    operator_name: "Pangasinan Five Star Bus Co., Inc.",
    company_name: "Pangasinan Five Star Bus Co., Inc.",
    contact1: { name: "Modesto Mendoza", position: "Operations Manager", number: "09992233422", email: "jhunfivestar_69@yahoo.com" },
  },
  "partas.ops": {
    operator_name: "Partas Transportation Company, Inc",
    company_name: "Partas Transportation Company, Inc",
    contact1: { name: "Romel V. Singson", position: "President", number: "09178136208", email: null },
    contact2: { name: "Joseph Espinola", position: "Terminal Supervisor", number: "09175536986", email: null },
  },
  "rmbbicolexpress.ops": {
    operator_name: "RMB Bicol Express",
    company_name: "RMB Bicol Express",
    contact1: { name: "Raul Buban", position: "President", number: "09053490674", email: "rmbbetsinc@gmail.com" },
    contact2: { name: "Jose Roy Barbacena", position: "Dispatcher", number: "0963-639-3581", email: null },
  },
  "rrcgtransport.ops": {
    operator_name: "RRCG Transport System Co Inc",
    company_name: "RRCG Transport System Co Inc",
    contact1: { name: "Karl Marvin Torres", position: "Operations", number: "09399034276", email: null },
  },
  "rudiaz.ops": {
    operator_name: "RU Diaz",
    company_name: "RU Diaz",
    contact1: { name: "Roberto U. Diaz", position: "Operator", number: "09199979629 / 09173087056", email: "joybobbydiaz@yahoo.com" },
    contact2: { name: "Diane Joy Diaz", position: "Secretary", number: "09173087056", email: null },
  },
  "saintrosetransit.ops": {
    operator_name: "Saint Rose Transit Inc",
    company_name: "Saint Rose Transit Inc",
    contact1: { name: "Norberto Belen", position: "Operations", number: "09175948877", email: null },
    contact2: { name: "Remard Uy", position: "Admin", number: "09175828877", email: null },
  },
  "silverstar.ops": {
    operator_name: "Silver Star Shuttle & Tours Inc",
    company_name: "Silver Star Shuttle & Tours Inc",
    contact1: { name: "Bien De Borja", position: null, number: "09230836026", email: "silverstar.egov@gmail.com" },
    contact2: { name: "Jackie Lagbas", position: "Dispatcher", number: "0965-443-9603", email: null },
  },
  "stgabriel.ops": {
    operator_name: "St. Gabriel",
    company_name: "St. Gabriel",
    contact1: { name: "Edgar Mecantina", position: "Operation Manager", number: "09752122188 / 09705223098", email: "edjaibabe@yahoo.com" },
    contact2: { name: "Ariel Bocalan", position: "President", number: "09171092475", email: "stgabrielbusexpressinc@yahoo.com" },
  },
  "stmartha.ops": {
    operator_name: "St. Martha Lines Inc",
    company_name: "St. Martha Lines Inc",
    contact1: { name: "Noeme De Vera", position: "Corporation Secretary", number: "09088961767", email: "noemedevera@yahoo.com.ph" },
    contact2: { name: "John Ralph De Vera", position: "President", number: "09479927439", email: null },
  },
  "twinheartstrans.ops": {
    operator_name: "Twinhearts Trans Corp",
    company_name: "Twinhearts Trans Corp",
    contact1: { name: "Irene Palmero", position: "Dispatcher", number: "0910-393-7989", email: null },
    contact2: { name: "Kevin Villamonte", position: "President", number: null, email: "kvillamonte37@icloud.com" },
  },
  "unahklarizze.ops": {
    operator_name: "Unahklarizze Transport Corp.",
    company_name: "Unahklarizze Transport Corp.",
    contact1: { name: "Cris R. Dimla", position: "Operation Manager", number: "09165038887", email: "anniebelbalais@gmail.com" },
  },
  "victoryliner.ops": {
    operator_name: "Victory Liner, Inc.",
    company_name: "Victory Liner, Inc.",
    contact1: { name: "Brix Macalinao", position: "Operations Manager", number: "09173215826", email: "bamacalinao@victoryliner.com" },
    contact2: { name: "Raul Elcadre", position: "Marketing Manager", number: null, email: "rbecaldre@victoryliner.com" },
  },
  "yohanceexpress.ops": {
    operator_name: "Yohance Express, Inc.",
    company_name: "Yohance Express, Inc.",
    contact1: { name: "Crisinciano Mahilac", position: "Operator", number: "09173013558", email: "jessalynmahilac@yahoo.com.ph" },
    contact2: { name: "Gigi Areno", position: "HR/Admin Manager", number: "09257032414", email: null },
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
