// Los catálogos se cargan en ejecución; tsc ya no los analiza ni los copia por importación.
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const destino = path.join(raiz, 'dist/data');
const catalogos = ['cums_catalogo.json', 'cie10_catalogo.json', 'ciuo_ocupaciones.json'];

fs.mkdirSync(destino, { recursive: true });
for (const archivo of catalogos) {
  fs.copyFileSync(path.join(raiz, 'src/data', archivo), path.join(destino, archivo));
}
console.log(`Catálogos copiados a dist/data: ${catalogos.length}`);
