// Das Claude-Gehirn einer Figur: baut aus Figur, Rolle und dem, was die Figur mitbekommen hat,
// einen Prompt, laesst Claude genau ein Werkzeug waehlen und prueft die Antwort gegen die Regeln.
// Dieselbe Schnittstelle wie die Skript-Gehirne (tools/skriptgehirne.mjs): abend/nacht/diskussion/abstimmung.
// Geht etwas schief (Ablehnung, Unsinn, Netz), faellt die Figur auf eine harmlose Aktion zurueck.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCHATTEN, SCHLUESSEL } from './rollen.mjs'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const SYSTEM_VORLAGE = fs.readFileSync(path.join(HIER, '..', 'prompts', 'system.md'), 'utf8')
const ROLLEN_TEXTE = JSON.parse(fs.readFileSync(path.join(HIER, '..', 'prompts', 'rollen.json'), 'utf8'))

export function ladeFigur(name) {
  return JSON.parse(fs.readFileSync(path.join(HIER, '..', 'figuren', `${name.toLowerCase()}.json`), 'utf8'))
}

// --- Prompt ------------------------------------------------------------------------------

export function systemPrompt(figur, rolle, mitspieler, spieler) {
  const ersetze = {
    name: figur.name, alter: String(figur.alter), beschreibung: figur.beschreibung, stil: figur.stil,
    beispiele: figur.beispiele.map((b) => `- „${b}“`).join('\n'),
    mitspieler: mitspieler.filter((n) => n !== figur.name).join(', '),
    spielerhinweis: spieler && spieler !== figur.name ? `${spieler} ist ein echter Mitschüler und tippt selbst, was er sagt. Behandle ihn genau wie alle anderen.` : '',
    rolle: ROLLEN_TEXTE[rolle],
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
      case 'schatten-waehlt': zeilen.push(`[Nacht ${e.nacht}] Du gehst zu ${e.ziel}.`); break
      case 'pruefung': zeilen.push(`[Nacht ${e.nacht}] Du prüfst ${e.ziel}: ${e.istSchatten ? 'DER SCHATTEN.' : 'kein Schatten.'}`); break
      case 'verschwunden': zeilen.push(`[Morgen ${e.nacht}] ${e.text}`); break
      case 'diskussion': zeilen.push(`[Gespräch, Runde ${e.runde}]`); break
      case 'sagt': zeilen.push(`${e.von === ich ? 'Du' : e.von}${e.an ? ` (zu ${e.an === ich ? 'dir' : e.an})` : ''}: ${e.text}`); break
      case 'schweigt': zeilen.push(`${e.von === ich ? 'Du schweigst' : `${e.von} schweigt`}.`); break
      case 'abstimmung': zeilen.push(`[Abstimmung] ${e.text}`); break
      case 'stimme': zeilen.push(`${e.von === ich ? 'Du stimmst' : `${e.von} stimmt`} ${e.fuer ? `für ${e.fuer}` : 'nicht ab'}.`); break
      case 'eingesperrt': zeilen.push(`[Ergebnis] ${e.name} kommt in den Keller. ${e.name} war ${e.rolle === SCHATTEN ? 'der Schatten' : e.rolle === SCHLUESSEL ? 'der Schlüsselträger' : 'ein normaler Schüler'}.`); break
      case 'niemand': zeilen.push(`[Ergebnis] Niemand kommt in den Keller${e.gleichstand ? ' (Gleichstand)' : ''}.`); break
      default: break   // 'rolle' steht im Systemprompt, 'ende' braucht keine Entscheidung mehr
    }
  }
  return zeilen.join('\n')
}

// --- Werkzeuge je Phase ------------------------------------------------------------------

function namenSchema(namen, beschreibung) {
  return { type: 'string', enum: namen, description: beschreibung }
}

export function werkzeuge(phase, rolle, andere) {
  const sprechen = {
    name: 'sprechen', description: 'Etwas sagen, das alle im Raum hören. Höchstens zwei Sätze.', strict: true,
    input_schema: { type: 'object', additionalProperties: false, required: ['text', 'an'],
      properties: { text: { type: 'string', description: 'Was du sagst, in deiner Art.' }, an: { anyOf: [{ type: 'string', enum: andere }, { type: 'null' }], description: 'Wen du direkt ansprichst, oder null für alle.' } } },
  }
  const schweigen = { name: 'schweigen', description: 'Nichts sagen, nur zuhören.', strict: true, input_schema: { type: 'object', additionalProperties: false, properties: {} } }
  switch (phase) {
    case 'abend': return [sprechen]
    case 'diskussion': return [sprechen, schweigen]
    case 'nacht':
      if (rolle === SCHATTEN) return [{ name: 'holen', description: 'Diese Person verschwindet heute Nacht.', strict: true, input_schema: { type: 'object', additionalProperties: false, required: ['ziel'], properties: { ziel: namenSchema(andere, 'Wen du holst.') } } }]
      if (rolle === SCHLUESSEL) return [{ name: 'pruefen', description: 'Diese Person heute Nacht prüfen: Du erfährst, ob sie der Schatten ist.', strict: true, input_schema: { type: 'object', additionalProperties: false, required: ['ziel'], properties: { ziel: namenSchema(andere, 'Wen du prüfst.') } } }]
      return []
    case 'abstimmung': return [{ name: 'abstimmen', description: 'Deine Stimme: wer in den Keller soll, oder "niemand".', strict: true, input_schema: { type: 'object', additionalProperties: false, required: ['fuer', 'begruendung'], properties: { fuer: namenSchema([...andere, 'niemand'], 'Dein Kandidat oder niemand.'), begruendung: { type: 'string', description: 'Ein kurzer Satz, warum, laut gesagt und in deinen eigenen Worten (nicht wiederholen, was andere schon begründet haben).' } } } }]
    default: return []
  }
}

const AUFGABE = {
  abend: 'Es ist Abend, ihr sitzt gerade erst fest. Sag einen Satz, der zu dir passt: ein Gedanke, eine Frage an jemanden, ein Spruch.',
  nacht: 'Es ist Nacht. Entscheide jetzt heimlich.',
  diskussion: 'Ihr redet. Du bist dran: Sag etwas (höchstens zwei Sätze, reagiere auf das Letzte) oder schweig.',
  abstimmung: 'Abstimmung. Wer soll in den Keller? Entscheide anhand dessen, was du gehört hast.',
}

// --- Gehirn ---------------------------------------------------------------------------

export function claudeGehirn(figur, rolle, { anfrage, mitspieler, spieler = null, zufall, log = () => {} }) {
  const system = systemPrompt(figur, rolle, mitspieler, spieler)
  const name = figur.name

  async function entscheide(phase, sicht, lebende) {
    const andere = lebende.filter((n) => n !== name)
    const tools = werkzeuge(phase, rolle, andere)
    const nachricht = `Was du bisher mitbekommen hast:\n${verlaufAlsText(sicht, name)}\n\nNoch im Raum: ${lebende.join(', ')}.\n${AUFGABE[phase]}`
    let erg
    try { erg = await anfrage({ system, nachricht, tools }) } catch (f) { erg = { werkzeug: null, grund: f.message } }
    const verwerfe = (grund) => { log(`${name}: ${grund}, Rueckfall`); return rueckfall(phase, andere) }
    const w = erg.werkzeug
    if (!w || !tools.some((t) => t.name === w.name)) return verwerfe(w ? `Werkzeug ${w.name} nicht erlaubt in ${phase}` : (erg.grund || 'kein Werkzeug'))
    const e = w.eingabe
    switch (w.name) {
      case 'sprechen': {
        const text = String(e.text || '').trim().slice(0, 400)
        if (!text) return phase === 'diskussion' ? { art: 'schweigt' } : verwerfe('leerer Text')
        return { art: 'sagt', text, an: andere.includes(e.an) ? e.an : null }
      }
      case 'schweigen': return { art: 'schweigt' }
      case 'holen':
      case 'pruefen': return andere.includes(e.ziel) ? { art: w.name, ziel: e.ziel } : verwerfe(`Ziel ${e.ziel} ungueltig`)
      case 'abstimmen': {
        const fuer = andere.includes(e.fuer) ? e.fuer : null
        return { art: 'stimme', fuer, begruendung: String(e.begruendung || '').trim().slice(0, 200) }
      }
      default: return verwerfe('unbekanntes Werkzeug')
    }
  }

  function rueckfall(phase, andere) {
    switch (phase) {
      case 'abend': return { art: 'sagt', text: 'Ist hier noch jemand wach?', an: null }
      case 'diskussion': return { art: 'schweigt' }
      case 'nacht': return { art: rolle === SCHATTEN ? 'holen' : 'pruefen', ziel: zufall.aus(andere) }
      case 'abstimmung': return { art: 'stimme', fuer: null, begruendung: '' }
      default: return { art: 'schweigt' }
    }
  }

  return {
    name, rolle, system,
    abend: (sicht, lebende) => entscheide('abend', sicht, lebende),
    nacht: (sicht, lebende) => entscheide('nacht', sicht, lebende),
    diskussion: (sicht, lebende) => entscheide('diskussion', sicht, lebende),
    abstimmung: (sicht, lebende) => entscheide('abstimmung', sicht, lebende),
    merkePruefung() {},   // steht im Verlauf (Ereignis 'pruefung'), kein extra Gedaechtnis noetig
  }
}
