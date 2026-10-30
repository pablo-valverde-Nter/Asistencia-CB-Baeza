const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// appendRow/updateRow (crearJugador, actualizarPerfil, bienvenida…) escriben solo columnas de SCHEMA;
// todas deben existir en supabase/schema.sql o PostgREST rechaza el guardado.
test('SCHEMA de Schema.gs coincide con las columnas de supabase/schema.sql', () => {
  const context = vm.createContext({});
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, '../src/Schema.gs'), 'utf8')}\nthis.SCHEMA = SCHEMA;`, context);
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8');
  const tablas = {};
  for (const [, tabla, cuerpo] of sql.matchAll(/CREATE TABLE IF NOT EXISTS public\."(\w+)" \(([\s\S]*?)\n\);/g)) {
    tablas[tabla] = [...cuerpo.matchAll(/^\s*"(\w+)"/gm)].map(m => m[1]).sort();
  }
  for (const [tabla, columnas] of Object.entries(context.SCHEMA)) {
    assert.deepEqual([...columnas].sort(), tablas[tabla], tabla);
  }
});
