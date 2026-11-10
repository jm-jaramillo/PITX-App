// Operator list per denomination, from the sample supplied by Terminal Operations.
// Duplicates are removed, joint entries ("A/ B") are split so each company gets access,
// and obvious spelling variants are merged (DLTB, JAM Liner, CUL Transport, Erjohn & Almark).
const DLTB = "DEL MONTE MOTOR WORKS INC (DLTB)";
const BARNEY = "BARNEY AUTO LINES (BAL TRANSPORT CORPORATION)";
const ALPS = "ALPS THE BUS, INC";
const CERES = "CERES TRANSPORT INC";
const JAM = "JAM LINER INC";
const RAYMOND = "RAYMOND TRANSPORTATION";
const PO = "P&O TRANSPORTATION";
const PHILTRANCO = "PHILTRANCO SERVICE ENTERPRISES, INC.";
const EASTERN = "EASTERN GOLDTRANS TOURS, INC.";
const CUL = "CUL TRANSPORT";

export const OPERATOR_ROUTES: Record<string, string[]> = {
  BAGUIO: ["PANGASINAN SOLID NORTH"],
  BATANGAS: [
    ALPS,
    "BATMAN STAREXPRESS CORPORATION",
    CERES,
    "GOLDSTAR BUS TRANSIT INC",
    DLTB,
    "ERJOHN AND ALMARK TRANSIT CORPORATION",
    JAM,
    "N. DELA ROSA",
    "RRCG TRANSPORT SYSTEM CO INC",
    "SAN AGUSTIN TRANS SERVICE CORP",
    "ST. ANTHONY OF PADUA TRANSPORT SYSTEM, INC.",
    "ST. GABRIEL",
  ],
  BICOL: [
    "A. ARANDIA LINE",
    "AMIHAN BUS LINES INC.",
    "ANTONINA LINE",
    BARNEY,
    "BELLEZA TRANSPORT CORPORATION",
    "BICOL ISAROG",
    "LEGASPI ST. JUDE TRANSPORT LINES INC",
    "PENAFRANCIA",
    "BOBIS LINER",
    "C BRAGAIS LINER",
    CUL,
    "CAGSAWA TRAVEL & TOURS",
    "CEM TRANSPORT SERVICES INC",
    "DAET AUTO EXPRESS TRANSIT INC.",
    DLTB,
    EASTERN,
    "ELAVIL TOURS PHILS INC",
    "J BINAS LINES",
    "JVH TRANSPORT",
    "R. VOLANTE LINE",
    "MA VICTORIA TRANSPORTATION INC",
    "MARK EVES TRANSIT",
    PO,
    PHILTRANCO,
    RAYMOND,
    "RMB BICOL EXPRESS",
    "RU DIAZ",
    "ST. MARTHA LINES INC",
    "SUPERLINES TRANSPORTATION CO., INC.",
    "DAET EXPRESS",
    "TABACO WOMEN TRANSPORT SERVICE (TAWTRASCO)",
    "TWINHEARTS TRANS CORP",
    ALPS,
    "GOLDTRANS BUS TRANSPORTATION SERVICES",
    "DMMC TRAVEL AND TOURS, INC.",
  ],
  MINDORO: [
    "OCCIDENTAL MINDORO TRANSPORT (OMTRANS)",
    "JARIV BUS TRANSPORT CORP.",
    "ROROBUS TRANSPORT SERVICES INC",
  ],
  "NORTHERN ROUTES": [
    "BALIWAG TRANSIT",
    "BATAAN TRANSIT CO., INC",
    "FIRST NORTH LUZON TRANSIT, INC.",
    "GENESIS TRANSPORT SERVICE INC",
    "GV FLORIDA TRANSPORT, INC",
    "PANGASINAN FIVE STAR BUS CO., INC.",
    "PARTAS TRANSPORTATION COMPANY, INC",
    "VICTORY LINER, INC.",
  ],
  QUEZON: [BARNEY, "A&B LINER", "DELA ROSA EXPRESS INC", JAM, PO, RAYMOND],
  VISMIN: [
    EASTERN,
    CERES,
    "VALLACAR TRANSIT",
    "CIBL",
    CUL,
    "DAVAO METRO SHUTTLE (DMS)",
    "DIAMOND STAR TRANSIT SERVICES",
    "ELAVIL TRANSIT",
    "MEGA BUS LINES CORP.",
    PHILTRANCO,
    "SILVER STAR SHUTTLE & TOURS INC",
    "Yohance Express, Inc.",
    "UNAHKLARIZZE TRANSPORT CORP.",
  ],
};

// The companies the demo runs on: five because their logos are available, plus Genesis so
// its operator account (genesis-ops) has its own sample company to explore. DLTB and
// Genesis are on the list above; the other denominations are placeholders until their
// real routes are supplied.
// destinations: the Trip Scheduling destinations each runs in the sample data (made up).
export const SAMPLE_OPERATORS: (OperatorCompany & { logo?: string; destinations: string[] })[] = [
  { code: "DLTB", name: DLTB, denominations: ["BATANGAS", "BICOL"], destinations: ["BATANGAS CITY", "NAGA CITY"], logo: "/brand/operators/dltb.jpg" },
  { code: "KRS", name: "KERSTEEN", denominations: ["BAGUIO"], destinations: ["BAGUIO CITY"], logo: "/brand/operators/kersteen.png" },
  { code: "LOR", name: "LORNA EXPRESS", denominations: ["QUEZON"], destinations: ["LUCENA CITY"], logo: "/brand/operators/lorna.jpg" },
  { code: "OGW", name: "OGAWA LINER", denominations: ["NORTHERN ROUTES"], destinations: ["DAGUPAN CITY"], logo: "/brand/operators/ogawa.jpg" },
  { code: "SCE", name: "SOUTH CITY EXPRESS INC", denominations: ["VISMIN"], destinations: ["TACLOBAN CITY"], logo: "/brand/operators/south-city.jpg" },
  { code: "GEN", name: "GENESIS TRANSPORT SERVICE INC", denominations: ["NORTHERN ROUTES"], destinations: ["BALANGA, BATAAN"] },
];

const FILLER = new Set(["INC", "CORP", "CO", "THE", "AND", "OF", "CORPORATION", "COMPANY"]);

export function baseCode(name: string): string {
  const inParens = name.match(/\(([A-Z]{2,})\)/);
  if (inParens) return inParens[1];
  const clean = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ");
  const words = clean.split(/\s+/).filter((w) => w && !FILLER.has(w));
  const initials = words.map((w) => w[0]).join("");
  return initials.length >= 3 ? initials : words.join("").slice(0, 6);
}

export interface OperatorCompany {
  code: string;
  name: string;
  denominations: string[];
}

export function operatorCompanies(): OperatorCompany[] {
  const byName = new Map<string, OperatorCompany>();
  const used = new Set<string>();
  for (const [denomination, names] of Object.entries(OPERATOR_ROUTES)) {
    for (const name of names) {
      let company = byName.get(name);
      if (!company) {
        const base = baseCode(name);
        let code = base;
        for (let n = 2; used.has(code); n++) code = `${base}${n}`;
        used.add(code);
        company = { code, name, denominations: [] };
        byName.set(name, company);
      }
      if (!company.denominations.includes(denomination)) company.denominations.push(denomination);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
