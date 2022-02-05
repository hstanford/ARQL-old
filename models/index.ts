import { postgresql } from 'arql-sources';
import type { DataModel } from 'arql-contextualiser';

const mainDb = postgresql();

function selfReference (model: DataModel) {
  for (const field of model.fields) {
    field.model = model;
  }
}

export const users: DataModel = {
  type: 'datamodel',
  name: 'users',
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
      source: mainDb,
    },
    {
      type: 'datafield',
      name: 'name',
      datatype: 'string',
      source: mainDb,
    }
  ],
};

selfReference(users);
mainDb.add(users);

export default (new Map([['users', users]]));
