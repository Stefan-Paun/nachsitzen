# Nachsitzen – Planung (Stand 31.10.2026, Arbeitstitel)

Ein Spiel, in dem du mit fünf KI-Figuren nachts in einer verlassenen Schule eingesperrt bist. Einer von euch ist **der Schatten**. Die KI-Figuren reden wirklich (Claude), lügen, verdächtigen und stimmen ab – und sie erinnern sich an dich über Spiele hinweg.

Verwandt mit der Nachtschule (Matura-Rallye), aber ein **eigenes Projekt**: kein Lernspiel, keine Fragen, eigenes Repo. Der Look und die harten Grenzen (13.14 der Nachtschule) werden übernommen.

---

## 1. Das Spiel in einer Minute

- **6 Figuren**: du + 5 KI-Schüler. Zu Beginn werden geheim Rollen verteilt: **1 Schatten**, **1 Schlüsselträger** (darf jede Nacht eine Person prüfen), 4 normale Schüler. Du kannst jede Rolle bekommen, auch den Schatten.
- **Tag/Nacht-Takt** (eine Partie = 3–6 Nächte, 15–30 Minuten):
  1. **Abend** – alle sitzen im Klassenzimmer, kurze Vorstellung, Small Talk (hier zeigen die Figuren Charakter).
  2. **Nacht** – Licht aus. Der Schatten wählt heimlich eine Person. Der Schlüsselträger prüft heimlich eine Person.
  3. **Morgen** – ein Pult ist leer, darauf ein Tintenfleck, der Name im Klassenbuch durchgestrichen. (Keine Gewalt im Bild: Tinte statt Blut, Verschwinden statt Sterben.)
  4. **Diskussion** – 3 Sprechrunden. Du tippst, die Figuren antworten einzeln, reagieren aufeinander, beschuldigen, verteidigen, schweigen.
  5. **Abstimmung** – wer wird in den Keller gesperrt? Gleichstand: niemand.
  6. **Ergebnis** – Rolle der eingesperrten Person wird aufgedeckt. Weiter mit der nächsten Nacht.
- **Sieg**: Schüler sperren den Schatten ein – oder der Schatten ist mit nur noch einer Person allein.
- **Erinnerung**: Nach jeder Partie schreibt jede Figur ein paar Sätze in ihr „Heft“: was passiert ist, wem sie vertraut, wer gelogen hat. Beim nächsten Spiel liest sie es wieder. Nach 5 Partien hast du echte Freunde und Feinde.

## 2. Die fünf Figuren (Entwurf, austauschbar)

| Name | Charakter | Spielstil |
|---|---|---|
| **Mira** | Klassensprecherin, will immer Ordnung | führt die Diskussion, fordert Abstimmungen ein |
| **Jonas** | Witzbold, nimmt nichts ernst | lenkt ab, lacht Beschuldigungen weg, selten hilfreich – bis er plötzlich doch Recht hat |
| **Lea** | Still, beobachtet | redet wenig, aber merkt sich Widersprüche und nennt sie präzise |
| **Tarik** | Impulsiv, loyal | verteidigt Freunde blind, beschuldigt schnell |
| **Nora** | Misstrauisch, logisch | rechnet mit Wahrscheinlichkeiten, traut auch dir nicht |

Jede Figur hat: Persönlichkeit (fester Systemprompt), **Rolle dieser Partie** (geheim), **eigenes Wissen** (nur was sie gehört oder nachts gesehen hat), **Heft** (Erinnerung über Partien), **Beziehungen** (Vertrauen zu jeder anderen Figur –2 bis +2, auch zu dir).

Wichtig für das Gefühl „echt“: **Jede Figur hat ihren eigenen Gesprächskontext.** Der Schatten weiß, dass er der Schatten ist. Die anderen wissen es nicht. Niemand sieht die privaten Nacht-Infos der anderen. Das ist technisch der Kern: kein gemeinsamer Prompt, sondern sechs getrennte.

## 3. Setting und Ton

- Altes Gymnasium bei Nacht, Klassenzimmer im Ostflügel, Keller als „Gefängnis“, Klassenbuch, Tinte, flackernde Lampen. Dasselbe Universum wie die Nachtschule, aber ohne Fächer und Fragen.
- **Harte Grenzen (fix, wie 13.14):** kein Gore (Tinte statt Blut, Verschwinden statt Tod), kein Selbstverletzungs-/Suizid-Thema, nichts Sexuelles, keine Folter, keine echten Personen außer deinem Vornamen, kein Kamera-/Mikrofon-Zugriff. Die Figuren bekommen diese Grenzen im Systemprompt; der Server prüft die Ausgaben zusätzlich mit einer Wortliste und wirft Verstöße weg.
- Sprache der Figuren: Deutsch, leicht österreichisch gefärbt („Oida“ sparsam, nicht als Running Gag). Später en/es wie bei Agent-Board möglich, aber nicht in v1.
- Schrecken-Regler wie in der Nachtschule: Standard „mittel“, „Dämmerung“ = alles aus.

## 4. Technik

| Baustein | Entscheidung | Warum |
|---|---|---|
| Server | **Node 20+, ohne Abhängigkeiten** (wie Agent-Board), `server.mjs` auf 127.0.0.1 | kennst du, keine npm-Risiken, der API-Schlüssel bleibt am Server |
| Browser | eine HTML-Seite, Canvas für das Pixel-Klassenzimmer, DOM für Chat und Abstimmung | Agent-Board-Stil, kein Build |
| KI | **Claude Haiku 5.5**, `thinking: disabled`, `effort: low`, Antworten als **Tool-Aufruf** (`sprechen`, `schweigen`, `anklagen`, `abstimmen`, `pruefen`, `holen`) | billig, schnell, strukturierte Ausgabe statt Textparsen; Erfahrung aus Jarvis #36 (Refusal abfangen!) |
| Prompt-Aufbau | System = Grenzen + Figur + Regeln (gecacht); Verlauf = das, was die Figur mitbekommen hat; letzter Block = „Jetzt bist du dran, Phase X“ | Prompt-Caching spart ~80 % der Eingabe-Kosten |
| Spielzustand | eine JSON-Datei pro Partie in `~/.local/share/nachsitzen/partien/`, Hefte in `hefte/<figur>.json` | einfach, offline lesbar, kein DB |
| Verbindung | Server-Sent Events für Figur-Nachrichten, `fetch` für deine Eingaben | wie Agent-Board |
| Schlüssel | `ANTHROPIC_API_KEY` aus der macOS-Keychain (`schluessel.lesen`-Muster aus Jarvis) | nie im Repo, nie im Browser |
| Kostenbremse | Zähler pro Partie und pro Tag; Standard-Deckel 0,50 €/Tag, dann „Die Schule schließt“ | Haiku 5.5 kostet 0,10 $/0,50 $ pro Million Token. Eine Partie ≈ 40–60 Aufrufe ≈ **2–4 Cent**. Der Deckel ist nur für Fehler (Endlosschleife). |

### Ablauf eines Figur-Zugs

1. Server baut den Prompt der Figur: System (gecacht) + ihr Verlauf + Phase + erlaubte Tools.
2. Claude antwortet mit genau einem Tool-Aufruf, z. B. `sprechen({ an: "Tarik", text: "Du warst gestern Nacht nicht an deinem Platz." })`.
3. Server prüft: erlaubt in dieser Phase? Grenzen eingehalten? Länge ≤ 2 Sätze in der Diskussion?
4. Server schreibt das Ereignis in die Verläufe **aller Figuren, die es hören konnten**, schickt es an den Browser, kurze Pause (Tipp-Animation), nächste Figur.
5. `stop_reason == "refusal"` oder Fehler: Figur „schweigt und schaut auf den Boden“, Spiel läuft weiter.

### Erinnerung (Hefte)

- Nach der Partie: ein Aufruf pro Figur, Haiku fasst aus ihrer Sicht zusammen: 3–5 Sätze + Vertrauenswerte zu jeder Person. Gespeichert mit Datum.
- Beim nächsten Spiel bekommt die Figur die letzten 5 Einträge ihres Hefts in den Systemprompt. Beispiel-Wirkung: „Stefan hat letzte Woche behauptet, Schlüsselträger zu sein, und war der Schatten. Ich glaube ihm heute nichts.“
- Du kannst die Hefte im Spiel lesen (Schublade im Pult), **aber erst nach der Partie** – sonst wüsstest du, wer dir misstraut.

### Reihenfolge und Fairness

- Figuren sprechen in zufälliger Reihenfolge; wer angesprochen wurde, darf als Nächster. Du kannst jederzeit dazwischen tippen; deine Nachricht wird vor dem nächsten Figur-Zug eingeschoben.
- Der Schatten bekommt denselben Prompt plus einen Absatz „Deine wahre Rolle. Lüge glaubwürdig, aber nicht perfekt“ – Haiku lügt sonst zu gut oder zu schlecht; das wird getunt.
- Der Schlüsselträger darf sein Wissen nennen oder verschweigen (die Figur entscheidet).

## 5. Aufbau des Repos

```
nachsitzen/
  server.mjs          Spielschleife, Phasen, SSE, API-Aufrufe
  spiel/              reine Logik ohne Netz (testbar): regeln.mjs, rollen.mjs, abstimmung.mjs, hefte.mjs
  figuren/            mira.json, jonas.json, … (Persönlichkeit, Sprache, Eigenheiten)
  prompts/            system.md (Grenzen + Regeln), phasen/*.md
  public/             index.html, app.js, klasse.js (Canvas), style.css, i18n.js (vorerst nur de)
  test/               regeln.test.mjs, abstimmung.test.mjs, hefte.test.mjs, prompts.test.mjs, simulation.test.mjs
  tools/              simuliere.mjs (Partie mit Skript-Gehirnen ohne API), kosten.mjs
  docs/               PLAN.md (dieses Dokument), DESIGN.md (später, Impeccable)
```

**Skript-Gehirne**: `tools/simuliere.mjs` spielt komplette Partien mit festen Antworten (Schatten holt immer den Lautesten, Nora stimmt immer gegen den, der zuletzt gelogen hat …). Damit testest du Regeln, Siegbedingungen und Abstimmungen **ohne einen Cent** und ohne Wackler. Echte Claude-Aufrufe nur im echten Spiel und in einem manuellen Smoke-Test.

## 6. Meilensteine

| # | Ziel | Was fertig ist | Zeit |
|---|---|---|---|
| **M0** | Regeln ohne KI | `spiel/` komplett mit Tests, Simulation läuft 100 Partien durch, Siegbedingungen stimmen, keine Endlosschleife | 1 Nachmittag |
| **M1** | Erste echte Figur | Server ruft Haiku mit Tools auf, Refusal/Fehler abgefangen, Kostenzähler, Keychain-Schlüssel. Eine Partie im Terminal (ohne Browser) spielbar | 1 Tag |
| **M2** | Spielbar im Browser (Text) | Chat-Ansicht mit Pixel-Avataren, Phasen-Anzeige, Abstimmung per Klick, Tipp-Animation. Noch kein Klassenzimmer-Canvas. **Hier das erste Mal Freunden zeigen.** | 1 Wochenende |
| **M3** | Hefte | Erinnerung über Partien, Vertrauenswerte, Hefte lesen nach der Partie | 1 Nachmittag |
| **M4** | Das Klassenzimmer | Canvas: 6 Pulte, Figuren laufen in der Nacht, Lampen, leeres Pult mit Tintenfleck, Keller-Tür. Impeccable-Durchlauf wie bei tv-home | 1–2 Wochenenden |
| **M5** | Feinschliff | Ton (Wind, Klavier aus der Nachtschule), Schrecken-Regler, Dämmerung, README mit GIF, Portfolio-Eintrag, Veröffentlichung | 1 Wochenende |

Nach M5 kamen aus der Tester-Runde (10 Agenten, 31.10.) drei Fassungen: **v1.1** (geheime Abstimmung, Nacht-1-Schutz, Vorzeigen, Nachbar-Sicht), **v1.2** (7 Spieler, Spur verwischen, Wahrheit am Ende, Hefte kürzer) und **v1.3** (Plätze mit Eigenwert: Tür hört, Tafel merkt den Durchgang, Pulte sehen links/rechts, Fenster zeigt alle; Untersuchen höchstens dreimal pro Partie; Opfer-Szenen mit Varianten; wer raus ist, sieht als Geist alles).

Nach **M2** hast du etwas, das Spaß macht und das du zeigen kannst. Alles danach ist Kür. Realistisch bei Schule + Matura: M0–M2 bis Mitte November, M4 bis Weihnachten.

## 7. Risiken und wie wir sie klein halten

| Risiko | Gegenmittel |
|---|---|
| Figuren klingen alle gleich | Pro Figur 3 Beispiel-Sätze im Prompt, feste Eigenheiten (Jonas fängt mit „Okay aber“ an, Lea nie mehr als ein Satz), Test „Blindverkostung“: 10 Antworten, erkennst du die Figur? |
| Schatten verrät sich sofort oder nie | Eigener Prompt-Absatz, Tuning mit 20 Sim-Partien; Zielquote: Schüler gewinnen 50–60 % |
| Kosten laufen weg | Deckel pro Tag, max. Züge pro Phase, Prompt-Caching, Haiku mit effort low |
| Langweilig ab Partie 3 | Hefte (Beziehungen), zufällige Ereignisse (Stromausfall: eine Diskussionsrunde ohne Namen; Fundstück: ein Hinweis auf eine Rolle) ab M3 |
| Horror kippt in Ekel | Grenzen im Systemprompt + Wortfilter + Schrecken-Regler; Review jeder neuen Szene gegen 13.14 |
| Haiku-Eigenheiten | Erfahrung aus Jarvis #36: kein Prefill, keine temperature, Refusal abfangen, web_search nicht nötig |
| API-Schlüssel landet im Repo | gitleaks-Hook global aktiv, Schlüssel nur aus Keychain, `.env*` global ignoriert |

## 8. Was ich von dir brauche (Entscheidungen)

1. **Name**: „Nachsitzen“ als Arbeitstitel ok? (Alternativen: Sperrstunde, Klassenbuch, Die sechste Stunde)
2. **Repo**: privat starten, bei M5 öffentlich? (Empfehlung: ja. Öffentlich erst, wenn Prompts und Kostenbremse sauber sind.)
3. **Figuren**: passen die fünf oder willst du eigene erfinden? Namen, Charaktere, auch gemein sein ist erlaubt.
4. **Du als Schatten**: zufällig (1 von 6) oder willst du am Anfang immer Schüler sein, bis du das Spiel kennst?
5. **Start**: M0 kann ich sofort allein bauen (reine Logik, Tests, Simulation, kein API-Geld). M1 braucht einmal dein OK für echte Haiku-Aufrufe (Cent-Beträge).

## 9. Nicht in v1

Sprachausgabe der Figuren (später mit Jarvis-TTS), Mehrspieler mit Freunden online, weitere Sprachen, Handy-Layout, eigene Figuren-Editor. Alles möglich, aber erst nach M5.
