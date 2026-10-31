// Rollenverteilung: genau ein Schatten, genau ein Schluesseltraeger, der Rest Schueler.
// Stefan bekommt jede Rolle mit derselben Wahrscheinlichkeit wie die KI-Figuren.

export const SCHATTEN = 'schatten'
export const SCHLUESSEL = 'schluessel'
export const SCHUELER = 'schueler'

export function verteileRollen(namen, zufall) {
  if (new Set(namen).size !== namen.length) throw new Error('Namen muessen eindeutig sein')
  if (namen.length < 4) throw new Error('Mindestens 4 Figuren')
  if (namen.length > 8) throw new Error('Höchstens 8 Figuren')
  const reihe = zufall.mischen(namen)
  const rollen = {}
  reihe.forEach((name, i) => { rollen[name] = i === 0 ? SCHATTEN : i === 1 ? SCHLUESSEL : SCHUELER })
  return rollen
}

// Was eine Figur zu Spielbeginn ueber Rollen weiss: nur die eigene.
export function eigeneRolle(rollen, name) {
  return rollen[name]
}
