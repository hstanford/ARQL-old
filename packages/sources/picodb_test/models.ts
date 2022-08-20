/**
 * A models/data setup for tests, using multiple
 * native data sources.
 */
import { DataModel, DataField } from '@arql/types';
import picoConfigurer from '@arql/stdlib-picodb';
import Pico from '@arql/source-picodb';

import PicoDb from 'picodb';

export const mainDb = new Pico({
  db: (PicoDb as any)(),
});
picoConfigurer(mainDb);

function selfReference(model: DataModel) {
  for (const field of model.fields) {
    field.model = model;
  }
}

export const items = new DataModel({
  name: 'items',
  source: mainDb,
  fields: [
    {
      type: 'datafield',
      name: 'count',
      datatype: 'number',
      source: mainDb,
    },
    {
      type: 'datafield',
      name: 'name',
      datatype: 'string',
      source: mainDb,
    },
  ].map(
    (f: { [key: string]: any }) =>
      ({
        ...f,
        source: f.source || mainDb,
      } as unknown as DataField)
  ),
});

selfReference(items);
mainDb.add(items);

export default new Map([['items', items]]);
