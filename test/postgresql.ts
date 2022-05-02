import { Sql, TableWithColumns } from 'sql-ts';
import type {
  ContextualisedQuery,
  ContextualisedSource,
  DataModel,
} from 'arql';
import { DataSource } from 'arql';
const sql = new Sql('postgres');

export default class Pg extends DataSource<
  TableWithColumns<{ [key: string]: any }>,
  any
> {
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
  }

  add(def: DataModel) {
    const model = sql.define<{ [key: string]: any }>({
      name: def.name,
      columns: Object.keys(def.fields),
    });

    this.models.set(def.name, model);
  }

  resolveField(modelName: string, fieldName: string, ...parts: any[]): any {
    if (parts.length) throw new Error('Not yet supported');
    // TODO: error handling
    const model = this.models.get(modelName);
    let field: any;
    if (model && fieldName in model) field = model[fieldName] as any;
    return model && model[fieldName];
  }

  async resolve(ast: ContextualisedQuery | ContextualisedSource) {
    if ((ast as any).name === 'o')
      return [{ id: 1, userId: 1, name: 'foo', stuff: new Date() }];
    return [{ id: 1, name: 'hello' }];
  }
}
