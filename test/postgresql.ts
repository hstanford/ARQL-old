import { Sql, TableWithColumns } from 'sql-ts';
import type { DataModel } from 'arql-contextualiser';
import { DataSource } from 'arql-contextualiser';
const sql = new Sql('postgres');

export default class Pg extends DataSource<TableWithColumns<{ [key: string]: any }>, any> {
  constructor() {
    super();
    this.operators = new Map([
      ['addition', (a, b) => a.plus(b)],
      ['subtraction', (a, b) => a.minus(b)],
      ['negation', (a) => a.isNull()],
      ['equality', (a, b) => a.equals(b)],
      ['ternary', (a, b, c) => a.case([a], [b], c)],
    ]);
    this.transforms = new Map([
      ['filter', () => {}],
      ['sort', () => {}],
    ]);
    this.combinations = new Map([
      [null, () => {}],
      ['?', () => {}],
      ['!', () => {}],
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
