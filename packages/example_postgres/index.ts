import { arql } from './arql.js';

async function run() {
  const out = await arql('', []);
  console.log(out);
  process.exit();
}

run();