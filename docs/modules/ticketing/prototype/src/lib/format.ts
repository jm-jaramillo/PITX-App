export function todayManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export function peso(amount: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
}

export function dateTimeManila(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// Words kept in capitals when a name is put in proper case (entry 43).
const ACRONYMS = new Set(["PITX", "DLTB", "BLTB", "JAM", "JAC", "DMS", "BAL", "LLI", "RRCG", "ALPS", "CUL", "PH", "II", "III", "IV", "NCR", "LRT", "MRT", "SM"]);

/**
 * "NAGA CITY" to "Naga City", "CAGSAWA TRAVEL & TOURS" to "Cagsawa Travel & Tours". Keeps
 * acronyms (PITX, DLTB, C.U.L.) and words with no vowel in capitals. Mixed-case text is left as is.
 */
export function properCase(text: string | undefined): string {
  if (!text) return "";
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(/[\p{L}.']+/gu, (word, offset: number, whole: string) => {
      const upper = word.toUpperCase();
      const bare = upper.replace(/[.']/g, "");
      if (ACRONYMS.has(bare) || /\.\p{L}\./u.test(upper) || (bare.length > 1 && !/[AEIOU]/.test(bare))) return upper;
      const small = ["of", "and", "the", "to", "de", "del", "ng"].includes(word) && offset > 0 && whole[offset - 1] === " ";
      return small ? word : word.charAt(0).toUpperCase() + word.slice(1);
    });
}
