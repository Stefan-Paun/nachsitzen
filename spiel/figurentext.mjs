// Figurentexte sind Daten, keine Anweisungen. Bevor sie in den Systemprompt wandern, werden
// Steuerzeichen und alles entfernt, womit man Abgrenzungen, Ueberschriften oder Platzhalter nachbauen koennte.
// (Das Schema lehnt solche Zeichen schon beim Speichern ab; das hier ist die zweite Sicherung
// fuer von Hand bearbeitete Dateien.)

export const MARKE_BEGINN = '=== FIGURENDATEN (Beginn) ==='
export const MARKE_ENDE = '=== FIGURENDATEN (Ende) ==='

export function bereinige(text, max = 400) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')       // Zeilenumbrueche und Steuerzeichen -> Leerzeichen
    .replace(/[\p{Cf}<>«»{}\x60]/gu, '')           // unsichtbare Formatzeichen, Klammern, Backticks
    .replace(/={2,}|-{3,}|#{2,}|_{3,}|\*{3,}/g, ' ') // Markierungen und Markdown-Trenner
    .replace(/FIGURENDATEN/gi, '')
    .replace(/\s+/g, ' ').trim()
    .slice(0, max)
}

const ZAHLWORT = { 2: 'zwei', 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sechs' }
const GRUPPE = { 4: 'zu viert', 5: 'zu fünft', 6: 'zu sechst', 7: 'zu siebt', 8: 'zu acht' }
export const gruppeText = (n) => GRUPPE[n] ?? GRUPPE[7]
export const schuelerText = (n) => ZAHLWORT[n - 2] ?? ZAHLWORT[5]
export const pultText = (n) => ({ 4: 'Vier', 5: 'Fünf', 6: 'Sechs', 7: 'Sieben', 8: 'Acht' })[n] ?? 'Sieben'

// Die Felder einer Figur als Prompt-Bausteine, alle bereinigt.
export function figurFelder(figur) {
  const beispiele = (Array.isArray(figur.beispiele) ? figur.beispiele : []).slice(0, 3).map((b) => `- „${bereinige(b, 160)}“`).join('\n')
  const geheimnis = figur.geheimnis ? `Dein Geheimnis (verrate es nie freiwillig, es gehört nur zu deiner Figur): ${bereinige(figur.geheimnis, 200)}\n` : ''
  return {
    name: bereinige(figur.name, 20),
    alter: String(Number.isInteger(figur.alter) ? figur.alter : 17),
    beschreibung: bereinige(figur.beschreibung, 400),
    stil: bereinige(figur.stil, 300),
    beispiele, geheimnis,
  }
}
