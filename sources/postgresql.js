import { Sql } from 'sql-ts';
const sql = new Sql('postgres');

export class Pg {
  constructor () {
    this.models = new Map();
    this.operators = new Map([
      ['addition', (a, b) => a.plus(b)],
      ['subtraction', (a, b) => a.minus(b)],
      ['negation', (a) => a.isNull()],
      ['equality', (a, b) => a.equals(b)],
      ['ternary', (a, b, c) => a.case([a], [b], c)],
    ]);
  }

  add (def) {
    const model = sql.define({
      name: def.name,
      columns: Object.keys(def.fields),
    });

    this.models.set(def.name, model);
  }

  resolveField (modelName, fieldName, ...parts) {
    if (parts.length) console.log('Not yet supported');
    // TODO: error handling
    return this.models.get(modelName)[fieldName];
  }
};
