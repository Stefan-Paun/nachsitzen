// Nachsitzen im Browser: Verlauf aus Sicht des Spielers, Spurentafel (Raumplan, Wissen, Funde),
// Pixel-Avatare und Eingaben an den Server. Alles Deutsch, keine Abhaengigkeiten.

import { layout, zeichneFigur, klasseAnimator, waehleSchreck } from './klasse.js'
import { tonAnlage } from './ton.js'

const $ = (id) => document.getElementById(id)
const ROLLE = { schatten: 'der Schatten', schluessel: 'der Schlüsselträger', schueler: 'ein normaler Schüler' }
const PHASE = {
  abend: 'Abend. Die Tür ist zu.', nacht: 'Nacht. Die Lampe ist aus.', morgen: 'Morgen.',
  diskussion: 'Ihr redet.', abstimmung: 'Abstimmung: Wer kommt in den Keller?', ergebnis: 'Ergebnis.', ende: 'Ende.',
}
const BEI = { 'Tür': 'bei der Tür', 'Tafel': 'an der Tafel', 'Pulte': 'bei den Pulten', 'Fenster': 'am Fenster' }
const ORT_TIPP = { 'Tür': 'ganz links · Klinke, Schlüsselloch', 'Tafel': 'links · Kreide, halber Satz', 'Pulte': 'rechts · Pultreihen, Tintenfässer', 'Fenster': 'ganz rechts · Riegel, Vorhang' }
const RICHTUNG = { tuer: '← Richtung Tür', fenster: 'Richtung Fenster →', hier: '● gleich daneben' }
let status = null
let tippende = new Map()
let quelle = null
let karten = { privat: null, morgen: null }
let wissen = leeresWissen(0)
const szene = klasseAnimator($('szene'))
let sprecher = null, pulte = null
const ton = tonAnlage()
let schreckeBenutzt = []

// --- Einstellungen: Ton, Schrecken, Daemmerung (nur fuer diesen Browser gemerkt) ------------
const einstellungen = { ton: false, schrecken: true, daemmerung: false }
try { Object.assign(einstellungen, JSON.parse(localStorage.getItem('nachsitzen.einstellungen') || '{}')) } catch {}
einstellungen.ton = false   // Ton braucht immer einen Klick (Browser-Regel)
function zeigeEinstellungen() {
  for (const k of ['ton', 'schrecken', 'daemmerung']) $(`r-${k}`).setAttribute('aria-pressed', String(einstellungen[k]))
  document.body.classList.toggle('daemmerung', einstellungen.daemmerung)
  try { localStorage.setItem('nachsitzen.einstellungen', JSON.stringify({ schrecken: einstellungen.schrecken, daemmerung: einstellungen.daemmerung })) } catch {}
}
$('r-ton').onclick = () => { einstellungen.ton = !einstellungen.ton; if (einstellungen.ton && !einstellungen.daemmerung) ton.einschalten(); else ton.ausschalten(); zeigeEinstellungen() }
$('r-schrecken').onclick = () => { einstellungen.schrecken = !einstellungen.schrecken; zeigeEinstellungen() }
$('r-daemmerung').onclick = () => { einstellungen.daemmerung = !einstellungen.daemmerung; if (einstellungen.daemmerung) ton.ausschalten(); else if (einstellungen.ton) ton.einschalten(); zeigeEinstellungen(); zeigeSzene() }
zeigeEinstellungen()

// Ein Schreck pro Nacht, nur wenn gerade keine Eingabe offen ist (die Sekunde der Frage ist still)
function vielleichtErschrecken() {
  if (!einstellungen.schrecken || einstellungen.daemmerung) return
  const art = waehleSchreck(schreckeBenutzt)
  if (!art) return
  setTimeout(() => {
    if (status?.warte || status?.phase === 'ende' || einstellungen.daemmerung) return
    schreckeBenutzt.push(art); szene.erschrecke(art); ton.klang('schreck')
  }, 1500 + Math.random() * 3000)
}

function leeresWissen(nacht) { return { nacht, plaetze: {}, behauptet: {}, zettel: null, spur: null, staub: new Set(), durchgang: new Set(), zeilen: [], funde: [], opfer: null } }

// --- Pixel-Avatare: dieselbe Figur wie in der Szene, nur groesser ------------------------
function avatar(name, look, px = 4) {
  const c = document.createElement('canvas'); c.width = 12 * px; c.height = 14 * px
  c.setAttribute('role', 'img'); c.setAttribute('aria-label', name); c.title = name
  zeichneFigur(c.getContext('2d'), 0, 0, look, px)
  return c
}

// --- Verlauf -------------------------------------------------------------------------
const verlauf = $('verlauf')
function unten() { verlauf.scrollTop = verlauf.scrollHeight }
function regie(text, klasse = '') {
  const d = document.createElement('div'); d.className = `regie ${klasse}`; d.textContent = text
  verlauf.appendChild(d); unten()
}
function karte(art, titel) {
  const k = document.createElement('div'); k.className = `karte ${art}`
  const h = document.createElement('h4'); h.textContent = titel; k.appendChild(h)
  verlauf.appendChild(k); unten()
  return k
}
function kartenZeile(k, text, klasse = '') { const p = document.createElement('p'); p.className = klasse; p.textContent = text; k.appendChild(p); unten() }
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
  merke(e)
  switch (e.art) {
    case 'start': regie(e.text); break
    case 'rolle': if (e.name === ich) $('meinerolle').textContent = `Deine Rolle: ${ROLLE[e.rolle]}.`; break
    case 'nacht': karten = { privat: null, morgen: null }; regie(`Nacht ${e.nacht}. ${e.text}`, 'dunkel'); ton.klang('nacht'); vielleichtErschrecken(); break
    case 'platz': if (e.wer === ich) regie(`Du stellst dich ${BEI[e.ort] || e.ort} hin.`, 'geheim'); break
    case 'schatten-waehlt': regie(`Du schleichst zu ${e.ziel} und zurück.`, 'geheim'); break
    case 'pruefung': regie(`Du prüfst ${e.ziel}: ${e.istSchatten ? 'DER SCHATTEN.' : 'kein Schatten.'}`, 'geheim'); break
    case 'beobachtung':
      if (e.wer !== ich && !status?.zuschauen) break
      if (!karten.privat) karten.privat = karte('privat', `Nacht ${e.nacht} · was ${e.wer === ich ? 'du' : e.wer} mitbekommen ${e.wer === ich ? 'hast' : 'hat'}`)
      kartenZeile(karten.privat, (status?.zuschauen ? `${e.wer}: ` : '') + e.text); break
    case 'verschwunden':
      karten.morgen = karte('morgen', `Morgen ${e.nacht}`)
      kartenZeile(karten.morgen, e.text, 'schwer'); ton.klang('verschwunden')
      if (e.name === ich) regie('Du bist verschwunden. Du schaust als Geist weiter zu und siehst ab jetzt alles, was im Raum gesagt wird.', 'ende'); break
    case 'fund': kartenZeile(karten.morgen || (karten.morgen = karte('morgen', `Morgen ${e.nacht}`)), e.text, e.typ === 'notiz' ? 'fund notiz' : 'fund'); break
    case 'zettel': kartenZeile(karten.morgen || (karten.morgen = karte('morgen', `Morgen ${e.nacht}`)), `Ein Zettel unter der Tür: „${e.text}“`, 'fund'); break
    case 'hausmeister': case 'glocke': kartenZeile(karten.morgen || (karten.morgen = karte('morgen', `Morgen ${e.nacht}`)), e.text, 'ereignis'); break
    case 'untersucht': blase(e.von, `${e.von === ich ? 'Du untersuchst' : 'untersucht'} ${e.ort === status?.klassenbuch ? 'das Klassenbuch' : `den Platz ${BEI[e.ort] || e.ort}`}.`, { still: true }); break
    case 'beweis': regie(`Beweis, vorgezeigt von ${e.von === ich ? 'dir' : e.von} (vom Spiel geprüft): ${e.text}`, 'beweis'); break
    case 'zettelwahl': regie(`Zettel aufgedeckt: ${Object.entries(e.stimmen).map(([v, f]) => `${v === ich ? 'du' : v} → ${f ?? 'niemand'}`).join(' · ')}`, 'schwer'); break
    case 'ergebnis': regie(`Nur du weißt das: ${e.text}`, 'geheim'); break
    case 'diskussion': regie(`Gespräch, Runde ${e.runde}${e.von ? ` von ${e.von}` : ''}`); if (e.runde === 1) ton.klang('morgen'); break
    case 'sagt': sprecher = e.von; blase(e.von, e.text, { an: e.an }); if (e.von !== ich) ton.klang('stimme'); break
    case 'schweigt': blase(e.von, `${e.von === ich ? 'Du schweigst' : `${e.von} schweigt`}.`, { still: true }); break
    case 'abstimmung': regie(e.text, 'schwer'); break
    case 'stimme': blase(e.von, e.von === ich ? `Dein Zettel: ${e.fuer ?? 'niemand'}.` : (e.fuer ? `stimmt für ${e.fuer === ich ? 'dich' : e.fuer}.` : 'stimmt nicht ab.'), { still: true }); break
    case 'eingesperrt': regie(`${e.name} kommt in den Keller. ${e.name} war ${ROLLE[e.rolle]}.`, 'schwer'); ton.klang('eingesperrt'); if (e.name === ich) regie('Du sitzt im Keller. Du schaust als Geist weiter zu.', 'ende'); break
    case 'niemand': regie(`Niemand kommt in den Keller${e.gleichstand ? ' (Gleichstand)' : ''}.`); break
    case 'ende': regie(e.sieger === 'schueler' ? `Die Schüler haben gewonnen. Der Schatten war ${e.schatten}.` : `Der Schatten hat gewonnen. Es war ${e.schatten}.`, 'ende'); ton.klang(e.sieger === 'schueler' ? 'ende-schueler' : 'ende-schatten'); break
  }
  zeigeTafel()
}

// --- Spurentafel: was ich ueber die letzte Nacht sicher weiss -------------------------------
function merke(e) {
  const ich = status?.spieler
  if (e.art === 'nacht') { wissen = leeresWissen(e.nacht); return }
  switch (e.art) {
    case 'platz': wissen.plaetze[e.wer] = e.ort; if (e.wer === ich) wissen.zeilen.push({ k: 'geheim', t: `Du: ${BEI[e.ort]}` }); break
    case 'beweis':
      if (e.ort === status?.klassenbuch) { const m = /„(\w+) – (.+)\.“/.exec(e.text); if (m) wissen.plaetze[m[1]] = m[2] }
      else { const m = /Hier standen? letzte Nacht (.+?)\./.exec(e.text); if (m && !/niemand/.test(m[1])) for (const n of m[1].split(' und ')) wissen.plaetze[n] = e.ort; if (/Tintenpunkte/.test(e.text)) wissen.durchgang.add(e.ort) }
      wissen.funde.push(`Beweis (${e.von}): ${e.text}`)
      break
    case 'beobachtung':
      if (e.wer === ich || status?.zuschauen) {
        if (e.typ === 'gesehen') wissen.plaetze[e.name] = e.ort
        wissen.zeilen.push({ k: 'geheim', t: (status?.zuschauen ? `${e.wer} sieht: ` : '') + e.text })
      }
      break
    case 'schatten-waehlt': wissen.zeilen.push({ k: 'geheim', t: `Du holst ${e.ziel}.` }); break
    case 'pruefung': wissen.zeilen.push({ k: 'geheim', t: `Geprüft: ${e.ziel} ist ${e.istSchatten ? 'DER SCHATTEN' : 'kein Schatten'}.` }); break
    case 'verschwunden': wissen.opfer = e.name; break
    case 'fund':
      wissen.funde.push(e.text)
      if (e.typ === 'spur') { wissen.spur = { ort: e.ort, richtung: e.richtung }; if (wissen.opfer) wissen.plaetze[wissen.opfer] = e.ort }   // die Spur verraet den Platz des Opfers
      if (e.typ === 'staub') wissen.staub.add(e.ort)
      break
    case 'zettel': wissen.zettel = e.ort; wissen.funde.push(`Zettel: ${e.text}`); break
    case 'hausmeister': case 'glocke': wissen.funde.push(e.text); break
    case 'sagt': if (e.behauptet && e.nacht === wissen.nacht) wissen.behauptet[e.von] = e.behauptet; break
    case 'ergebnis':
      if (e.ort === status?.klassenbuch) wissen.plaetze[e.name] = e.platz
      else { for (const n of e.namen || []) wissen.plaetze[n] = e.ort; if (e.durchgang) wissen.durchgang.add(e.ort) }
      wissen.zeilen.push({ k: 'geheim', t: e.text })
      break
  }
}

function zeigeSzene() {
  if (!status) return
  const namen = Object.keys(status.figuren || {})
  if (!pulte) { pulte = {}; namen.forEach((n, i) => { pulte[n] = i }) }
  const l = layout({ phase: status.phase, namen, lebende: status.lebende, verschwunden: status.verschwunden, keller: status.keller, spieler: status.spieler, zuschauen: status.zuschauen, plaetze: wissen.plaetze, opfer: wissen.opfer, pulte })
  szene.setze({ layout: l, looks: status.figuren, spieler: status.spieler, spur: wissen.spur, staub: new Set([...wissen.staub, ...wissen.durchgang]), zettel: !!wissen.zettel, sprecher, ende: status.phase === 'ende', phase: status.phase, daemmerung: einstellungen.daemmerung })
}

function zeigeTafel() {
  if (!status) return
  zeigeSzene()
  $('nachtnr').textContent = wissen.nacht ? `Nacht ${wissen.nacht}` : ''
  const plan = $('raumplan'); plan.innerHTML = ''
  const orte = status.orte || Object.keys(BEI)
  for (const o of orte) {
    const d = document.createElement('div'); d.className = 'ort'
    const wer = Object.entries(wissen.plaetze).filter(([, ort]) => ort === o).map(([n]) => n)
    if (wer.includes(status.spieler)) d.classList.add('ich')
    const n = document.createElement('div'); n.className = 'n'; n.textContent = o; d.appendChild(n)
    const leute = document.createElement('div'); leute.className = 'leute'
    for (const w of wer) leute.appendChild(avatar(w, status.figuren[w], 2))
    d.appendChild(leute)
    if (wissen.opfer && wissen.plaetze[wissen.opfer] === o) marke(d, 'opfer', `${wissen.opfer} weg`)
    if (wissen.spur?.ort === o) marke(d, 'spur', `Tinte ${RICHTUNG[wissen.spur.richtung] || ''}`)
    if (wissen.staub.has(o) || wissen.durchgang.has(o)) marke(d, 'staub', 'Durchgang')
    if (wissen.zettel === o) marke(d, 'nein', 'kein Schatten')
    plan.appendChild(d)
  }
  const unbekannt = (status.lebende || []).concat(wissen.opfer ? [wissen.opfer] : []).filter((n) => !(n in wissen.plaetze))
  let hinweis = plan.nextElementSibling?.classList.contains('planhinweis') ? plan.nextElementSibling : null
  if (!hinweis) { hinweis = document.createElement('p'); hinweis.className = 'planhinweis'; plan.after(hinweis) }
  hinweis.textContent = wissen.nacht ? (unbekannt.length ? `Platz unbekannt: ${unbekannt.join(', ')}` : 'Alle Plätze bekannt.') : 'Nachts siehst du hier, wer wo stand.'
  fuelle($('wissen'), wissen.zeilen.map((z) => [z.t, z.k]), 'Noch nichts. Nachts bekommst du etwas mit.')
  fuelle($('funde'), wissen.funde.map((t) => [t, 'fund']), 'Noch keine.')
  // Behauptungen gegen das, was ich sicher weiss
  const ul = $('behauptungen'); ul.innerHTML = ''
  const namen = Object.keys(wissen.behauptet)
  if (!namen.length) { const li = document.createElement('li'); li.className = 'leer'; li.textContent = 'Noch nichts behauptet.'; ul.appendChild(li) }
  for (const n of namen) {
    const b = wissen.behauptet[n], w = wissen.plaetze[n]
    const li = document.createElement('li'); li.className = 'behauptung'
    const links = document.createElement('span'); links.textContent = `${n === status.spieler ? 'Du' : n}: ${BEI[b] || b}`
    const rechts = document.createElement('span'); rechts.className = 'w'
    if (w && w !== b) { li.classList.add('widerspruch'); rechts.textContent = `⚠ war ${BEI[w] || w}` }
    else if (w) { li.classList.add('passt'); rechts.textContent = '✓ stimmt' }
    else rechts.textContent = 'ungeprüft'
    li.appendChild(links); li.appendChild(rechts); ul.appendChild(li)
  }
}

// --- Hefte: nach der Partie zeigen, wie die Figuren dich sehen ---------------------------
function zeigeHefte(eintraege) {
  for (const [n, e] of Object.entries(eintraege)) {
    const k = karte('heft', `${n} schreibt ins Heft`)
    kartenZeile(k, e.eintrag)
    const v = Object.entries(e.vertrauen || {}).map(([p, w]) => `${p === status?.spieler ? 'dir' : p} ${w > 0 ? '+' : ''}${w}`).join(' · ')
    if (v) { const d = document.createElement('div'); d.className = 'vertrauen'; d.textContent = `Vertrauen: ${v}`; k.appendChild(d) }
  }
  unten()
}
async function hefteLesen() {
  const r = await fetch('/hefte'); const d = await r.json()
  if (d.fehler) { $('hinweis').textContent = d.fehler; return }
  const k = karte('heft', 'Die Hefte (alle Partien)')
  for (const [n, liste] of Object.entries(d)) {
    if (!liste.length) continue
    const letzter = liste.at(-1)
    kartenZeile(k, `${n} (${liste.length} ${liste.length === 1 ? 'Eintrag' : 'Einträge'}), zuletzt ${letzter.datum}: ${letzter.eintrag}`)
  }
  if (!k.querySelector('p')) kartenZeile(k, 'Noch leer. Nach der ersten Partie mit echten Figuren steht hier etwas.')
}
$('heftknopf').onclick = hefteLesen
function marke(d, klasse, text) { const m = document.createElement('div'); m.className = `marke ${klasse}`; m.textContent = text; d.appendChild(m) }
function fuelle(ul, eintraege, leer) {
  ul.innerHTML = ''
  if (!eintraege.length) { const li = document.createElement('li'); li.className = 'leer'; li.textContent = leer; ul.appendChild(li); return }
  for (const [t, k] of eintraege) { const li = document.createElement('li'); li.className = k; li.textContent = t; ul.appendChild(li) }
}

// --- Tippt-Anzeige -------------------------------------------------------------------
function zeigeTippt(von, fertig) {
  if (fertig) { tippende.get(von)?.remove(); tippende.delete(von); return }
  if (tippende.has(von)) return
  const d = document.createElement('div'); d.className = 'tippt'
  d.innerHTML = `${von} überlegt<i></i><i></i><i></i>`
  tippende.set(von, d); verlauf.appendChild(d); unten()
}

// --- Klasse ---------------------------------------------------------------------------
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
  $('heftknopf').hidden = !(status.hefte && status.phase === 'ende')
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
    hinweis.textContent = 'Nacht. Wo stellst du dich hin? Die Plätze liegen von links (Tür) nach rechts (Fenster).'
    for (const o of w.orte) ortKnopf(wahl, o, () => {
      if (w.aufgabe === 'verstecken') return sende({ platz: o })
      wahl.innerHTML = ''
      hinweis.textContent = `Du stehst ${BEI[o] || o}. ${w.aufgabe === 'holen' ? 'Wen holst du? Dein Weg dorthin hinterlässt Spuren.' : 'Wen prüfst du?'}`
      for (const n of w.optionen) knopf(wahl, n, () => sende({ platz: o, ziel: n }))
    })
  } else if (w.art === 'zeigen') {
    hinweis.textContent = `Willst du dein Ergebnis allen vorzeigen? „${w.ergebnis}“ Vorgezeigt gilt es als bewiesen.`
    knopf(wahl, 'Vorzeigen', () => sende({ zeigen: true }))
    knopf(wahl, 'Für mich behalten', () => sende({ zeigen: false }), 'leise')
  } else if (w.art === 'untersuchen') {
    hinweis.textContent = 'Du darfst heute einen Platz oder das Klassenbuch untersuchen. Alle sehen, was du dir ansiehst, nur du siehst das Ergebnis.'
    for (const o of w.orte) (BEI[o] ? ortKnopf : knopf)(wahl, o, () => sende({ ort: o }))
    knopf(wahl, 'Nichts untersuchen', () => sende({ ort: null }), 'leise')
  } else if (w.art === 'stimme') {
    hinweis.textContent = 'Wer soll in den Keller? Dein Zettel bleibt geheim, bis alle abgegeben haben.'
    for (const n of w.optionen) knopf(wahl, n, () => sende({ fuer: n }))
    knopf(wahl, 'niemand', () => sende({ fuer: null }), 'leise')
  }
}
function knopf(wo, text, tu, extra = '') { const b = document.createElement('button'); b.className = `knopf ${extra}`; b.type = 'button'; b.textContent = text; b.onclick = tu; wo.appendChild(b); return b }
function ortKnopf(wo, ort, tu) {
  const b = knopf(wo, ort, tu, 'ortknopf')
  const s = document.createElement('small'); s.textContent = ORT_TIPP[ort] || ''; b.appendChild(s)
}

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
function frisch() { verlauf.innerHTML = ''; tippende = new Map(); karten = { privat: null, morgen: null }; wissen = leeresWissen(0); pulte = null; sprecher = null; schreckeBenutzt = []; $('meinerolle').textContent = '' }
async function starten(zuschauen) {
  const r = await fetch('/partie', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('name').value, zuschauen }) })
  const d = await r.json()
  if (d && d.fehler) { alert(d.fehler); return }
  frisch()
  $('start').hidden = true; $('raum').hidden = false; $('eingabe').hidden = zuschauen
  verbinde()
}
$('startform').onsubmit = (ev) => { ev.preventDefault(); starten(false) }
$('zuschauen').onclick = () => starten(true)
$('neu').onclick = () => { $('raum').hidden = true; $('eingabe').hidden = true; $('start').hidden = false; $('neu').hidden = true; quelle?.close(); quelle = null }

function verbinde() {
  quelle?.close()
  quelle = new EventSource('/ereignisse')
  quelle.addEventListener('status', (m) => { status = JSON.parse(m.data); if (!status) return; zeigeKlasse(); zeigeTafel(); zeigeWarte(status.warte) })
  quelle.addEventListener('ereignis', (m) => zeigeEreignis(JSON.parse(m.data)))
  quelle.addEventListener('tippt', (m) => { const d = JSON.parse(m.data); zeigeTippt(d.von, d.fertig) })
  quelle.addEventListener('warte', (m) => zeigeWarte(JSON.parse(m.data)))
  quelle.addEventListener('hefte', (m) => zeigeHefte(JSON.parse(m.data)))
}

// Laeuft schon eine Partie (Seite neu geladen)? Dann direkt rein.
fetch('/status').then((r) => r.json()).then((s) => {
  if (!s || s.phase === 'ende') return
  status = s; frisch(); $('start').hidden = true; $('raum').hidden = false; $('eingabe').hidden = s.zuschauen; verbinde()
}).catch(() => {})
