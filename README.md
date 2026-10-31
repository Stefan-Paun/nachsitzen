# Nachsitzen

Nachts in der Schule eingesperrt, mit sechs KI-Figuren. Eine davon ist der Schatten.

![Eine Partie Nachsitzen: das Pixel-Klassenzimmer, darunter der Chat der Figuren, rechts die Spurentafel](docs/img/demo.gif)

Ein Spiel im Stil von Werwolf, nur dass die Mitspieler Claude-Figuren sind: Jede hat ihren eigenen Charakter, sieht nachts nur, was in ihrer Nähe passiert, lügt über ihren Platz, wenn es ihr nützt, und schreibt nach der Partie in ihr **Heft**, wem sie traut. Beim nächsten Spiel liest sie es wieder. Du bist eine der sieben Figuren. Vielleicht der Schatten.

*English in one paragraph: a social-deduction game (think Werewolf) where the other six players are Claude characters with separate hidden knowledge, real night-time evidence (ink trails, chalk dust, witnesses), and a notebook that carries grudges and trust across games. German only for now. You run it locally with your own Anthropic API key; a game costs a few cents.*

## Spielen mit deiner eigenen KI

Nachsitzen läuft nur auf deinem Rechner. Die Figuren denken mit Claude; dafür brauchst du einen **eigenen API-Schlüssel von Anthropic**. Es gibt keinen Server von mir, keine Anmeldung, nichts wird irgendwohin geschickt außer an die Claude-API.

**1. Voraussetzungen**

- [Node.js](https://nodejs.org) 20 oder neuer (`node --version`)
- einen Anthropic-API-Schlüssel: Konto auf [console.anthropic.com](https://console.anthropic.com) anlegen, ein paar Dollar Guthaben laden, unter *API Keys* einen Schlüssel erzeugen. Er beginnt mit `sk-ant-`.

**2. Holen**

```
git clone https://github.com/Stefan-Paun/nachsitzen.git
cd nachsitzen
```

Es gibt nichts zu installieren: keine Abhängigkeiten, kein Build.

**3. Schlüssel verbinden** (eine der beiden Möglichkeiten)

| Wo | So |
|---|---|
| Umgebungsvariable (Mac, Linux, Windows) | `export ANTHROPIC_API_KEY=sk-ant-…` vor dem Start (Windows PowerShell: `$env:ANTHROPIC_API_KEY="sk-ant-…"`) |
| macOS-Schlüsselbund (bleibt dauerhaft, landet nie in einer Datei) | `security add-generic-password -a "$USER" -s anthropic-api-key -w` und den Schlüssel eintippen |

Der Schlüssel wird nur vom lokalen Server gelesen und nie an den Browser geschickt. Er gehört nicht ins Repo und in keine Datei im Projekt.

**4. Starten**

```
npm start
```

Dann [http://localhost:4800](http://localhost:4800) öffnen, Namen eintippen, **Mitspielen**. Mit **Nur zuschauen** spielen sieben Figuren ohne dich. Beenden mit `Strg+C`.

**Ohne Schlüssel ausprobieren:** `npm start -- --skript` startet dieselbe Oberfläche mit einfachen Skript-Figuren. Die reden Unsinn, aber du siehst das Spiel, kostenlos.

**5. Was es kostet**

Die Figuren laufen auf Claude Haiku 5.5. Eine Partie braucht 40 bis 80 Aufrufe und kostet **etwa 2 bis 4 Cent**. Eingebaut ist ein **Tagesdeckel von 0,50 $**: Ist er erreicht, verstummen die Figuren bis zum nächsten Tag, und der Browser sagt dir das. Den Deckel änderst du in `spiel/kosten.mjs` (`DECKEL_PRO_TAG`), das Modell in `spiel/claude.mjs` (`MODELL`). Verbrauch nachsehen: `~/.local/share/nachsitzen/kosten.json`.

**Wenn etwas nicht geht**

| Meldung | Ursache |
|---|---|
| `Kein API-Schluessel` | Umgebungsvariable nicht gesetzt oder kein Schlüsselbund-Eintrag `anthropic-api-key` |
| `API 401` | Schlüssel falsch oder widerrufen |
| `API 400` mit `credit balance` | kein Guthaben im Anthropic-Konto |
| Figuren schweigen, Rückfall-Meldungen im Terminal | Tagesdeckel erreicht oder Netz weg; `npm start` zeigt es |
| Port belegt | `NACHSITZEN_PORT=4801 npm start` |

Mitspielen geht auch ohne Browser: `node tools/zug.mjs 4800 --neu DeinName`, dann `node tools/zug.mjs 4800` und die Befehle, die es vorschlägt; `--tafel` zeigt die Spurentafel als Text. `npm run spiele` spielt ganz im Terminal und blendet die Tafel vor jedem Gespräch ein.

## Was passiert

| Phase | |
|---|---|
| Abend | Sieben sitzen fest: du und sechs Figuren mit eigenem Kopf. Eine ist der Schatten, eine hat den Schlüssel. |
| Nacht | Jeder stellt sich an einen von vier Plätzen. Der Schatten schleicht zu seinem Opfer. Du bekommst mit, was in deiner Nähe passiert: Schritte, jemand, der sich bewegt, wer neben dir steht. |
| Morgen | Ein Pult ist leer. Die Tintenspur zeigt, von welcher Seite der Schatten kam, Kreidestaub, wo er durchging, manchmal bleibt ein halber Satz des Opfers. Jeder darf einen Platz oder das Klassenbuch untersuchen und sein Ergebnis **vorzeigen**: Vorgezeigt gilt es als bewiesen. |
| Gespräch | Die Figuren vergleichen Behauptungen mit dem, was sie gesehen haben. Wer über seinen Platz lügt, kann auffliegen. Wer angesprochen wird, antwortet als Nächster. |
| Abstimmung | Geheim: Jeder schreibt einen Namen auf einen Zettel, aufgedeckt wird erst am Ende. Wer die meisten Stimmen hat, kommt in den Keller, und die Rolle wird bekannt. |
| Danach | Jede Figur schreibt in ihr Heft, wem sie traut. Beim nächsten Spiel liest sie es wieder. Und das Spiel zeigt die Wahrheit: alle Rollen und wer in welcher Nacht wo stand. |

Jeder Platz hat nachts einen Vorteil: Bei der **Tür** hörst du jeden Schritt im Raum und die Richtung. An der **Tafel** merkst du sicher, wer vorbeihuscht. Bei den **Pulten** siehst du je eine Person links und rechts. Am **Fenster** zeigt das Mondlicht alle, die dort stehen. Untersuchen darf jeder einmal am Tag, höchstens dreimal pro Partie.

Regeln, die man wissen sollte: In der ersten Nacht holt der Schatten nie den menschlichen Spieler. Der Schatten darf einmal pro Partie seine Spur verwischen. Scheidest du aus, schaust du als Geist weiter zu und siehst dann alles, auch die Nacht der anderen. Manchmal passiert etwas: ein Zettel unter der Tür (sagt die Wahrheit), der Hausmeister rüttelt (nur eine Gesprächsrunde), die Glocke läutet (offene Abstimmung).

Begriffe: Die Schule hat sieben **Pulte** (eines je Figur) und vier **Plätze** für die Nacht (Tür, Tafel, Pulte, Fenster). Wer verschwindet, wurde vom Schatten geholt; wer im **Keller** sitzt, wurde eingesperrt.

Regler oben: **Ton** (Wind und Klavier aus WebAudio), **Schrecken** (höchstens einer pro Nacht, nie während du dran bist), **Dämmerung** (alles ruhiger, heller, ohne Bewegung).

## Die Figuren

Mira (Klassensprecherin, will Ordnung), Jonas (Witzbold, lenkt ab), Lea (still, merkt sich Widersprüche), Tarik (impulsiv, loyal), Nora (misstrauisch, rechnet), Sam (neu, glaubt zu schnell) und, wenn du nur zuschaust, Ben (Wiederholer, trocken). Ihre Charaktere stehen in `figuren/*.json`, die Spielregeln für sie in `prompts/`. Eigene Figuren: eine JSON-Datei nach demselben Muster, Name in `server.mjs` eintragen.

Die Hefte liegen außerhalb des Repos unter `~/.local/share/nachsitzen/hefte/`. Löschst du sie, fangen die Figuren wieder bei null an.

## Entwickeln

```
npm test                          # 51 Tests ohne Netz: Regeln, Welt, Gehirn mit Fake-API, Server, Simulation
npm run simuliere                 # 100 Partien mit Skript-Gehirnen, Siegquoten
npm run spiele -- --zuschauen     # eine echte Partie im Terminal (kostet Cent)
```

Aufbau: `spiel/partie.mjs` (Regeln; jedes Ereignis weiß, wer es sehen darf), `spiel/welt.mjs` (die Wahrheit hinter dem Gerede: Plätze, Spuren, Beobachtungen), `spiel/gehirn.mjs` (Claude-Figur mit eigenem Kontext und Werkzeug-Aufrufen), `spiel/hefte.mjs` (Erinnerung), `spiel/spurentafel.mjs` (die Spurentafel als Text für Terminal und `zug.mjs --tafel`), `server.mjs` (lokaler Server, SSE), `public/` (Browser, Pixelszene). Der Plan mit allen Entscheidungen: [docs/PLAN.md](docs/PLAN.md).

Harte Grenzen für die Figuren stehen in `prompts/system.md`: Tinte statt Blut, nichts zu Selbstverletzung, nichts Sexuelles, keine echten Personen. Gruselig darf es sein, grausam nicht.

## Lizenz

MIT. Gebaut von Stefan Paun, 17, Wien, mit Claude Code. Feedback gern als Issue.
