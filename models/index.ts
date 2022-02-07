import { postgresql } from 'arql-sources';
import type { DataModel } from 'arql-contextualiser';

const mainDb = postgresql();
const secondaryDb = postgresql();

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

export const orders: DataModel = {
  type: 'datamodel',
  name: 'orders',
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
      source: secondaryDb,
    },
    {
      type: 'datafield',
      name: 'userId',
      datatype: 'number',
      source: secondaryDb,
    },
    {
      type: 'datafield',
      name: 'name',
      datatype: 'string',
      source: secondaryDb,
    },
  ]
};

selfReference(users);
selfReference(orders);
mainDb.add(users);
secondaryDb.add(orders);

export default (new Map([['users', users], ['orders', orders]]));
