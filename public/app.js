// Nachsitzen im Browser: zeigt den Verlauf aus Sicht des Spielers, zeichnet Pixel-Avatare
// und schickt Eingaben an den Server. Alles Deutsch, keine Abhaengigkeiten.

const $ = (id) => document.getElementById(id)
const ROLLE = { schatten: 'der Schatten', schluessel: 'der Schlüsselträger', schueler: 'ein normaler Schüler' }
const PHASE = {
  abend: 'Abend. Die Tür ist zu.', nacht: 'Nacht. Die Lampe ist aus.', morgen: 'Morgen.',
  diskussion: 'Ihr redet.', abstimmung: 'Abstimmung: Wer kommt in den Keller?', ergebnis: 'Ergebnis.', ende: 'Ende.',
}
const BEI = { 'Tür': 'bei der Tür', 'Schrank': 'beim Schrank', 'Tafel': 'an der Tafel', 'Pult vorne': 'am Pult vorne', 'Pult hinten': 'am Pult hinten', 'Fenster': 'am Fenster' }
let status = null
let tippende = new Map()
let quelle = null

// --- Pixel-Avatare: 12x14 Raster, aus Hautfarbe, Haarfarbe, Frisur und Shirt -----------
function avatar(name, look, px = 4) {
  const W = 12, H = 14
  const c = document.createElement('canvas'); c.width = W * px; c.height = H * px
  c.setAttribute('role', 'img'); c.setAttribute('aria-label', name)
  const g = c.getContext('2d')
  const dot = (x, y, f) => { g.fillStyle = f; g.fillRect(x * px, y * px, px, px) }
  const rect = (x, y, w, h, f) => { g.fillStyle = f; g.fillRect(x * px, y * px, w * px, h * px) }
  const { haut = '#f1cfb0', haar = '#2b2118', frisur = 'kurz', shirt = '#888' } = look || {}
  const dunkler = (hex, k = .75) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(v * k); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})` }
  rect(3, 10, 6, 4, shirt); rect(2, 11, 1, 3, shirt); rect(9, 11, 1, 3, shirt)   // Koerper
  rect(5, 9, 2, 1, haut)                                                        // Hals
  rect(3, 3, 6, 6, haut)                                                        // Gesicht
  dot(4, 5, '#1b1f3a'); dot(7, 5, '#1b1f3a')                                    // Augen
  dot(5, 7, dunkler(haut, .8)); dot(6, 7, dunkler(haut, .8))                    // Mund
  rect(3, 2, 6, 1, haar); rect(2, 3, 1, 2, haar); rect(9, 3, 1, 2, haar)        // Haare
  if (frisur === 'lang') { rect(2, 3, 1, 7, haar); rect(9, 3, 1, 7, haar); rect(3, 1, 6, 1, haar) }
  if (frisur === 'bob') { rect(2, 3, 1, 5, haar); rect(9, 3, 1, 5, haar); rect(3, 1, 6, 1, haar); rect(3, 3, 6, 1, haar) }
  if (frisur === 'zopf') { rect(3, 1, 6, 1, haar); rect(9, 4, 1, 5, haar); dot(9, 9, haar) }
  if (frisur === 'wuschel') { rect(2, 1, 8, 2, haar); dot(1, 2, haar); dot(10, 2, haar); dot(4, 3, haar); dot(7, 3, haar) }
  if (frisur === 'kurz') { rect(3, 1, 6, 1, haar) }
  return c
}

// --- Verlauf -------------------------------------------------------------------------
const verlauf = $('verlauf')
function unten() { verlauf.scrollTop = verlauf.scrollHeight }
function regie(text, klasse = '') {
  const d = document.createElement('div'); d.className = `regie ${klasse}`; d.textContent = text
  verlauf.appendChild(d); unten()
}
function blase(von, text, { an = null, still = false } = {}) {
  const ich = von === status?.spieler
  const z = document.createElement('div'); z.className = `zeile${ich ? ' ich' : ''}`
  z.appendChild(avatar(von, status?.figuren?.[von], 4))
  const b = document.createElement('div'); b.className = `blase${still ? ' still' : ''}`
  if (!still) {
    const w = document.createElement('div'); w.className = 'wer'; w.style.color = farbe(von)
    w.textContent = ich ? 'Du' : von
    if (an) { const s = document.createElement('small'); s.textContent = `zu ${an === status?.spieler ? 'dir' : an}`; w.appendChild(s) }
    b.appendChild(w)
  }
  b.appendChild(document.createTextNode(text))
  z.appendChild(b); verlauf.appendChild(z); unten()
}
function farbe(name) {
  if (name === status?.spieler) return 'var(--ich)'
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name.toLowerCase()}`)
  return v ? `var(--${name.toLowerCase()})` : 'var(--tinte)'
}

function zeigeEreignis(e) {
  const ich = status?.spieler
  switch (e.art) {
    case 'start': regie(e.text); break
    case 'rolle': if (e.name === ich) $('meinerolle').textContent = `Deine Rolle: ${ROLLE[e.rolle]}.`; break
    case 'nacht': regie(`Nacht ${e.nacht}. ${e.text}`, 'dunkel'); break
    case 'platz': regie(`Du stellst dich ${BEI[e.ort] || e.ort} hin.`, 'geheim'); break
    case 'schatten-waehlt': regie(`Du schleichst zu ${e.ziel} und zurück.`, 'geheim'); break
    case 'pruefung': regie(`Du prüfst ${e.ziel}: ${e.istSchatten ? 'DER SCHATTEN.' : 'kein Schatten.'}`, 'geheim'); break
    case 'beobachtung': regie(`Was du mitbekommen hast: ${e.text}`, 'geheim'); break
    case 'verschwunden': regie(e.text, 'schwer'); break
    case 'fund': regie(`Fund: ${e.text}`, 'fund'); break
    case 'zettel': regie(`Ein Zettel unter der Tür: „${e.text}“`, 'fund'); break
    case 'hausmeister': case 'glocke': regie(e.text, 'schwer'); break
    case 'untersucht': blase(e.von, `${e.von === ich ? 'Du untersuchst' : 'untersucht'} ${e.ort === status?.klassenbuch ? 'das Klassenbuch' : `den Platz ${BEI[e.ort] || e.ort}`}.`, { still: true }); break
    case 'ergebnis': regie(`Nur du weißt das: ${e.text}`, 'geheim'); break
    case 'diskussion': regie(`Gespräch, Runde ${e.runde}${e.von ? ` von ${e.von}` : ''}`); break
    case 'sagt': blase(e.von, e.text, { an: e.an }); break
    case 'schweigt': blase(e.von, `${e.von === ich ? 'Du schweigst' : `${e.von} schweigt`}.`, { still: true }); break
    case 'abstimmung': regie(e.text, 'schwer'); break
    case 'stimme': blase(e.von, e.fuer ? `stimmt für ${e.fuer === ich ? 'dich' : e.fuer}.` : 'stimmt nicht ab.', { still: true }); break
    case 'eingesperrt': regie(`${e.name} kommt in den Keller. ${e.name} war ${ROLLE[e.rolle]}.`, 'schwer'); break
    case 'niemand': regie(`Niemand kommt in den Keller${e.gleichstand ? ' (Gleichstand)' : ''}.`); break
    case 'ende': regie(e.sieger === 'schueler' ? `Die Schüler haben gewonnen. Der Schatten war ${e.schatten}.` : `Der Schatten hat gewonnen. Es war ${e.schatten}.`, 'ende'); break
  }
}

// --- Tippt-Anzeige -------------------------------------------------------------------
function zeigeTippt(von, fertig) {
  if (fertig) { tippende.get(von)?.remove(); tippende.delete(von); return }
  if (tippende.has(von)) return
  const d = document.createElement('div'); d.className = 'tippt'
  d.innerHTML = `${von} überlegt<i></i><i></i><i></i>`
  tippende.set(von, d); verlauf.appendChild(d); unten()
}

// --- Klasse (rechte Spalte) ----------------------------------------------------------
function zeigeKlasse() {
  const ul = $('klasse'); ul.innerHTML = ''
  const alle = [...status.lebende, ...status.verschwunden, ...status.keller]
  for (const n of alle) {
    const li = document.createElement('li')
    const weg = status.verschwunden.includes(n), keller = status.keller.includes(n)
    if (weg || keller) li.classList.add('weg'); if (keller) li.classList.add('keller')
    li.appendChild(avatar(n, status.figuren[n], 3))
    const t = document.createElement('div')
    const name = document.createElement('div'); name.className = 'n'; name.textContent = n === status.spieler ? `${n} (du)` : n
    const s = document.createElement('div'); s.className = 's'
    s.textContent = keller ? 'im Keller' : weg ? 'verschwunden' : 'im Raum'
    if (status.rollen?.[n] && (keller || status.phase === 'ende' || status.zuschauen)) s.textContent += ` · ${ROLLE[status.rollen[n]]}`
    t.appendChild(name); t.appendChild(s); li.appendChild(t); ul.appendChild(li)
  }
  $('phase').textContent = status.phase === 'ende' ? 'Die Tür geht auf.' : `${PHASE[status.phase] || ''}${status.nacht ? ` · Nacht ${status.nacht}` : ''}`
  $('lampe').classList.toggle('aus', status.phase === 'nacht')
  $('neu').hidden = false
}

// --- Eingabe -------------------------------------------------------------------------
function zeigeWarte(w) {
  const sagen = $('sagen'), wahl = $('wahl'), hinweis = $('hinweis')
  sagen.hidden = true; wahl.hidden = true; wahl.innerHTML = ''
  if (!w) { hinweis.textContent = status?.spieler && status.phase !== 'ende' ? 'Die anderen reden …' : ''; return }
  if (w.art === 'sagen') {
    hinweis.textContent = w.pflicht ? 'Sag einen Satz zum Anfang.' : 'Du bist dran. Sag etwas oder schweig.'
    const an = $('an'); an.innerHTML = '<option value="">an alle</option>'
    for (const n of w.andere) { const o = document.createElement('option'); o.value = n; o.textContent = `zu ${n}`; an.appendChild(o) }
    $('schweigen').hidden = w.pflicht
    sagen.hidden = false; $('text').focus()
    return
  }
  wahl.hidden = false
  if (w.art === 'nacht') {
    // Erst den Platz, dann (Schatten/Schluesseltraeger) das Ziel
    hinweis.textContent = 'Nacht. Wo stellst du dich hin?'
    for (const o of w.orte) knopf(wahl, o, () => {
      if (w.aufgabe === 'verstecken') return sende({ platz: o })
      wahl.innerHTML = ''
      hinweis.textContent = `Du stehst ${BEI[o] || o}. ${w.aufgabe === 'holen' ? 'Wen holst du?' : 'Wen prüfst du?'}`
      for (const n of w.optionen) knopf(wahl, n, () => sende({ platz: o, ziel: n }))
    })
  } else if (w.art === 'untersuchen') {
    hinweis.textContent = 'Du darfst heute einen Platz oder das Klassenbuch untersuchen. Alle sehen, was du dir ansiehst, nur du siehst das Ergebnis.'
    for (const o of w.orte) knopf(wahl, o, () => sende({ ort: o }))
    knopf(wahl, 'Nichts untersuchen', () => sende({ ort: null }), 'leise')
  } else if (w.art === 'stimme') {
    hinweis.textContent = 'Wer soll in den Keller?'
    for (const n of w.optionen) knopf(wahl, n, () => sende({ fuer: n }))
    knopf(wahl, 'niemand', () => sende({ fuer: null }), 'leise')
  }
}
function knopf(wo, text, tu, extra = '') { const b = document.createElement('button'); b.className = `knopf ${extra}`; b.type = 'button'; b.textContent = text; b.onclick = tu; wo.appendChild(b) }

async function sende(aktion) {
  for (const b of document.querySelectorAll('#eingabe button')) b.disabled = true
  try {
    const r = await fetch('/aktion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(aktion) })
    const d = await r.json()
    if (!d.ok) $('hinweis').textContent = d.fehler
  } finally { for (const b of document.querySelectorAll('#eingabe button')) b.disabled = false }
}
$('sagen').onsubmit = (ev) => { ev.preventDefault(); const text = $('text').value.trim(); if (!text) return; $('text').value = ''; sende({ art: 'sagt', text, an: $('an').value || null }) }
$('schweigen').onclick = () => sende({ art: 'schweigt' })

// --- Start und Verbindung --------------------------------------------------------------
async function starten(zuschauen) {
  const r = await fetch('/partie', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('name').value, zuschauen }) })
  const d = await r.json()
  if (d && d.fehler) { alert(d.fehler); return }
  verlauf.innerHTML = ''; tippende = new Map(); $('meinerolle').textContent = ''
  $('start').hidden = true; $('raum').hidden = false; $('eingabe').hidden = zuschauen
  verbinde()
}
$('startform').onsubmit = (ev) => { ev.preventDefault(); starten(false) }
$('zuschauen').onclick = () => starten(true)
$('neu').onclick = () => { $('raum').hidden = true; $('eingabe').hidden = true; $('start').hidden = false; $('neu').hidden = true; quelle?.close(); quelle = null }

function verbinde() {
  quelle?.close()
  quelle = new EventSource('/ereignisse')
  quelle.addEventListener('status', (m) => { status = JSON.parse(m.data); if (!status) return; zeigeKlasse(); zeigeWarte(status.warte) })
  quelle.addEventListener('ereignis', (m) => zeigeEreignis(JSON.parse(m.data)))
  quelle.addEventListener('tippt', (m) => { const d = JSON.parse(m.data); zeigeTippt(d.von, d.fertig) })
  quelle.addEventListener('warte', (m) => zeigeWarte(JSON.parse(m.data)))
}

// Laeuft schon eine Partie (Seite neu geladen)? Dann direkt rein.
fetch('/status').then((r) => r.json()).then((s) => {
  if (!s || s.phase === 'ende') return
  status = s; $('start').hidden = true; $('raum').hidden = false; $('eingabe').hidden = s.zuschauen; verbinde()
}).catch(() => {})
