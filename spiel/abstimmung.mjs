// Abstimmung: wer in den Keller kommt. Jede lebende Figur hat eine Stimme,
// Enthaltung ist erlaubt (null). Gleichstand oder keine Stimmen = niemand.

export function auswerten(stimmen, lebende) {
  const zaehler = new Map()
  for (const wer of lebende) {
    const fuer = stimmen[wer]
    if (fuer == null) continue
    if (!lebende.includes(fuer)) throw new Error(`${wer} stimmt fuer ${fuer}, aber ${fuer} ist nicht im Raum`)
    if (fuer === wer) throw new Error(`${wer} darf nicht fuer sich selbst stimmen`)
    zaehler.set(fuer, (zaehler.get(fuer) || 0) + 1)
  }
  let beste = 0, kandidaten = []
  for (const [name, n] of zaehler) {
    if (n > beste) { beste = n; kandidaten = [name] }
    else if (n === beste) kandidaten.push(name)
  }
  return {
    eingesperrt: kandidaten.length === 1 ? kandidaten[0] : null,
    gleichstand: kandidaten.length > 1,
    zaehler: Object.fromEntries(zaehler),
  }
}
