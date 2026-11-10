# Balance mit der Petze

Gemessen mit `node tools/balance.mjs 2000 1`: je Zelle 2000 Partien mit Skript-Gehirnen (kein Netz), Startwert 1 (Partie *i* nutzt Startwert 1+*i*). Angegeben ist die **Siegquote des Schattens**; Ziel: 40–60 %.

| Figuren | ohne Petze | Petze, jede Nacht | Petze, jede 2. Nacht (Standard) |
|---|---|---|---|
| 4 | 49,0 % | 38,6 % | 38,6 % |
| 5 | 62,0 % | 50,0 % | 50,8 % |
| 6 | 41,1 % | 31,4 % | 35,3 % |
| 7 | 52,0 % | 39,4 % | **44,1 %** |
| 8 | 36,0 % | 30,5 % | 31,8 % |

## Entscheidungen

- Die Petze kostet die Schüler ein Gewicht, das sie nicht zurückbekommen: Jede Nacht geprüft zieht die Schattenquote um 6 bis 12 Punkte nach unten. Jede Nacht und bei jeder Figurenzahl wäre die Quote bei 7 Figuren knapp unter 40 %, bei 4 und 6 deutlich darunter.
- **Stellschraube 1: Petze erst ab 7 Figuren** (`PETZE_AB` in `spiel/rollen.mjs`). Bei 4 bis 6 Figuren rutscht die Quote mit Petze unter 40 %; ohne Petze liegen 4 (49 %) und 6 (41,1 %) im Ziel.
- **Stellschraube 2: Die Petze erfährt nur jede zweite Nacht etwas** (Nacht 1, 3, …; `PETZE_JEDE` in `spiel/partie.mjs`). Jede Nacht ergäbe bei 7 Figuren 39,4 % und läge knapp unter dem Ziel; jede zweite Nacht ergibt 44,1 %.
- Das Spiel läuft mit 7 Figuren (sechs KI-Figuren plus Mensch oder Ben). Dort liegt die Quote mit Petze bei 44,1 %. Der Balance-Test in `test/petze.test.mjs` prüft genau das, mit festem Startwert.
- Das Schatten-Skript holt zuerst, wer ihn öffentlich als Schatten angesagt hat („Ich bin die Petze…“ oder „Ich habe nachts nachgesehen…“) und gibt sich selbst gelegentlich als Petze aus. Das gilt auch für die Zeilen ohne Petze und hat die Quote dort um etwa einen Punkt gehoben (7 Figuren: 50,8 % → 52,0 %).

## Was nicht im Ziel liegt, und warum

- **5 Figuren ohne Petze (62 %) und 8 Figuren (36 % / 31,8 %)** liegen auch ohne Petze außerhalb des Bereichs: Das ist die Grundmechanik (nach jeder Nacht plus Abstimmung fehlen zwei Figuren, bei gerader und ungerader Zahl rutscht der Schatten anders in sein Ziel „nur noch zwei“). Daran wurde bewusst nichts geändert, es gehört nicht zur Petze. Bei 8 Figuren zieht die Petze die Quote von 36,0 % auf 31,8 %; wer 8 Figuren spielen will, sollte die Basis separat nachjustieren.
- Alle Zahlen gelten für Skript-Gehirne. Claude-Figuren spielen anders (sie reden mehr und lügen besser); die Zahlen sind ein Gleichgewichtsmaß, keine Vorhersage.
