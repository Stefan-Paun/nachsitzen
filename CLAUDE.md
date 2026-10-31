# Nachsitzen

Werwolf-artiges Spiel: Stefan + fünf Claude-Figuren nachts in einer Schule, eine ist der Schatten. Node >= 20, keine Abhängigkeiten, Deutsch im Code. Privates Projekt, Plan in `docs/PLAN.md`.

## Befehle

- `npm test`: alles ohne Netz (Regeln, Gehirn mit Fake-API, Kosten, Simulation). Exit-Code prüfen.
- `npm run simuliere`: Partien mit Skript-Gehirnen, kostet nichts.
- `npm run spiele` / `-- --zuschauen`: echte Haiku-Aufrufe, Cent-Beträge. Nur nach Stefans OK starten.

## Aufbau

- `spiel/partie.mjs`: Regeln. Jedes Ereignis hat `sichtbar` (wer es sehen darf); `verlaufFuer(name)` ist der Kontext einer Figur. Rollen, Nachtwahl und Prüfung bleiben privat.
- `spiel/gehirn.mjs`: Claude-Gehirn (Systemprompt aus `prompts/` + `figuren/`, Werkzeuge je Phase, Rückfall bei Unsinn). Gleiche Schnittstelle wie `tools/skriptgehirne.mjs`.
- `spiel/claude.mjs`: Messages-API per fetch. Haiku 5.5: kein Prefill, keine temperature, `thinking: disabled` + `effort: low`, Refusal ist HTTP 200. Nullable Enums als `anyOf`, nicht `type: [..., 'null']`.
- `spiel/kosten.mjs`: Tageszähler mit Deckel. `spiel/schleife.mjs`: eine Schleife für alle Gehirne.

## Regeln

- Harte Inhaltsgrenzen stehen in `prompts/system.md` (Tinte statt Blut, kein Suizid, nichts Sexuelles, keine echten Personen). Nie lockern.
- Der API-Schlüssel kommt nur aus Keychain oder Umgebung, nie in Dateien oder Logs.
- Neue Ereignisarten: `verlaufAlsText` in `gehirn.mjs` ergänzen und einen Sichtbarkeitstest schreiben.
- Commit-Autor `Stefan Paun <340585820+Stefan-Paun@users.noreply.github.com>`. Kein Remote bis Stefan es anlegt.
