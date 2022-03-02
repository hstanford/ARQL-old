import Native from 'arql-resolver-native';
import type { DataModel } from 'arql-contextualiser';

const mainDb = new Native({
  users: [{ id: 1, name: 'hello' }],
  elephants: [{ id: 1, age: 42 }, { id: 2, age: 39 }]
});
const secondaryDb = new Native({
  orders: [{ id: 1, userId: 1, name: 'foo', stuff: new Date() }],
});

function selfReference(model: DataModel) {
  for (const field of model.fields) {
    field.model = model;
  }
}

export const elephants: DataModel = {
  type: 'datamodel',
  name: 'elephants',
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
      source: mainDb,
    },
    {
      type: 'datafield',
      name: 'age',
      datatype: 'number',
      source: mainDb,
    },
  ]
};

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
    },
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
  ],
};

selfReference(users);
selfReference(orders);
mainDb.add(users);
secondaryDb.add(orders);

export default new Map([
  ['users', users],
  ['orders', orders],
  ['elephants', elephants],
]);
