// Rollenverteilung: genau ein Schatten, genau ein Schluesseltraeger, ab PETZE_AB Figuren genau eine Petze, der Rest Schueler.
// Stefan bekommt jede Rolle mit derselben Wahrscheinlichkeit wie die KI-Figuren.

export const SCHATTEN = 'schatten'
export const SCHLUESSEL = 'schluessel'
export const SCHUELER = 'schueler'
export const PETZE = 'petze'
export const PETZE_AB = 7   // ab so vielen Figuren gibt es eine Petze; darunter kippt das Gleichgewicht (Messung: docs/balance-petze.md)

// `petze`: true/false erzwingt die Rolle an/aus (Simulation), null = ab PETZE_AB.
export function verteileRollen(namen, zufall, { petze = null } = {}) {
  if (new Set(namen).size !== namen.length) throw new Error('Namen muessen eindeutig sein')
  if (namen.length < 4) throw new Error('Mindestens 4 Figuren')
  if (namen.length > 8) throw new Error('Höchstens 8 Figuren')
  const reihe = zufall.mischen(namen)
  const mitPetze = petze ?? namen.length >= PETZE_AB
  if (mitPetze && namen.length < 4) throw new Error('Mindestens 4 Figuren')
  const rollen = {}
  reihe.forEach((name, i) => { rollen[name] = i === 0 ? SCHATTEN : i === 1 ? SCHLUESSEL : i === 2 && mitPetze ? PETZE : SCHUELER })
  return rollen
}

// Was eine Figur zu Spielbeginn ueber Rollen weiss: nur die eigene.
export function eigeneRolle(rollen, name) {
  return rollen[name]
}
