// API-Schluessel aus der macOS-Keychain (derselbe Eintrag wie bei Jarvis), sonst aus der
// Umgebung. Der Schluessel wird nie geloggt und nie an den Browser geschickt.

import { execFileSync } from 'node:child_process'

export function apiSchluessel() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'anthropic-api-key', '-w'],
      { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    throw new Error('Kein API-Schluessel: Keychain-Eintrag "anthropic-api-key" fehlt und ANTHROPIC_API_KEY ist nicht gesetzt')
  }
}
