// Das Klassenzimmer als Pixelbild: Wand mit Tuer, Tafel und Fenster, sechs Pulte, die Lampe.
// layout() rechnet aus dem Wissensstand aus, wer wo gezeichnet wird (testbar ohne Browser);
// zeichne() malt es. Logische Groesse 320x120 Pixel, der Browser skaliert pixelig hoch.

export const B = 320, H = 120
const WAND_UNTEN = 58

// Zonen fuer die vier Plaetze (x-Mitte, y der Fuesse) und die sechs Pulte
export const ZONEN = { 'Tür': { x: 40, y: 88 }, 'Tafel': { x: 112, y: 76 }, 'Pulte': { x: 178, y: 104 }, 'Fenster': { x: 276, y: 86 } }   // Tuer-Zone steht rechts neben der Kellerluke
export const PULTE = [[118, 84], [162, 84], [206, 84], [118, 106], [162, 106], [206, 106]]   // Tischkante links-oben
const F = { 'Tür': '#3a2f28', 'Tafel': '#1f3a2e', 'Pulte': '#5b4630', 'Fenster': '#1c2440' }

export const PAL = {
  wand: '#2a2f4a', wandDunkel: '#232840', boden: '#5a4634', bodenDunkel: '#4e3c2d', leiste: '#3b2c20',
  tuer: '#6b4a2e', tuerDunkel: '#4e3521', klinke: '#d9b35a', tafel: '#1f3d33', tafelRahmen: '#7a5a3a', kreide: '#e8e4d8',
  fenster: '#8fb4d9', fensterNacht: '#15213f', rahmen: '#3b2c20', mond: '#f3ead8', pult: '#8a6a45', pultKante: '#6a4f32', stuhl: '#4a3625',
  lampe: '#f6c667', lampeAus: '#555a6e', schnur: '#777', tinte: '#2a1f5e', staub: '#d9cdb4', zettel: '#f3ead8', keller: '#1a1410', gitter: '#777',
}

const PERSON = { b: 12, h: 14 }
const sortiert = (l) => [...l].sort()

// Schrecken: hoechstens einer pro Nacht, nie zweimal derselbe in einer Partie, nie waehrend einer Eingabe.
export const SCHRECKEN = ['gestalt', 'fenster', 'flackern']
export function waehleSchreck(benutzt, zufall = Math.random) {
  const frei = SCHRECKEN.filter((s) => !benutzt.includes(s))
  if (!frei.length || zufall() > 0.55) return null
  return frei[Math.floor(zufall() * frei.length)]
}

// Wer steht wo? zustand: { phase, namen, lebende, verschwunden, keller, spieler, zuschauen, plaetze, opfer, pulte }
// Rueckgabe: { figuren: [{ name, x, y, modus }], leerePulte: [index], ... } - alles in logischen Pixeln.
export function layout(z) {
  const nacht = z.phase === 'nacht' || z.phase === 'morgen'
  const figuren = []
  const pultVon = (n) => z.pulte?.[n] ?? z.namen.indexOf(n)
  if (nacht) {
    // Nur Figuren mit bekanntem Platz; mehrere am selben Platz stehen nebeneinander
    const proZone = {}
    for (const n of z.lebende) { const o = z.plaetze?.[n]; if (o && ZONEN[o]) (proZone[o] ||= []).push(n) }
    for (const [o, namen] of Object.entries(proZone)) {
      const liste = sortiert(namen)
      const breite = (liste.length - 1) * 16
      liste.forEach((n, i) => figuren.push({ name: n, x: Math.round(ZONEN[o].x - breite / 2 + i * 16 - PERSON.b / 2), y: ZONEN[o].y - PERSON.h, modus: 'steht', ort: o }))
    }
  } else {
    for (const n of z.lebende) {
      const p = PULTE[pultVon(n) % PULTE.length]
      figuren.push({ name: n, x: p[0] + 6, y: p[1] - PERSON.h + 2, modus: 'sitzt', ort: null })
    }
  }
  const leerePulte = (z.verschwunden || []).map((n) => pultVon(n) % PULTE.length)
  return { nacht, figuren, leerePulte, imKeller: (z.keller || []).length, unbekannt: nacht ? z.lebende.filter((n) => !(z.plaetze?.[n])) : [] }
}

// --- Zeichnen --------------------------------------------------------------------------------
export function zeichneFigur(g, x, y, look, px = 1, { dunkel = false } = {}) {
  const { haut = '#f1cfb0', haar = '#2b2118', frisur = 'kurz', shirt = '#888' } = look || {}
  const t = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(v * k); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})` }
  const k = dunkel ? 0.55 : 1
  const r = (dx, dy, w, h, f) => { g.fillStyle = k === 1 ? f : t(f, k); g.fillRect(x + dx * px, y + dy * px, w * px, h * px) }
  r(3, 10, 6, 4, shirt); r(2, 11, 1, 3, shirt); r(9, 11, 1, 3, shirt)
  r(5, 9, 2, 1, haut); r(3, 3, 6, 6, haut)
  r(4, 5, 1, 1, '#1b1f3a'); r(7, 5, 1, 1, '#1b1f3a'); r(5, 7, 2, 1, t(haut, .8))
  r(3, 2, 6, 1, haar); r(2, 3, 1, 2, haar); r(9, 3, 1, 2, haar)
  if (frisur === 'lang') { r(2, 3, 1, 7, haar); r(9, 3, 1, 7, haar); r(3, 1, 6, 1, haar) }
  if (frisur === 'bob') { r(2, 3, 1, 5, haar); r(9, 3, 1, 5, haar); r(3, 1, 6, 1, haar); r(3, 3, 6, 1, haar) }
  if (frisur === 'zopf') { r(3, 1, 6, 1, haar); r(9, 4, 1, 5, haar); r(9, 9, 1, 1, haar) }
  if (frisur === 'wuschel') { r(2, 1, 8, 2, haar); r(1, 2, 1, 1, haar); r(10, 2, 1, 1, haar); r(4, 3, 1, 1, haar); r(7, 3, 1, 1, haar) }
  if (frisur === 'kurz') r(3, 1, 6, 1, haar)
}

// szene: { layout, looks, spieler, lampe (0..1), positionen: {name: {x,y}}, spur, staub:Set, durchgang:Set, zettel, sprecher, ende, phase }
export function zeichne(canvas, s) {
  const g = canvas.getContext('2d')
  g.imageSmoothingEnabled = false
  const licht = s.lampe   // 1 = Tag, 0 = Nacht
  const mix = (tag, nacht) => licht >= 1 ? tag : licht <= 0 ? nacht : blend(tag, nacht, licht)
  const r = (x, y, w, h, f) => { g.fillStyle = f; g.fillRect(x, y, w, h) }

  // Wand und Boden
  r(0, 0, B, WAND_UNTEN, mix(PAL.wand, '#141829'))
  for (let x = 0; x < B; x += 16) r(x, 0, 8, WAND_UNTEN, mix(PAL.wandDunkel, '#121626'))
  r(0, WAND_UNTEN, B, H - WAND_UNTEN, mix(PAL.boden, '#2b2219'))
  for (let y = WAND_UNTEN; y < H; y += 8) r(0, y, B, 1, mix(PAL.bodenDunkel, '#241c15'))
  r(0, WAND_UNTEN - 3, B, 3, mix(PAL.leiste, '#1e1610'))

  // Tuer (links), mit Zettel darunter
  r(12, 14, 32, WAND_UNTEN - 14, mix(PAL.tuerDunkel, '#2a1d14')); r(15, 17, 26, WAND_UNTEN - 19, mix(PAL.tuer, '#3a2a1c'))
  r(17, 20, 10, 14, mix(PAL.tuerDunkel, '#2a1d14')); r(29, 20, 10, 14, mix(PAL.tuerDunkel, '#2a1d14'))
  r(36, 38, 3, 2, PAL.klinke)
  if (s.ende) { r(15, 17, 26, WAND_UNTEN - 19, '#f6e7b4'); r(10, WAND_UNTEN, 40, 30, 'rgba(246,231,180,.18)') }
  if (s.zettel) { r(20, WAND_UNTEN - 2, 8, 5, PAL.zettel); r(22, WAND_UNTEN - 1, 4, 1, '#888') }
  g.fillStyle = mix('#9aa0b8', '#4a5070'); g.font = '6px monospace'; g.fillText('TÜR', 20, 10)

  // Tafel
  r(64, 10, 96, 40, mix(PAL.tafelRahmen, '#3f3020')); r(67, 13, 90, 34, mix(PAL.tafel, '#0f1f1a'))
  g.fillStyle = mix(PAL.kreide, '#6a7a72'); g.font = '7px monospace'; g.fillText('wer bis zum morgen', 72, 24); g.fillText('nicht ...', 72, 34)
  r(67, 47, 90, 2, mix('#8a7a5a', '#3a3328'))

  // Fenster (rechts), nachts mit Mond
  r(240, 10, 64, 44, mix(PAL.rahmen, '#1e1610')); r(244, 14, 56, 36, mix(PAL.fenster, PAL.fensterNacht))
  if (licht < .6) { g.globalAlpha = 1 - licht; r(284, 20, 7, 7, PAL.mond); r(283, 21, 1, 5, PAL.mond); r(291, 21, 1, 5, PAL.mond); r(250, 40, 2, 2, '#aab'); r(262, 22, 1, 1, '#aab'); r(270, 44, 1, 1, '#aab'); g.globalAlpha = 1 }
  r(271, 14, 2, 36, mix(PAL.rahmen, '#1e1610')); r(244, 31, 56, 2, mix(PAL.rahmen, '#1e1610'))
  r(236, 54, 72, 4, mix('#6b4a2e', '#2a1d14'))   // Fensterbank

  // Keller: Falltuer unten links
  r(6, 100, 30, 14, PAL.keller); for (let x = 9; x < 36; x += 5) r(x, 101, 1, 12, PAL.gitter)
  g.fillStyle = '#9aa0b8'; g.font = '6px monospace'; g.fillText('KELLER', 8, 98)
  if (s.layout.imKeller) { g.fillStyle = '#e06c75'; g.fillText(String(s.layout.imKeller), 38, 110) }

  // Spuren am Boden (bleiben den Tag ueber liegen)
  for (const o of s.staub || []) { const z = ZONEN[o]; if (!z) continue; g.globalAlpha = .7; for (let i = 0; i < 9; i++) r(z.x - 10 + (i * 7) % 20, z.y - 4 + (i * 3) % 7, 2, 1, PAL.staub); g.globalAlpha = 1 }
  if (s.spur) {
    const z = ZONEN[s.spur.ort]
    if (z) {
      const dx = s.spur.richtung === 'tuer' ? -1 : s.spur.richtung === 'fenster' ? 1 : 0
      r(z.x - 4, z.y - 2, 8, 4, PAL.tinte)
      for (let i = 1; i <= 7 && dx; i++) { const w = Math.max(1, 4 - Math.floor(i / 2)); r(z.x + dx * i * 9, z.y - 1 + (i % 2), w, w > 2 ? 2 : 1, PAL.tinte) }
    }
  }

  // Pulte (zwei Reihen), leere mit Tintenfleck
  PULTE.forEach(([x, y], i) => {
    r(x - 1, y + 4, 26, 2, mix(PAL.stuhl, '#2a2018'))                              // Stuhllehne
    r(x, y, 24, 6, mix(PAL.pult, '#4a3a28')); r(x, y + 6, 24, 2, mix(PAL.pultKante, '#3a2c1e'))
    r(x + 1, y + 8, 2, 6, mix(PAL.pultKante, '#3a2c1e')); r(x + 21, y + 8, 2, 6, mix(PAL.pultKante, '#3a2c1e'))
    if (s.layout.leerePulte.includes(i)) { r(x + 8, y + 1, 9, 4, PAL.tinte); r(x + 6, y + 2, 2, 2, PAL.tinte); r(x + 17, y + 3, 2, 1, PAL.tinte) }
  })

  // Figuren (hinten zuerst)
  const liste = [...s.layout.figuren].sort((a, b) => a.y - b.y)
  for (const f of liste) {
    const p = s.positionen?.[f.name] || f
    zeichneFigur(g, Math.round(p.x), Math.round(p.y), s.looks?.[f.name], 1, { dunkel: licht < .5 })
    if (f.name === s.spieler) { r(Math.round(p.x) + 4, Math.round(p.y) - 4, 4, 2, '#bd93f9') }
    if (s.sprecher === f.name) { r(Math.round(p.x) + 12, Math.round(p.y) - 6, 9, 6, PAL.zettel); r(Math.round(p.x) + 13, Math.round(p.y), 2, 2, PAL.zettel); r(Math.round(p.x) + 14, Math.round(p.y) - 4, 1, 1, '#1b1f3a'); r(Math.round(p.x) + 16, Math.round(p.y) - 4, 1, 1, '#1b1f3a'); r(Math.round(p.x) + 18, Math.round(p.y) - 4, 1, 1, '#1b1f3a') }
  }
  // Nachts: Fragezeichen fuer Unbekannte, unten rechts
  if (s.layout.nacht && s.layout.unbekannt.length) { g.fillStyle = '#6a7090'; g.font = '7px monospace'; g.fillText(`? ${s.layout.unbekannt.join(' ')}`, 196, 118) }

  // Lampe mit Lichtkegel (beim Flackern kurz aus)
  const flackert = s.schreck === 'flackern' && Math.floor(Date.now() / 90) % 3 === 0
  const l2 = flackert ? 0 : licht
  r(159, 0, 2, 6, PAL.schnur); r(152, 6, 16, 4, mix('#8a6a45', '#3a2c1e')); r(155, 10, 10, 3, l2 > .2 ? PAL.lampe : PAL.lampeAus)
  if (l2 > .05) { g.globalAlpha = .12 * l2; g.fillStyle = PAL.lampe; g.beginPath(); g.moveTo(152, 12); g.lineTo(168, 12); g.lineTo(230, H); g.lineTo(90, H); g.closePath(); g.fill(); g.globalAlpha = 1 }

  // Schrecken: eine Gestalt in der Tuer, ein Gesicht im Fenster - nur fuer einen Moment
  if (s.schreck === 'gestalt') { g.globalAlpha = .85; r(21, 18, 14, WAND_UNTEN - 22, '#07080f'); r(24, 16, 8, 6, '#07080f'); g.globalAlpha = 1 }
  if (s.schreck === 'fenster') { g.globalAlpha = .7; r(276, 34, 10, 12, '#0b0d18'); r(278, 38, 2, 2, '#b9c3ff'); r(283, 38, 2, 2, '#b9c3ff'); g.globalAlpha = 1 }
}

function blend(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const c = (s) => Math.round(((pa >> s) & 255) * t + ((pb >> s) & 255) * (1 - t))
  return `rgb(${c(16)},${c(8)},${c(0)})`
}

// Animierter Zeichner: Figuren gehen zu neuen Zielen, die Lampe blendet. Bei reduzierter Bewegung sofort.
export function klasseAnimator(canvas) {
  const reduziert = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  let szene = null, positionen = {}, lampe = 1, laeuft = false, sprecherBis = 0, schreckBis = 0
  function schritt() {
    if (!szene) return
    let bewegt = false
    if (szene.schreck && Date.now() > schreckBis) szene.schreck = null
    if (szene.schreck) bewegt = true
    const zielLampe = szene.layout.nacht ? (szene.daemmerung ? 0.45 : 0) : 1
    if (Math.abs(lampe - zielLampe) > .01) { lampe = reduziert ? zielLampe : lampe + (zielLampe - lampe) * .12; bewegt = true } else lampe = zielLampe
    for (const f of szene.layout.figuren) {
      const p = positionen[f.name] || (positionen[f.name] = { x: f.x, y: f.y })
      const dx = f.x - p.x, dy = f.y - p.y
      if (Math.abs(dx) + Math.abs(dy) > .5) { if (reduziert || szene.daemmerung) { p.x = f.x; p.y = f.y } else { p.x += dx * .15; p.y += dy * .15; bewegt = true } } else { p.x = f.x; p.y = f.y }
    }
    if (szene.sprecher && Date.now() > sprecherBis) szene.sprecher = null
    zeichne(canvas, { ...szene, positionen, lampe })
    if (bewegt || szene.sprecher) requestAnimationFrame(schritt); else laeuft = false
  }
  return {
    setze(neu) {
      szene = { ...neu, schreck: szene?.schreck ?? null }
      if (neu.sprecher) sprecherBis = Date.now() + 2500
      if (!laeuft) { laeuft = true; requestAnimationFrame(schritt) }
    },
    erschrecke(art) {
      if (!szene) return
      szene.schreck = art; schreckBis = Date.now() + (art === 'flackern' ? 1400 : 700)
      if (!laeuft) { laeuft = true; requestAnimationFrame(schritt) }
    },
  }
}
