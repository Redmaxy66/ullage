#!/usr/bin/env node
/*
 * Patches data.js with the latest EIA WPSR prints.
 * Runs from GitHub Actions on the weekly and monthly cadences.
 *
 * What moves:
 *   - top-level today
 *   - hero[1] "US SPR": sub, value, delta prefix (trailing clause preserved)
 *   - tiles[0] "US commercial": value (sub stays manual — qualitative call)
 *   - sources[] EIA row: vintage, used
 *
 * What does not move:
 *   - IEA / OPEC / Vortexa fields (never invent an IEA world total)
 *   - components[] scores (rebuild only on the monthly full run, by a human)
 *   - meter.line (editorial)
 *
 * Requires: EIA_API_KEY (get one at https://www.eia.gov/opendata/register.php)
 */
import { readFile, writeFile } from "node:fs/promises";

const KEY = process.env.EIA_API_KEY;
if (!KEY) {
  console.error("EIA_API_KEY is not set. Add it as a repo secret.");
  process.exit(1);
}

const MINUS = "−";
const MID = " · ";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmtDate      = (iso) => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const fmtDateShort = (iso) => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const fmtSigned    = (x, d=2) => `${x >= 0 ? "+" : MINUS}${Math.abs(x).toFixed(d)}`;

async function latest(series) {
  const url = new URL("https://api.eia.gov/v2/petroleum/stoc/wstk/data/");
  url.searchParams.set("api_key", KEY);
  url.searchParams.append("frequency", "weekly");
  url.searchParams.append("data[0]", "value");
  url.searchParams.append("facets[series][]", series);
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.set("length", "6");
  const r = await fetch(url);
  if (!r.ok) throw new Error(`EIA ${series} → HTTP ${r.status}`);
  const j = await r.json();
  const rows = (j.response?.data ?? []).filter((x) => x.value != null);
  if (rows.length < 2) throw new Error(`EIA ${series} → not enough rows`);
  return { curr: rows[0], prev: rows[1] };
}

function patchTop(src, key, val) {
  const re = new RegExp(`(^\\s*${key}:\\s*")[^"]*(")`, "m");
  if (!re.test(src)) throw new Error(`top-level field missing: ${key}`);
  return src.replace(re, `$1${val}$2`);
}

function patchBlock(src, marker, updates) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`block marker missing: ${marker}`);
  const end = src.indexOf("},", start);
  if (end < 0) throw new Error(`block end missing after: ${marker}`);
  let block = src.slice(start, end);
  for (const [field, val] of Object.entries(updates)) {
    const re = new RegExp(`(${field}:\\s*")([^"]*)(")`);
    if (!re.test(block)) throw new Error(`field ${field} missing in ${marker}`);
    block = block.replace(re, (m, a, existing, b) => {
      const next = typeof val === "function" ? val(existing) : val;
      return `${a}${next}${b}`;
    });
  }
  return src.slice(0, start) + block + src.slice(end);
}

async function main() {
  const [spr, com] = await Promise.all([latest("WCSSTUS1"), latest("WCESTUS1")]);

  const sprMb    = spr.curr.value / 1000;
  const sprPrev  = spr.prev.value / 1000;
  const sprDelta = sprMb - sprPrev;
  const comMb    = com.curr.value / 1000;

  const weekEnding      = fmtDate(spr.curr.period);
  const weekEndingShort = fmtDateShort(spr.curr.period);
  const today           = fmtDate(new Date().toISOString().slice(0, 10));

  let src = await readFile("data.js", "utf8");

  src = patchTop(src, "today", today);

  src = patchBlock(src, 'label: "US SPR"', {
    sub:   `EIA week ending ${weekEnding}`,
    value: sprMb.toFixed(1),
    delta: (existing) => {
      const parts    = existing.split(MID);
      const trailing = parts.length > 1 ? MID + parts.slice(1).join(MID) : "";
      return `${fmtSigned(sprDelta)} mb week${trailing}`;
    },
  });

  src = patchBlock(src, 'label: "US commercial"', {
    value: comMb.toFixed(1),
  });

  src = patchBlock(src, 'pub: "EIA"', {
    vintage: `WE ${weekEndingShort}`,
    used:    `SPR ${sprMb.toFixed(2)} mb; commercial ${comMb.toFixed(2)} mb`,
  });

  await writeFile("data.js", src);

  console.log(`Weekly pulse — WE ${weekEndingShort}`);
  console.log(`  SPR:            ${sprMb.toFixed(2)} mb  (${fmtSigned(sprDelta)} vs prior week)`);
  console.log(`  US commercial:  ${comMb.toFixed(2)} mb`);
  console.log(`  Today stamp:    ${today}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
