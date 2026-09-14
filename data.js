/*
 * ULLAGE — day-1 desk data.
 * Thursday pulse edits: heroes[spr].*, tiles[US commercial].*, updated_weekly.
 * Monthly full: replace components[], sources[], heroes[iea].*, tiles[oecd,aug draw,floating].*
 * Never invent an IEA world total on a weekly pulse.
 */
const DATA = {
  today: "14 Sep 2026",
  vintage_note: "Mixed vintage",
  is_live: true,

  hero: [
    {
      label: "IEA observed",
      sub: "End-August 2026 · derived from Jul 7.90B − 95 mb",
      value: "7.80",
      unit: "B bbl",
      delta: "−507 mb since Feb war start · 2.8 mb/d average",
      tone: "stress",
      spark: [8.31, 8.28, 8.24, 8.19, 8.14, 8.10, 8.05, 8.00, 7.95, 7.92, 7.90, 7.80],
    },
    {
      label: "US SPR",
      sub: "EIA week ending 4 Sep 2026",
      value: "285.4",
      unit: " mb",
      delta: "−1.24 mb week · lowest since early 1980s",
      tone: "stress",
      spark: [312, 309, 305, 302, 300, 297, 294, 292, 290, 288, 286.7, 285.4],
    },
  ],

  tiles: [
    { label: "US commercial", value: "424.1", sub: "mb · ≈ 5-year seasonal" },
    { label: "OECD cover",    value: "58.7",  sub: "days · June OPEC print" },
    { label: "Aug draw",      value: "−3.1",  sub: "mb/d · IEA September OMR" },
    { label: "Floating crude",value: "96.0",  sub: "mb Vortexa · 6 Sep" },
  ],

  meter: {
    kicker: "Global inventory conditions",
    line: "Elevated stress, still tightening — and still about a billion barrels above the May floor path",
    bands: [
      { name: "COMFORT",  from: 0,   to: 30  },
      { name: "WATCH",    from: 30,  to: 50  },
      { name: "TIGHT",    from: 50,  to: 65  },
      { name: "ELEVATED", from: 65,  to: 85  },
      { name: "FLOOR",    from: 85,  to: 100 },
    ],
  },

  components: [
    { name: "Global observed stocks", print: "7.80B bbl",         score: 62, weight: 28 },
    { name: "Draw pace since Feb",    print: "−2.8 mb/d avg",     score: 74, weight: 18 },
    { name: "OECD commercial cover",  print: "58.7 days",         score: 55, weight: 14 },
    { name: "US SPR",                 print: "285.4 mb",          score: 88, weight: 14 },
    { name: "US commercial crude",    print: "424.1 mb ≈ 5-yr",   score: 38, weight: 8  },
    { name: "Product tightness",      print: "Diesel squeeze",    score: 82, weight: 10 },
    { name: "Floating / on-water",    print: "96 mb FS; −65 mb",  score: 58, weight: 8  },
  ],

  score_maps: [
    { id: "S1", label: "Observed stocks",
      stops: [["8.4B+","20"],["8.3B","30"],["7.9B","55"],["7.6B","70"],["7.2B","85"],["6.8B","95"],["<6.6B","100"]] },
    { id: "S2", label: "Draw pace (mb/d)",
      stops: [["0","10"],["1","35"],["2","55"],["2.8","70"],["~3.1","74"],["4+ sustained","90"],["5.6","100"]] },
    { id: "S3", label: "OECD days of cover",
      stops: [["65d+","20"],["60","45"],["58.7","55"],["55","70"],["50","85"],["<45","100"]] },
    { id: "S4", label: "US SPR (mb)",
      stops: [["600+","10"],["400","40"],["350","60"],["300","80"],["285","88"],["250","94"],["200","98"]] },
    { id: "S5", label: "US commercial vs 5-yr",
      stops: [["well above","15"],["at average","38"],["5–10% below","60"],["multi-year low","85"]] },
    { id: "S6", label: "Products",
      note: "Judgement from IEA diesel/crack language. Record squeeze reads ~82." },
    { id: "S7", label: "On-water / floating",
      note: "Location-aware. Glut FS is low stress; blockade-stranded FS is availability stress." },
  ],

  hard_rule: "Observed ≤ 7.4B AND OECD cover ≤ 54 days AND SPR ≤ 250 mb AND diesel cracks still extreme.",

  sources: [
    { pub: "IEA",  doc: "Oil Market Report September 2026",           vintage: "11 Sep",       used: "Aug −95 mb; cum −507 mb; on-water −65; demand −2.5" },
    { pub: "IEA",  doc: "Oil Market Report August 2026",              vintage: "mid-Aug",      used: "End-Jul just below 7.9B" },
    { pub: "EIA",  doc: "Weekly Petroleum Status Report / SPR weekly",vintage: "WE 4 Sep",     used: "SPR 285.36 mb; commercial 424.07 mb" },
    { pub: "OPEC", doc: "Monthly Oil Market Report August 2026",      vintage: "June stocks",  used: "OECD commercial 2,729 mb / 58.7 days" },
    { pub: "Vortexa / MacroMicro", doc: "Floating crude tracker",     vintage: "6 Sep",        used: "96.0 mb global" },
    { pub: "Bloomberg / JPM",      doc: "Chart, May 2026",            vintage: "May 2026",     used: "7.6 / 6.8 reference path only" },
  ],

  cadence: {
    weekly:  { when: "Thursday 08:00 Asia/Singapore",
               body: "After the EIA Weekly Petroleum Status Report (Wednesday 10:30 ET). Only SPR and US commercial crude move. Never invent an IEA world total that week." },
    monthly: { when: "13th of the month at 20:00 Asia/Singapore",
               body: "After IEA OMR (~12th) and OPEC MOMR. All seven scores rebuild. Next full run 13 October 2026." },
    name:    { when: "On the name",
               body: "Ullage is the empty space above the liquid in a tank. The desk measures how much room is left before the operational heel — not a slogan, a sounding." },
  },
};
