# Plan: Figuren-Editor im Browser

## Ziel
Eigene Mitschüler im Browser anlegen (Name, Art zu reden, Eigenheiten, Geheimnis), prüfen und in einer
Partie mitspielen lassen, ohne JSON von Hand. Die mitgelieferten Figuren in `figuren/` bleiben unverändert.

## Entscheidungen
- Ein Schema-Modul (`spiel/figurenschema.mjs`): Pflicht-/erlaubte Felder, Längen, Zeichen, Höchstzahl 12.
  Lader, Speicher, Server und Editor benutzen dieselbe Prüfung; die sieben mitgelieferten Figuren müssen sie bestehen.
- Ablage außerhalb des Repos: `<Datenordner>/nachsitzen/figuren/<kennung>.json` (Datenordner wie bei den Heften,
  `XDG_DATA_HOME`). Die Kennung wird aus dem Namen bereinigt (a–z, 0–9, `-`), nie aus Rohtext. Papierkorb: Unterordner `geloescht`.
- Figurentexte sind Daten: im Prompt zwischen Markierungen, Steuerzeichen und Markierungen werden entfernt,
  `prompts/system.md` behält die Inhaltsgrenzen wortgleich und sie stehen hinter den Figurendaten.
- Besetzung: 3–7 KI-Figuren plus Mensch (oder Ben beim Zuschauen) = 4–8 wie in `rollen.mjs`.

## Etappen
1. Schema + Speicher (`figurenschema.mjs`, `figurenspeicher.mjs`) mit Tests (Schema, `../`, Limits, Papierkorb).
2. Prompt-Sicherheit (`figurentext`-Bereinigung in `gehirn.mjs`, Abgrenzung in `prompts/system.md`, Spielerzahl im Prompt dynamisch) mit Test für bösartigen Text.
3. Server: Routen `/figuren` (GET/POST/PUT/DELETE, `/figuren/pruefen`), Herkunftsprüfung, Körperlimit, Besetzung in `POST /partie`; Test mit Skriptgehirnen.
4. Oberfläche: Editor (Formular, Live-Prüfung, Kartenvorschau, speichern/duplizieren/Papierkorb) und Besetzungsauswahl im Start.
5. README, Plan auf Endstand.

## Test
`npm test` (ohne Netz). Keine API-Aufrufe. Oberfläche nur über reine Logik-Module getestet, nicht im Browser angesehen.

## Nicht dazu
Teilen/Hochladen von Figuren, echte API-Aufrufe, Lockerung der Inhaltsgrenzen.

## Stand
Alle fünf Etappen sind umgesetzt und committet.
1. Schema und Speicher: `spiel/figurenschema.mjs`, `spiel/figurenspeicher.mjs`, `test/figuren.test.mjs`.
2. Prompt: `spiel/figurentext.mjs`, `prompts/system.md` (Markierungen, Vorbemerkung; Grenzen unverändert), `test/figurentext.test.mjs`.
3. Server: Routen `/figuren`, `/figuren/pruefen`, `besetzung` in `POST /partie`, `test/figurenserver.test.mjs` (inkl. Simulation 4 bis 8 Figuren).
4. Oberfläche: `public/editor.js`, `public/besetzung.js`, Formular in `index.html`, achtes Pult in `klasse.js`.
5. README und dieser Plan.

Entscheidungen: Besetzung zählt die KI-Figuren (3 bis 7); Umbenennen = Duplizieren (Kennung bleibt stabil);
Nicht im Browser angesehen: Layout und Verhalten des Editors sind nur über die Logikmodule und Server-Tests abgesichert.
Offen für später: Hefte einer gelöschten Figur bleiben liegen und würden bei gleichem Namen wieder gelesen.
