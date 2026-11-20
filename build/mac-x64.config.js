'use strict';

// Intel-Mac-Build: onnxruntime-node hat keine macOS-x64-Binärdateien.
// Die App nutzt dort automatisch onnxruntime-web (WebAssembly) zum Freistellen.
const base = require('../package.json').build;

module.exports = {
  ...base,
  mac: {
    ...base.mac,
    target: [{ target: 'zip', arch: ['x64'] }],
    files: [...base.mac.files, '!node_modules/onnxruntime-node/**'],
  },
};
