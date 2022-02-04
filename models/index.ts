import { postgresql } from 'arql-sources';
import type { DataModel } from 'arql-contextualiser';

const mainDb = postgresql();

function selfReference (model: DataModel) {
  for (const field of model.fields) {
    field.model = model;
  }
}

export const users: DataModel = {
  name: 'users',
  fields: [
    {
      name: 'id',
      type: 'number',
      source: mainDb,
    },
    {
      name: 'name',
      type: 'string',
      source: mainDb,
    }
  ],
};

selfReference(users);
mainDb.add(users);

export default (new Map([['users', users]]));
