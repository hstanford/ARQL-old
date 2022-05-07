/**
 * A models/data setup for tests, using multiple
 * native data sources.
 */
import { Native, DataModel } from 'arql';
import { v4 as uuid } from 'uuid';
import picoConfigurer from '@arql/stdlib-picodb';
import Pico from './index.js';
 
import PicoDb from 'picodb';

export const mainDb = new Pico({db: (PicoDb as any)(), operators: new Map(), transforms: new Map() });
picoConfigurer(mainDb);

function selfReference(model: DataModel) {
  for (const field of model.fields) {
    field.model = model;
  }
}

export const items: DataModel = {
  type: 'datamodel',
  name: 'items',
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
  ],
};

selfReference(items);
mainDb.add(items);

export default new Map([
  ['items', items],
]);
 