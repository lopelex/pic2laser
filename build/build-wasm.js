'use strict';

/**
 * Baut die WebAssembly-Module (Rust, wasm32-unknown-unknown) und bettet sie als Base64 in
 * src/renderer/wasm/<name>-wasm.js ein. Die erzeugten Dateien liegen im Repository, damit
 * „npm start“ und die Releases ohne Rust funktionieren; nur nach Änderungen am Rust-Code nötig:
 *   npm run build:wasm   (braucht cargo und das Ziel wasm32-unknown-unknown)
 * Eingebettet statt als .wasm-Datei, weil die Oberfläche über file:// läuft (dort kein fetch).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const MODULES = [{ name: 'sine', global: 'SINE_WASM_B64' }];

for (const m of MODULES) {
  const dir = path.join(root, 'wasm', m.name);
  execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], { cwd: dir, stdio: 'inherit' });
  const wasm = fs.readFileSync(path.join(dir, 'target', 'wasm32-unknown-unknown', 'release', `${m.name}.wasm`));
  const out = path.join(root, 'src', 'renderer', 'wasm', `${m.name}-wasm.js`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `// Erzeugt von build/build-wasm.js aus wasm/${m.name} – nicht von Hand ändern.\nexport const ${m.global} = '${wasm.toString('base64')}';\n`);
  console.log(`${path.relative(root, out)}: ${(wasm.length / 1024).toFixed(1)} KB WASM`);
}
