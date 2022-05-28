/**
 * A models/data setup for tests, using multiple
 * native data sources.
 */
import { Native, DataModel } from 'arql';
import { v4 as uuid } from 'uuid';
import nativeConfigurer from '@arql/stdlib-native';

const mainDb = new Native({
  users: [{ id: 1, name: 'hello', _id: uuid() }],
  elephants: [
    { id: 1, age: 42, _id: uuid() },
    { id: 2, age: 39, _id: uuid() },
  ],
  tigers: [
    { id: 1, tag: 'A', elephantId: 2, _id: uuid() },
    { id: 2, tag: 'B', elephantId: 1, _id: uuid() },
    { id: 3, tag: 'C', elephantId: 2, _id: uuid() },
  ],
});
nativeConfigurer(mainDb);

const secondaryDb = new Native({
  orders: [{ id: 1, userId: 1, name: 'foo', stuff: new Date(), _id: uuid() }],
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
  source: mainDb,
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
    },
    {
      type: 'datafield',
      name: 'age',
      datatype: 'number',
    },
  ].map((f: any) => ((f.source = f.source || mainDb), f)),
};

export const tigers: DataModel = {
  type: 'datamodel',
  name: 'tigers',
  source: mainDb,
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
    },
    {
      type: 'datafield',
      name: 'elephantId',
      datatype: 'number',
    },
    {
      type: 'datafield',
      name: 'tag',
      datatype: 'string',
    },
    {
      type: 'datareference',
      name: 'elephant',
      other: elephants,
      join: (self: string, other: string) =>
        `| filter(${self}.elephantId = ${other}.id)`,
    },
  ].map((f: any) => ((f.source = f.source || mainDb), f)),
};

export const users: DataModel = {
  type: 'datamodel',
  name: 'users',
  source: mainDb,
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
    },
    {
      type: 'datafield',
      name: 'name',
      datatype: 'string',
    },
    {
      type: 'datareference',
      name: 'orders',
      join: (self: string, other: string) =>
        `| filter(${self}.id = ${other}.userId)`,
      get other() {
        return orders;
      },
    },
  ].map((f: any) => ((f.source = f.source || mainDb), f)),
};

export const orders: DataModel = {
  type: 'datamodel',
  name: 'orders',
  source: secondaryDb,
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
    },
    {
      type: 'datafield',
      name: 'userId',
      datatype: 'number',
    },
    {
      type: 'datafield',
      name: 'name',
      datatype: 'string',
    },
    {
      type: 'datareference',
      name: 'user',
      join: (self: string, other: string) =>
        `| filter(${self}.userId = ${other}.id) | first()`,
      other: users,
    },
  ].map((f: any) => ((f.source = f.source || secondaryDb), f)),
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
