// Client-side OCR for LTO OR/CR photos - no server, no API key, no per-scan
// cost. Trade-off: Tesseract.js does raw text recognition with no idea what
// a "plate number" is, so the guesses below are heuristics over messy OCR
// output, not a reliable parse. The UI always shows these as an editable,
// reviewable starting point - never auto-saved without the operator seeing
// them - and the raw text is shown too so a bad guess can be corrected by
// eye rather than by re-scanning.
//
// Plate number, expiry, and the OR/CR numbers are guessed - the rest of
// the vehicle registration form (case no., MV file #, etc.) isn't printed
// on an OR/CR document, so those stay hand-entered.

import { createWorker } from "https://esm.sh/tesseract.js@5.1.1";

/**
 * Runs OCR on an image file and returns both the raw text and best-effort
 * field guesses. `onProgress(text)` is called with short status updates
 * ("Loading…", "Recognizing text… 42%", etc.) if provided.
 */
export async function extractOrCr(file, onProgress) {
  const worker = await createWorker("eng", 1, {
    logger: (msg) => {
      if (!onProgress) return;
      if (msg.status === "recognizing text") {
        onProgress(`Reading document… ${Math.round((msg.progress ?? 0) * 100)}%`);
      } else if (msg.status) {
        onProgress(msg.status[0].toUpperCase() + msg.status.slice(1) + "…");
      }
    },
  });

  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    return {
      rawText: text,
      guesses: {
        plate_no: guessPlate(text.toUpperCase()),
        expiry: guessExpiry(text.toUpperCase()),
        or_number: guessNumberNear(text.toUpperCase(), /O\.?\s?R\.?\s*(?:NO\.?|NUMBER)?/),
        cr_number: guessNumberNear(text.toUpperCase(), /C\.?\s?R\.?\s*(?:NO\.?|NUMBER)?/),
      },
    };
  } finally {
    await worker.terminate();
  }
}

function guessPlate(upper) {
  // Philippine plates: 3 letters + 3-4 digits, with or without a separator
  // ("NGP 2481", "NGP2481", "NGP-2481"). Word boundaries avoid matching
  // mid-word fragments from noisy OCR text.
  const match = upper.match(/\b([A-Z]{2,3})[\s-]?(\d{3,4})\b/);
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

function guessExpiry(upper) {
  const dates = [...upper.matchAll(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g)];
  if (dates.length === 0) return null;

  // Prefer a date near the word EXPIR(Y/ES/ATION); otherwise take the last
  // date on the document, which registration expiry tends to be.
  const expiryIdx = upper.indexOf("EXPIR");
  let chosen = dates[dates.length - 1];
  if (expiryIdx !== -1) {
    let closest = null;
    let closestDist = Infinity;
    for (const d of dates) {
      const dist = Math.abs(d.index - expiryIdx);
      if (dist < closestDist) {
        closest = d;
        closestDist = dist;
      }
    }
    if (closest) chosen = closest;
  }

  let [, a, b, year] = chosen;
  if (year.length === 2) year = `20${year}`;
  // Philippine documents are usually MM/DD/YYYY; treat the first number as
  // the month when it's plausible (<=12), otherwise assume DD/MM/YYYY.
  const month = Number(a) <= 12 ? a : b;
  const day = Number(a) <= 12 ? b : a;
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) {
    return null;
  }
  return `${year}-${mm}-${dd}`;
}

// Looks for a label ("O.R. NO.", "OR", "C R NUMBER", ...) and takes the
// alphanumeric run right after it - OCR on these labels is unreliable
// (spacing/dots vary a lot), so this is looser than the plate/date
// guesses and more likely to need a manual fix.
function guessNumberNear(upper, labelRegex) {
  const combined = new RegExp(labelRegex.source + "\\s*[:\\-]?\\s*([A-Z0-9\\-]{4,})");
  const match = upper.match(combined);
  return match ? match[1] : null;
}
