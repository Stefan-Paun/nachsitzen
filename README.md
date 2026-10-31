# Nachsitzen

Nachts in der Schule eingesperrt, mit fünf KI-Figuren. Eine davon ist der Schatten.

Ein Spiel im Stil von Werwolf: Die Mitspieler sind Claude-Figuren mit eigenem Wissen, eigenem Charakter und einem Heft, in dem sie sich merken, wem sie trauen. Du bist eine der sechs Figuren.

**Stand: M2** – spielbar im Browser und im Terminal, mit echten Claude-Figuren (Haiku 5.5). Plan: [docs/PLAN.md](docs/PLAN.md).

```
npm start                         # http://localhost:4800 – mitspielen oder zuschauen
npm start -- --skript             # dieselbe Oberfläche ohne KI und ohne Kosten (zum Entwickeln)
npm test                          # Regeln, Gehirn, API-Hülle, Server, Simulation (ohne Netz)
npm run simuliere                 # 100 Partien mit Skript-Gehirnen, Siegquoten
npm run spiele                    # eine echte Partie, du bist Stefan
npm run spiele -- --zuschauen     # sechs KI-Figuren, du schaust zu
```

Der API-Schlüssel kommt aus der macOS-Keychain (Eintrag `anthropic-api-key`) oder aus `ANTHROPIC_API_KEY`. Eine Partie kostet etwa 2 Cent; der Tagesdeckel steht in `spiel/kosten.mjs`.
