// Reine Logik fuer Besetzung und Figuren-Formular (ohne DOM, damit testbar).

export const MIN_KI = 3, MAX_KI = 7   // plus du oder Ben: 4 bis 8 Figuren im Raum

// Passt die Auswahl? -> { ok, text }
export function pruefeBesetzung(anzahl, min = MIN_KI, max = MAX_KI) {
  if (anzahl < min) return { ok: false, text: `Wähle noch ${min - anzahl} Figur${min - anzahl === 1 ? '' : 'en'} (mindestens ${min}).` }
  if (anzahl > max) return { ok: false, text: `Das sind ${anzahl - max} zu viel (höchstens ${max}).` }
  return { ok: true, text: `${anzahl} Figuren plus du: ${anzahl + 1} im Raum.` }
}

// Eine stabile Farbe fuer Namen ohne eigene Farbe im Stylesheet (eigene Figuren)
export function farbeFuer(name) {
  let h = 0
  for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) % 360
  return `hsl(${h} 60% 68%)`
}

export const LEER = { name: '', alter: '17', beschreibung: '', stil: '', b1: '', b2: '', b3: '', geheimnis: '', frisur: 'kurz', haut: '#f1cfb0', haar: '#2b2118', shirt: '#7a7f9a' }

// Formularwerte (alles Text) -> Figur fuer den Server
export function formularZuFigur(f) {
  const figur = {
    name: f.name, alter: f.alter, beschreibung: f.beschreibung, stil: f.stil,
    beispiele: [f.b1, f.b2, f.b3].map((x) => String(x ?? '').trim()).filter(Boolean),
    aussehen: { haut: f.haut, haar: f.haar, frisur: f.frisur, shirt: f.shirt },
  }
  if (String(f.geheimnis ?? '').trim()) figur.geheimnis = f.geheimnis
  if (String(f.alter ?? '').trim() === '') delete figur.alter
  return figur
}

// Figur vom Server -> Formularwerte
export function figurZuFormular(figur) {
  const b = figur.beispiele || []
  const a = { ...LEER, ...(figur.aussehen || {}) }
  return { name: figur.name || '', alter: String(figur.alter ?? ''), beschreibung: figur.beschreibung || '', stil: figur.stil || '', b1: b[0] || '', b2: b[1] || '', b3: b[2] || '', geheimnis: figur.geheimnis || '', frisur: a.frisur, haut: a.haut, haar: a.haar, shirt: a.shirt }
}

// Name fuer eine Kopie: "Paula" -> "Paula 2", "Paula 2" -> "Paula 3", gekuerzt auf 20 Zeichen
export function kopieName(name, vergeben = []) {
  const belegt = new Set(vergeben.map((n) => n.toLowerCase()))
  const basis = String(name).replace(/ \d+$/, '')
  for (let i = 2; i < 100; i++) {
    const nr = ` ${i}`
    const kandidat = basis.slice(0, 20 - nr.length).trimEnd() + nr
    if (!belegt.has(kandidat.toLowerCase())) return kandidat
  }
  return basis.slice(0, 17) + ' 99'
}

// Fehler je Feld sammeln: Formularfeld-Namen auf Schema-Felder abbilden
export function fehlerJeFeld(fehler) {
  const m = {}
  for (const f of fehler || []) (m[f.feld === 'beispiele' ? 'b1' : f.feld === 'aussehen' ? 'frisur' : f.feld ?? 'name'] ||= []).push(f.text)
  return m
}
