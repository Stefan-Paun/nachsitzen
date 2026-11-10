// Figuren-Editor und Besetzungsauswahl im Browser. Die Pruefung macht der Server (dasselbe Schema wie
// beim Speichern); hier ist nur Formular, Live-Anzeige und Vorschau. Alle Texte gehen per textContent in die Seite.

import { zeichneFigur } from './klasse.js'
import { pruefeBesetzung, formularZuFigur, figurZuFormular, kopieName, fehlerJeFeld, LEER, MIN_KI, MAX_KI } from './besetzung.js'

const $ = (id) => document.getElementById(id)
const JSON_KOPF = { 'content-type': 'application/json' }
const FELDER = ['name', 'alter', 'beschreibung', 'stil', 'b1', 'b2', 'b3', 'geheimnis', 'frisur', 'haut', 'haar', 'shirt']

let daten = null          // Antwort von GET /figuren; null = Editor nicht verfuegbar
let gewaehlt = null       // Namen der gewaehlten KI-Figuren
let bearbeite = null      // Kennung der Figur im Formular (null = neue Figur)
let pruefWecker = null, pruefNr = 0, formularOk = false
let aenderung = () => {}

const form = () => $('figurform')
const lese = () => Object.fromEntries(FELDER.map((f) => [f, form().elements[f].value]))
function setze(werte) { for (const f of FELDER) form().elements[f].value = werte[f] ?? LEER[f] }
function melde(text, schlecht = false) { const m = $('figurmeldung'); m.textContent = text; m.classList.toggle('schlecht', schlecht) }

async function api(methode, pfad, body) {
  const r = await fetch(pfad, { method: methode, headers: JSON_KOPF, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, daten: await r.json().catch(() => ({})) }
}

// --- Besetzung ---------------------------------------------------------------------------
export function besetzung() { return daten ? [...gewaehlt] : undefined }   // undefined = Server nimmt die sechs Standardfiguren

function zeigeBesetzung() {
  if (!daten) { $('besetzung').hidden = true; return }
  $('besetzung').hidden = false
  const alle = [...daten.mitgeliefert, ...daten.eigene]
  gewaehlt = gewaehlt.filter((n) => alle.some((f) => f.name === n))
  const liste = $('besetzungsliste'); liste.replaceChildren()
  for (const f of alle) {
    const l = document.createElement('label')
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = gewaehlt.includes(f.name)
    c.onchange = () => { gewaehlt = c.checked ? [...gewaehlt, f.name] : gewaehlt.filter((n) => n !== f.name); zeigeBesetzung() }
    l.append(c, document.createTextNode(f.name + (f.kennung ? ' (eigen)' : '')))
    liste.appendChild(l)
  }
  const p = pruefeBesetzung(gewaehlt.length, daten.besetzung.min, daten.besetzung.max)
  $('besetzungshinweis').textContent = p.text
  $('besetzungshinweis').classList.toggle('schlecht', !p.ok)
  aenderung(p.ok)
}

// --- Karte (Vorschau) ---------------------------------------------------------------------
function zeigeKarte() {
  const f = lese(), wo = $('figurvorschau'); wo.replaceChildren()
  const el = (tag, text, klasse) => { const e = document.createElement(tag); e.textContent = text; if (klasse) e.className = klasse; return e }
  const kopf = el('div', '', 'kopfzeile')
  const c = document.createElement('canvas'); c.width = 48; c.height = 56; c.setAttribute('role', 'img'); c.setAttribute('aria-label', f.name || 'Neue Figur')
  zeichneFigur(c.getContext('2d'), 0, 0, { haut: f.haut, haar: f.haar, frisur: f.frisur, shirt: f.shirt }, 4)
  const titel = document.createElement('div')
  titel.append(el('h3', f.name.trim() || 'Ohne Namen'), el('div', `${f.alter.trim() || '17'} Jahre`, 'rolle'))
  kopf.append(c, titel); wo.appendChild(kopf)
  wo.appendChild(f.beschreibung.trim() ? el('div', f.beschreibung.trim()) : el('div', 'Eigenheiten fehlen noch.', 'leer'))
  wo.appendChild(f.stil.trim() ? el('div', `So redet sie/er: ${f.stil.trim()}`) : el('div', 'Art zu reden fehlt noch.', 'leer'))
  for (const b of [f.b1, f.b2, f.b3]) if (b.trim()) wo.appendChild(el('blockquote', `„${b.trim()}“`))
  if (f.geheimnis.trim()) wo.appendChild(el('div', `Geheimnis (nur im Kopf der Figur): ${f.geheimnis.trim()}`, 'geheim'))
}

// --- Live-Pruefung ------------------------------------------------------------------------
function zeigeFehler(fehler) {
  const je = fehlerJeFeld(fehler)
  for (const e of form().querySelectorAll('[data-fehler]')) e.textContent = (je[e.dataset.fehler] || []).join(' · ')
  for (const f of FELDER) form().elements[f].classList.toggle('invalid', !!je[f])
}
function zeigeZaehler() {
  for (const e of form().querySelectorAll('[data-zaehler]')) {
    const f = e.dataset.zaehler, max = daten.grenzen[f].max
    e.textContent = `${form().elements[f].value.trim().length} / ${max}`
  }
}
async function pruefe() {
  const nr = ++pruefNr
  const r = await api('POST', '/figuren/pruefen', { figur: formularZuFigur(lese()) })
  if (nr !== pruefNr) return   // eine neuere Pruefung laeuft
  formularOk = !!r.daten.ok
  // Leere Felder erst als Fehler zeigen, wenn der Nutzer schon etwas getippt hat
  const f = lese(), angefasst = FELDER.some((k) => ['frisur', 'haut', 'haar', 'shirt', 'alter'].includes(k) ? false : f[k].trim())
  zeigeFehler(angefasst ? r.daten.fehler : [])
  const neuerName = r.daten.ok && !bearbeite && r.daten.vorhanden
  if (neuerName) zeigeFehler([{ feld: 'name', text: 'Diesen Namen gibt es schon' }])
  $('figurspeichern').disabled = !r.daten.ok || neuerName || (!bearbeite && daten.eigene.length >= daten.max)
  if (!bearbeite && daten.eigene.length >= daten.max) melde(`Höchstens ${daten.max} eigene Figuren – wirf erst eine in den Papierkorb.`, true)
}
function pruefeSpaeter() { zeigeKarte(); zeigeZaehler(); clearTimeout(pruefWecker); pruefWecker = setTimeout(pruefe, 250) }

// --- Liste und Aktionen -------------------------------------------------------------------
function zeigeListe() {
  const ul = $('figurenliste'); ul.replaceChildren()
  $('figurenzahl').textContent = `${daten.eigene.length} / ${daten.max}`
  if (!daten.eigene.length) { const li = document.createElement('li'); li.className = 'leer'; li.textContent = 'Noch keine eigene Figur.'; ul.appendChild(li) }
  for (const f of daten.eigene) {
    const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.textContent = f.name
    b.setAttribute('aria-current', String(f.kennung === bearbeite))
    b.onclick = () => oeffne(f)
    li.appendChild(b); ul.appendChild(li)
  }
  $('figurkopie').disabled = $('figurweg').disabled = !bearbeite
}
function oeffne(figur) {
  bearbeite = figur ? figur.kennung : null
  setze(figur ? figurZuFormular(figur) : LEER)
  form().elements.name.readOnly = !!figur   // Umbenennen = Duplizieren mit neuem Namen
  melde(''); zeigeListe(); pruefeSpaeter()
}
async function lade() {
  const r = await api('GET', '/figuren')
  daten = r.status === 200 ? r.daten : null
  return daten
}
async function neuLaden(nachher) {
  await lade(); zeigeListe(); zeigeBesetzung()
  if (nachher !== undefined) { const f = daten.eigene.find((x) => x.kennung === nachher); oeffne(f ?? null) }
}

async function speichern(ev) {
  ev.preventDefault()
  const figur = formularZuFigur(lese())
  const r = bearbeite ? await api('PUT', `/figuren/${bearbeite}`, { figur }) : await api('POST', '/figuren', { figur })
  if (r.status !== 200) { zeigeFehler(r.daten.felder || []); melde(r.daten.fehler || 'Speichern ging nicht', true); return }
  await neuLaden(r.daten.figur.kennung)
  melde('Gespeichert.')
}
function duplizieren() {
  const f = lese()
  f.name = kopieName(f.name, daten.eigene.map((x) => x.name))
  bearbeite = null; setze(f); form().elements.name.readOnly = false
  melde('Kopie – ändere, was du willst, und speichere.'); zeigeListe(); pruefeSpaeter()
}
async function papierkorb() {
  const f = daten.eigene.find((x) => x.kennung === bearbeite)
  if (!f || !confirm(`„${f.name}“ in den Papierkorb legen?`)) return
  const r = await api('DELETE', `/figuren/${f.kennung}`)
  if (r.status !== 200) { melde(r.daten.fehler || 'Das ging nicht', true); return }
  gewaehlt = gewaehlt.filter((n) => n !== f.name)
  await neuLaden(null)
  melde('Figur liegt im Papierkorb (Ordner „geloescht“).')
}

// --- Start --------------------------------------------------------------------------------
// onAenderung(ok): Besetzung gueltig oder nicht; der Startknopf richtet sich danach.
export async function starteEditor({ onAenderung = () => {} } = {}) {
  aenderung = onAenderung
  if (!(await lade())) return false
  gewaehlt = daten.mitgeliefert.map((f) => f.name)
  zeigeBesetzung(); zeigeListe()
  $('editorauf').onclick = () => { $('start').hidden = true; $('editor').hidden = false; neuLaden(undefined).then(() => oeffne(null)) }
  $('editorzu').onclick = () => { $('editor').hidden = true; $('start').hidden = false; zeigeBesetzung() }
  $('figurneu').onclick = () => oeffne(null)
  form().addEventListener('input', pruefeSpaeter)
  form().addEventListener('change', pruefeSpaeter)
  form().onsubmit = speichern
  $('figurkopie').onclick = duplizieren
  $('figurweg').onclick = papierkorb
  oeffne(null)
  return true
}
