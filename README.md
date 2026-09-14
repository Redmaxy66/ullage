# ULLAGE

Public-domain oil inventory desk. Sister to AUREA.

Ullage is the empty space above the liquid in a tank. The score measures how much room is left before the operational heel.

## Files

- `index.html` — the desk
- `data.js` — every printable number, edited on Thursday and on the 13th
- `scripts/update-eia.mjs` — patches `data.js` from the EIA v2 API
- `.github/workflows/weekly-pulse.yml` — Wed 15:00 UTC, opens a PR with the weekly EIA delta
- `.github/workflows/monthly-full.yml` — 13th 06:00 UTC, opens a PR skeleton with the monthly checklist

## Publishing (GitHub Pages)

Settings → Pages → Source: **Deploy from a branch** → Branch: `main` / `(root)` → Save.
Every merge to `main` republishes in ~30 s. Custom domain via CNAME.

## Automation

One-time setup:

1. Register a free EIA API key: <https://www.eia.gov/opendata/register.php>.
2. Add it as a repo secret named `EIA_API_KEY` (Settings → Secrets and variables → Actions → New repository secret).
3. Merge the feature branch to `main`. Schedules only fire from workflows sitting on the default branch.

Cadence, after setup:

- **Weekly pulse** — Wed 15:00 UTC (after EIA WPSR at 10:30 ET). Refreshes SPR and US commercial crude. Opens a PR titled *Weekly pulse — WE <date>*. Verify the two numbers against <https://www.eia.gov/petroleum/weekly/>, merge, published.
- **Monthly full** — 13th 06:00 UTC. Refreshes EIA where it can, opens a PR skeleton with a checklist for the IEA / OPEC / Vortexa fields. Fill them in on the branch, merge, published.

Manual dry-run: Actions tab → workflow → **Run workflow**.

## Discipline

- Never invent an IEA world total between OMR prints.
- The composite is computed from `components[]`. Do not hard-code a headline number.
- Yellow inputs change only when a named publisher prints.

Not JPMorgan research. Mixed-vintage IEA / EIA / OPEC / Vortexa prints only.
