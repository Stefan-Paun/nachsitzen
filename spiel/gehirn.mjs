// Das Claude-Gehirn einer Figur: baut aus Figur, Rolle und dem, was die Figur mitbekommen hat,
// einen Prompt, laesst Claude genau ein Werkzeug waehlen und prueft die Antwort gegen die Regeln.
// Dieselbe Schnittstelle wie die Skript-Gehirne (siehe spiel/schleife.mjs).
// Geht etwas schief (Ablehnung, Unsinn, Netz), faellt die Figur auf eine harmlose Aktion zurueck.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCHATTEN, SCHLUESSEL } from './rollen.mjs'
import { ORT_NAMEN, KLASSENBUCH, bei, behauptungAus, VORTEILE } from './welt.mjs'
import { eintragBauen } from './hefte.mjs'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const SYSTEM_VORLAGE = fs.readFileSync(path.join(HIER, '..', 'prompts', 'system.md'), 'utf8')
const ROLLEN_TEXTE = JSON.parse(fs.readFileSync(path.join(HIER, '..', 'prompts', 'rollen.json'), 'utf8'))

// Text am Satzende kuerzen statt mitten im Wort
export function satzende(text, max) {
  if (text.length <= max) return text
  const kurz = text.slice(0, max)
  const ende = Math.max(kurz.lastIndexOf('. '), kurz.lastIndexOf('! '), kurz.lastIndexOf('? '), kurz.lastIndexOf('.'))
  return ende > max / 3 ? kurz.slice(0, ende + 1) : kurz
}

export function ladeFigur(name) {
  return JSON.parse(fs.readFileSync(path.join(HIER, '..', 'figuren', `${name.toLowerCase()}.json`), 'utf8'))
}

// --- Prompt ------------------------------------------------------------------------------

export function systemPrompt(figur, rolle, mitspieler, spieler, heft = '') {
  const ersetze = {
    heft: heft ? `## Dein Heft (aus früheren Nächten; das sind deine echten Erinnerungen, nutze sie)\n${heft}\n` : '',
    name: figur.name, alter: String(figur.alter), beschreibung: figur.beschreibung, stil: figur.stil,
    beispiele: figur.beispiele.map((b) => `- „${b}“`).join('\n'),
    mitspieler: mitspieler.filter((n) => n !== figur.name).join(', '),
    spielerhinweis: '',   // der Mensch wird nicht erwaehnt: die Figuren sollen ihn behandeln wie jeden anderen
    rolle: ROLLEN_TEXTE[rolle],
    orte: ORT_NAMEN.join(', '),
    vorteile: ORT_NAMEN.map((o) => `${o}: ${VORTEILE[o]}`).join(' '),
  }
  return SYSTEM_VORLAGE.replace(/\{\{(\w+)\}\}/g, (_, k) => ersetze[k] ?? '')
}

// Ereignisse aus Sicht der Figur als lesbarer Verlauf.
export function verlaufAlsText(ereignisse, ich) {
  const zeilen = []
  for (const e of ereignisse) {
    switch (e.art) {
      case 'start': zeilen.push(`[Abend] ${e.text}`); break
      case 'nacht': zeilen.push(`[Nacht ${e.nacht}] ${e.text}`); break
      case 'platz': zeilen.push(`[Nacht ${e.nacht}] Du stellst dich ${bei(e.ort)} hin.`); break
      case 'schatten-waehlt': zeilen.push(`[Nacht ${e.nacht}] Du schleichst zu ${e.ziel} und zurück.${e.verwischt ? ' Du hast dir Zeit genommen und die Tinte mit dem Ärmel verwischt.' : ''}`); break
      case 'wahrheit': break   // nur fuer die Anzeige am Ende
      case 'pruefung': zeilen.push(`[Nacht ${e.nacht}] Du prüfst ${e.ziel}: ${e.istSchatten ? 'DER SCHATTEN.' : 'kein Schatten.'}`); break
      case 'beobachtung': zeilen.push(`[Nacht ${e.nacht}, was du mitbekommen hast] ${e.text}`); break
      case 'beweis': zeilen.push(`[BEWEIS, vom Spiel geprüft, wahr] ${e.von === ich ? 'Du zeigst' : `${e.von} zeigt`} das Ergebnis der Untersuchung ${e.ort === KLASSENBUCH ? 'im Klassenbuch' : bei(e.ort)}: ${e.text}`); break
      case 'zettelwahl': zeilen.push(`[Zettel aufgedeckt] ${Object.entries(e.stimmen).map(([v, f]) => `${v === ich ? 'du' : v} → ${f ?? 'niemand'}`).join(', ')}`); break
      case 'verschwunden': zeilen.push(`[Morgen ${e.nacht}] ${e.text}`); break
      case 'fund': zeilen.push(`[Morgen ${e.nacht}, Fund für alle sichtbar] ${e.text}`); break
      case 'zettel': zeilen.push(`[Morgen ${e.nacht}] Ein Zettel liegt unter der Tür, alle lesen ihn: „${e.text}“`); break
      case 'hausmeister': case 'glocke': zeilen.push(`[Morgen ${e.nacht}] ${e.text}`); break
      case 'untersucht': zeilen.push(`${e.von === ich ? 'Du untersuchst' : `${e.von} untersucht`} ${e.ort === KLASSENBUCH ? 'das Klassenbuch' : `den Platz ${bei(e.ort)}`}.`); break
      case 'ergebnis': zeilen.push(`[Nur du weißt das] ${e.text}`); break
      case 'diskussion': zeilen.push(`[Gespräch, Runde ${e.runde}${e.von ? ` von ${e.von}` : ''}]`); break
      case 'sagt': zeilen.push(`${e.von === ich ? 'Du' : e.von}${e.an ? ` (zu ${e.an === ich ? 'dir' : e.an})` : ''}: ${e.text}`); break
      case 'schweigt': zeilen.push(`${e.von === ich ? 'Du schweigst' : `${e.von} schweigt`}.`); break
      case 'abstimmung': zeilen.push(`[Abstimmung] ${e.text}`); break
      case 'stimme': if (e.von === ich) zeilen.push(`Du schreibst ${e.fuer ? e.fuer : 'niemanden'} auf deinen Zettel.`); else zeilen.push(`${e.von} stimmt ${e.fuer ? `für ${e.fuer}` : 'nicht ab'} (offen).`); break
      case 'eingesperrt': zeilen.push(`[Ergebnis] ${e.name} kommt in den Keller. ${e.name} war ${e.rolle === SCHATTEN ? 'der Schatten' : e.rolle === SCHLUESSEL ? 'der Schlüsselträger' : 'ein normaler Schüler'}.`); break
      case 'niemand': zeilen.push(`[Ergebnis] Niemand kommt in den Keller${e.gleichstand ? ' (Gleichstand)' : ''}.`); break
      default: break   // 'rolle' steht im Systemprompt, 'ende' braucht keine Entscheidung mehr
    }
  }
  return zeilen.join('\n')
}

// --- Werkzeuge je Phase ------------------------------------------------------------------

const namenSchema = (namen, beschreibung) => ({ type: 'string', enum: namen, description: beschreibung })
const platzSchema = { type: 'string', enum: ORT_NAMEN, description: 'Wo du dich heute Nacht hinstellst. Das steht morgen vielleicht in einer Spur.' }
const objekt = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })

export function werkzeuge(phase, rolle, andere, { verwischen = false } = {}) {
  const sprechen = {
    name: 'sprechen', description: 'Etwas sagen, das alle im Raum hören. Höchstens zwei Sätze.', strict: true,
    input_schema: objekt({ text: { type: 'string', description: 'Was du sagst, in deiner Art.' }, an: { anyOf: [{ type: 'string', enum: andere }, { type: 'null' }], description: 'Wen du direkt ansprichst, oder null für alle.' }, behauptetPlatz: { anyOf: [{ type: 'string', enum: ORT_NAMEN }, { type: 'null' }], description: 'Falls du in diesem Satz sagst, wo DU letzte Nacht standest (wahr oder gelogen): dieser Platz. Sonst null.' } }),
  }
  const schweigen = { name: 'schweigen', description: 'Nichts sagen, nur zuhören.', strict: true, input_schema: objekt({}) }
  switch (phase) {
    case 'abend': return [sprechen]
    case 'diskussion': return [sprechen, schweigen]
    case 'nacht':
      if (rolle === SCHATTEN) {
        const felder = { platz: platzSchema, ziel: namenSchema(andere, 'Wen du holst.') }
        if (verwischen) felder.verwischen = { type: 'boolean', description: 'Einmal pro Partie: die Tintenspur verwischen. Dann zeigt sie keine Richtung und es gibt keinen Kreidestaub, aber wer neben dir steht, merkt fast sicher, dass du lange weg warst.' }
        return [{ name: 'holen', description: 'Deinen Platz wählen und diese Person heute Nacht holen: Sie verschwindet. Dein Weg hinterlässt Spuren.', strict: true, input_schema: objekt(felder) }]
      }
      if (rolle === SCHLUESSEL) return [{ name: 'pruefen', description: 'Deinen Platz wählen und diese Person heute Nacht prüfen: Du erfährst, ob sie der Schatten ist.', strict: true, input_schema: objekt({ platz: platzSchema, ziel: namenSchema(andere, 'Wen du prüfst.') }) }]
      return [{ name: 'verstecken', description: 'Deinen Platz für die Nacht wählen.', strict: true, input_schema: objekt({ platz: platzSchema }) }]
    case 'abstimmung': return [{ name: 'abstimmen', description: 'Dein geheimer Zettel: wer in den Keller soll, oder "niemand". Niemand sieht ihn vor der Auszählung.', strict: true, input_schema: objekt({ fuer: namenSchema([...andere, 'niemand'], 'Dein Kandidat oder niemand.') }) }]
    default: return []
  }
}

const AUFGABE = {
  abend: 'Es ist Abend, ihr sitzt gerade erst fest. Sag einen Satz, der zu dir passt: ein Gedanke, eine Frage an jemanden, ein Spruch.',
  nacht: 'Es ist Nacht. Such dir einen Platz und entscheide heimlich.',
  diskussion: 'Ihr redet. Du bist dran: Sag etwas Neues (höchstens zwei Sätze, reagiere auf das Letzte, nutze deine Beobachtungen, Funde und vorgezeigte Beweise, wiederhole nicht, was du oder andere schon gesagt haben, und sprich nicht immer dieselbe Person an) oder schweig.',
  abstimmung: 'Abstimmung. Wer soll in den Keller? Entscheide anhand dessen, was du gesehen und gehört hast.',
}

// --- Gehirn ---------------------------------------------------------------------------

export function claudeGehirn(figur, rolle, { anfrage, mitspieler, spieler = null, zufall, heft = '', log = () => {} }) {
  const system = systemPrompt(figur, rolle, mitspieler, spieler, heft)
  const name = figur.name

  async function entscheide(phase, sicht, lebende, extra = {}) {
    const andere = phase === 'nacht' && extra.ziele ? extra.ziele : lebende.filter((n) => n !== name)
    const tools = werkzeuge(phase, rolle, andere, { verwischen: !!extra.verwischen })
    const nachricht = `Was du bisher mitbekommen hast:\n${verlaufAlsText(sicht, name)}\n\nNoch im Raum: ${lebende.join(', ')}.\n${AUFGABE[phase]}`
    let erg
    try { erg = await anfrage({ system, nachricht, tools }) } catch (f) { erg = { werkzeug: null, grund: f.message } }
    const verwerfe = (grund) => { log(`${name}: ${grund}, Rückfall`); return rueckfall(phase, andere) }
    const w = erg.werkzeug
    if (!w || !tools.some((t) => t.name === w.name)) return verwerfe(w ? `Werkzeug ${w.name} nicht erlaubt in ${phase}` : (erg.grund || 'kein Werkzeug'))
    const e = w.eingabe
    switch (w.name) {
      case 'sprechen': {
        const text = satzende(String(e.text || '').trim(), 400)
        if (!text) return phase === 'diskussion' ? { art: 'schweigt' } : verwerfe('leerer Text')
        return { art: 'sagt', text, an: andere.includes(e.an) ? e.an : null, behauptet: ORT_NAMEN.includes(e.behauptetPlatz) ? e.behauptetPlatz : behauptungAus(text) }
      }
      case 'schweigen': return { art: 'schweigt' }
      case 'verstecken': return ORT_NAMEN.includes(e.platz) ? { platz: e.platz } : verwerfe(`Platz ${e.platz} ungültig`)
      case 'holen':
      case 'pruefen':
        if (!ORT_NAMEN.includes(e.platz)) return verwerfe(`Platz ${e.platz} ungültig`)
        return andere.includes(e.ziel) ? { platz: e.platz, ziel: e.ziel, verwischen: w.name === 'holen' && e.verwischen === true } : verwerfe(`Ziel ${e.ziel} ungültig`)
      case 'abstimmen': return { art: 'stimme', fuer: andere.includes(e.fuer) ? e.fuer : null }
      default: return verwerfe('unbekanntes Werkzeug')
    }
  }

  function rueckfall(phase, andere) {
    switch (phase) {
      case 'abend': return { art: 'sagt', text: 'Ist hier noch jemand wach?', an: null }
      case 'diskussion': return { art: 'schweigt' }
      case 'nacht': return { platz: zufall.aus(ORT_NAMEN), ziel: rolle === SCHATTEN || rolle === SCHLUESSEL ? zufall.aus(andere) : undefined }
      case 'abstimmung': return { art: 'stimme', fuer: null }
      default: return { art: 'schweigt' }
    }
  }

  // Vorzeigen kostet keinen Aufruf: Wer etwas Belastendes gefunden hat, zeigt es meist; der Schatten eher nicht.
  function zeigen(sicht, lebende, { ergebnis }) {
    if (!ergebnis) return false
    const belastend = (ergebnis.namen?.length > 0 && ergebnis.namen.length <= 2) || ergebnis.durchgang || ergebnis.ort === KLASSENBUCH
    if (rolle === SCHATTEN) return belastend && !ergebnis.namen?.includes(name) && zufall.zahl() < 0.3
    return belastend && zufall.zahl() < 0.7
  }

  // Untersuchen kostet keinen API-Aufruf: eine einfache Heuristik entscheidet, was die Figur
  // sich ansieht. Das Ergebnis landet in ihrem Verlauf, mit dem sie dann redet.
  function untersuchen(sicht, lebende, { orte, uebrig = 3 }) {
    if (zufall.zahl() < (uebrig <= 1 ? 0.5 : 0.25)) return null   // die letzte Untersuchung hebt man sich eher auf
    const heute = Math.max(0, ...sicht.map((e) => e.nacht ?? 0))
    const schonDran = new Set(sicht.filter((e) => e.art === 'untersucht' && e.nacht === heute).map((e) => e.ort))
    const frei = (o) => !schonDran.has(o)
    const fund = [...sicht].reverse().find((e) => e.art === 'fund' && e.nacht === heute)
    const treffer = fund && ORT_NAMEN.find((o) => fund.text.includes(bei(o)) || fund.text.includes(o))
    if (treffer && frei(treffer) && zufall.zahl() < 0.6) return { ort: treffer }   // dem Fund folgen, aber nicht als Vierter
    if (frei(KLASSENBUCH) && zufall.zahl() < 0.3) return { ort: KLASSENBUCH }
    const rest = orte.filter((o) => o !== KLASSENBUCH && frei(o))
    return { ort: zufall.aus(rest.length ? rest : orte.filter((o) => o !== KLASSENBUCH)) }
  }

  // Nach der Partie: ein Eintrag ins Heft, aus Sicht der Figur, plus Vertrauen zu jedem.
  async function heftSchreiben(sicht, zusammenfassung) {
    const andere = mitspieler.filter((n) => n !== name)
    const tool = { name: 'heft_schreiben', description: 'Schreib in dein Heft, was du dir aus dieser Nacht merken willst.', strict: true,
      input_schema: objekt({
        eintrag: { type: 'string', description: 'Drei bis fünf Sätze in deiner Art, in der Ich-Form. Nur, was du selbst erlebt hast und was am Ende aufgedeckt wurde: Wer hat dich belogen, wer hatte recht, wer war der Schatten, was nimmst du dir vor. Mit Namen, ohne Kraftausdrücke, nichts dazuerfinden.' },
        vertrauen: { type: 'array', description: 'Wie sehr du jeder Person jetzt traust, von -2 (gar nicht) bis 2 (sehr).', items: objekt({ name: namenSchema(andere, 'Person'), wert: { type: 'integer', enum: [-2, -1, 0, 1, 2] } }) },   // strict: kein minimum/maximum, nur enum
      }) }
    const z = zusammenfassung
    const raus = !z.uebrig.includes(name)
    const nachricht = `Die Partie ist vorbei. ${z.sieger === 'schueler' ? 'Die Schüler haben gewonnen' : 'Der Schatten hat gewonnen'}; der Schatten war ${z.schatten}. Verschwunden: ${z.verschwunden.join(', ') || 'niemand'}. Im Keller: ${z.keller.join(', ') || 'niemand'}.${raus ? ` Du selbst warst am Ende nicht mehr im Raum; was danach passiert ist, hast du erst erfahren, als die Tür aufging. Schreib nur über das, was du selbst erlebt hast, und über das Ergebnis.` : ''}\n\nWas du erlebt hast:\n${verlaufAlsText(sicht, name)}\n\nSchreib jetzt in dein Heft (Werkzeug heft_schreiben), höchstens fünf Sätze.`
    let erg
    try { erg = await anfrage({ system, nachricht, tools: [tool], maxTokens: 700 }) } catch (f) { erg = { werkzeug: null, grund: f.message } }
    if (erg.werkzeug?.name !== 'heft_schreiben') { log(`${name}: kein Hefteintrag (${erg.grund || 'leer'})`); return eintragBauen({ eintrag: `Die Nacht, in der ${z.schatten} der Schatten war. Mehr schreibe ich dazu nicht.`, vertrauen: [] }, andere) }
    return eintragBauen(erg.werkzeug.eingabe, andere)
  }

  return {
    name, rolle, system, heftSchreiben,
    abend: (sicht, lebende) => entscheide('abend', sicht, lebende),
    nacht: (sicht, lebende, extra) => entscheide('nacht', sicht, lebende, extra),
    untersuchen, zeigen,
    diskussion: (sicht, lebende) => entscheide('diskussion', sicht, lebende),
    abstimmung: (sicht, lebende) => entscheide('abstimmung', sicht, lebende),
    merkePruefung() {},   // steht im Verlauf (Ereignis 'pruefung'), kein extra Gedaechtnis noetig
  }
}
