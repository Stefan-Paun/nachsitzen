# Plan: Rolle „Petze“ und Balance per Simulation

## Ziel
Dritte Sonderrolle: Die Petze erfährt jede Nacht die Rolle einer lebenden Figur ihrer Wahl. Das Wissen steht nur in ihrer eigenen Sicht. Die Siegquote des Schattens bleibt zwischen 40 und 60 %, belegt durch Simulation.

## Etappen
1. **Regeln** (`spiel/rollen.mjs`, `spiel/partie.mjs`): Konstante `PETZE_AB`, genau eine Petze ab dieser Figurenzahl, Nachtaktion `petzePrueft`, Ereignis `petze-prueft` nur für die Petze sichtbar. Tests: Verteilung, Nachtaktion, Sichtbarkeit im Partie-Ereignisstrom.
2. **Gehirne** (`spiel/gehirn.mjs`, `spiel/browsergehirn.mjs`, `spiel/schleife.mjs`, `prompts/`): Werkzeug `erfragen`, Verlaufstext, Rollentext, Regelabsatz. Tests: Sichtbarkeit in jedem Text, der an ein Gehirn geht (Verlauf, Heft-Prompt).
3. **Skriptgehirne und Simulation** (`tools/skriptgehirne.mjs`, `tools/simuliere.mjs`): Petze prüft Verdächtige zuerst und sagt einen gefundenen Schatten an; Schatten darf sich als Petze ausgeben. `statistik` mit Option für Petze an/aus.
4. **Balance**: Tabelle 4–8 Figuren, mit/ohne Petze, ≥ 2000 Partien, fester Startwert in `docs/balance-petze.md`; ggf. Stellschraube; Balance-Test.
5. **Oberfläche und Ausgaben** (`public/app.js`, `server.mjs`, `tools/zug.mjs`, `tools/spiele.mjs`, `spiel/spurentafel.mjs`): Auswahl in der Nacht, Ergebnis nur für den Spieler; Hilfetext; README/PLAN.

## Test
`npm test` (ohne Netz). Sichtbarkeitstests je Ausgabestelle: `verlaufFuer`, `verlaufAlsText`, Spurentafel, Server-Verlauf (`/verlauf`, SSE), Heft-Eintrag, Zusammenfassung.

## Nicht dabei
Echte API-Aufrufe, Änderungen an den Inhaltsgrenzen in `prompts/system.md`, Browser-Sichtprüfung.
