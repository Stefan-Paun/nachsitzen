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

## Stand
Alle fünf Etappen sind umgesetzt.

- Gewählt wurde: Petze **ab 7 Figuren** (`PETZE_AB`) und **nur jede zweite Nacht** (`PETZE_JEDE`); mit diesen Werten liegt die Schatten-Siegquote bei 7 Figuren bei 44,1 % (2000 Partien, Startwert 1). Tabelle und Begründung: `docs/balance-petze.md`, Messung mit `node tools/balance.mjs`.
- Nicht im Zielbereich bleiben 5 Figuren ohne Petze (62 %) und 8 Figuren (36 % ohne, 31,8 % mit Petze): Das ist die Grundmechanik, nicht die Petze; bewusst nicht angefasst.
- Sichtbarkeit: Das Ereignis `petze-prueft` ist nur für die Petze sichtbar (`sichtbar: [petze]`); Zuschauer und Geister sehen es wie alle privaten Nacht-Ereignisse mit Namen. Tests in `test/petze.test.mjs` decken Partie, Claude-Prompts (inkl. Heft-Anfrage), Werkzeuge, Spurentafel, Server/Browser, Wahrheit und Zusammenfassung ab.
- Nicht im Browser angesehen: die Nachtauswahl der Petze in `public/app.js` ist nur per Text- und Syntaxprüfung getestet.
