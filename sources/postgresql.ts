import { Sql, TableWithColumns } from 'sql-ts';
import type { DataModel } from 'arql-contextualiser';
const sql = new Sql('postgres');

type operatorOp = (...args: any[]) => any;

export class Pg<T> {
  models: Map<string, TableWithColumns<{ [key: string]: any }>>;
  operators: Map<string, operatorOp>;
  constructor() {
    this.models = new Map();
    this.operators = new Map([
      ['addition', (a, b) => a.plus(b)],
      ['subtraction', (a, b) => a.minus(b)],
      ['negation', (a) => a.isNull()],
      ['equality', (a, b) => a.equals(b)],
      ['ternary', (a, b, c) => a.case([a], [b], c)],
    ]);
  }

  add(def: DataModel) {
    const model = sql.define<{ [key: string]: any }>({
      name: def.name,
      columns: Object.keys(def.fields),
    });

    this.models.set(def.name, model);
  }

  resolveField(modelName: string, fieldName: string, ...parts: any[]): any {
    if (parts.length) console.log('Not yet supported');
    // TODO: error handling
    const model = this.models.get(modelName);
    let field: any;
    if (model && fieldName in model) field = model[fieldName] as any;
    return model && model[fieldName];
  }
}
