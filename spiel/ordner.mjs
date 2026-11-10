// Datenordner von Nachsitzen: XDG_DATA_HOME, unter Windows %LOCALAPPDATA%, sonst ~/.local/share.
// Darin liegen kosten.json und der Ordner hefte/.

import path from 'node:path'
import os from 'node:os'

export function standardOrdner({ plattform = process.platform, env = process.env, heim = os.homedir() } = {}) {
  let basis
  if (env.XDG_DATA_HOME) basis = env.XDG_DATA_HOME
  else if (plattform === 'win32') basis = env.LOCALAPPDATA || path.join(heim, 'AppData', 'Local')
  else basis = path.join(heim, '.local', 'share')
  return path.join(basis, 'nachsitzen')
}
