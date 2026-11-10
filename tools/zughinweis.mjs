// Eingabehinweis fuer tools/zug.mjs: sagt, was der Spieler als Naechstes tun kann.
// Rein (kein Netz), damit ein Test alle `warte`-Arten abdecken kann.

export function hinweisFuer(w) {
  if (!w) return '--- Die anderen sind dran. Nochmal aufrufen.'
  if (w.art === 'sagen') return `--- DU BIST DRAN: --sagen "..." [--an ${w.andere.join('|')}]${w.pflicht ? ' (Pflicht)' : ' oder --schweigen'}`
  if (w.art === 'nacht') return `--- NACHT: --platz ${w.orte.join('|')}${w.aufgabe !== 'verstecken' ? ` --ziel ${w.optionen.join('|')}  (${w.aufgabe === 'holen' ? 'Pflicht: wen du holst' : w.aufgabe === 'erfragen' ? 'Pflicht: von wem du die Rolle erfahren willst' : 'Pflicht: wen du prüfst'})` : ''}${w.verwischen ? ' [--verwischen: einmalig die Spur verwischen]' : ''}`
  if (w.art === 'untersuchen') return `--- UNTERSUCHEN (noch ${w.uebrig ?? '?'}× in dieser Partie): --untersuchen ${w.orte.join('|')}|nichts`
  if (w.art === 'zeigen') return `--- VORZEIGEN? Dein Ergebnis: „${w.ergebnis}“ · --zeigen ja|nein (vorgezeigt = für alle bewiesen)`
  if (w.art === 'stimme') return `--- ABSTIMMUNG (geheim): --stimme ${w.optionen.join('|')}|niemand`
  return `--- Das Spiel wartet auf dich (${w.art}).`
}

// Die Spurentafel-Zeile gilt, wenn man tagsueber etwas entscheiden soll.
export function tafelZeile(w) {
  return w && (w.art === 'sagen' || w.art === 'untersuchen' || w.art === 'stimme') ? '--- Übersicht: --tafel' : null
}

// Kurze deutsche Meldung, wenn kein Server antwortet.
export function verbindungsFehler(port, fehler) {
  const grund = fehler?.cause?.code || fehler?.code
  if (grund === 'ECONNREFUSED' || grund === 'ECONNRESET') return `Kein Server auf Port ${port} – starte ihn mit: npm start -- --skript`
  return `Verbindung zu Port ${port} fehlgeschlagen: ${fehler?.message || fehler}`
}
