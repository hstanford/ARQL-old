import { Native, DataModel } from 'arql';
import { native as nativeConfigurer } from './configuration.js';

const mainDb = new Native({
  users: [{ id: 1, name: 'hello' }],
  elephants: [
    { id: 1, age: 42 },
    { id: 2, age: 39 },
  ],
  tigers: [
    { id: 1, tag: 'A', elephantId: 2 },
    { id: 2, tag: 'B', elephantId: 1 },
    { id: 3, tag: 'C', elephantId: 2 },
  ],
});
nativeConfigurer(mainDb);

const secondaryDb = new Native({
  orders: [{ id: 1, userId: 1, name: 'foo', stuff: new Date() }],
});
nativeConfigurer(secondaryDb);

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
  ],
};

export const tigers: DataModel = {
  type: 'datamodel',
  name: 'tigers',
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
      source: mainDb,
    },
    {
      type: 'datafield',
      name: 'elephantId',
      datatype: 'number',
      source: mainDb,
    },
    {
      type: 'datafield',
      name: 'tag',
      datatype: 'string',
      source: mainDb,
    },
  ],
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
selfReference(elephants);
selfReference(tigers);
mainDb.add(users);
mainDb.add(elephants);
mainDb.add(tigers);
secondaryDb.add(orders);

export default new Map([
  ['users', users],
  ['orders', orders],
  ['elephants', elephants],
  ['tigers', tigers],
]);
