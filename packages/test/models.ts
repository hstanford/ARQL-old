/**
 * A models/data setup for tests, using multiple
 * native data sources.
 */
import {
  Native,
  DataModel,
  ModelsDeclarationTypes,
  getSourcedModels,
} from 'arql';
import { v4 as uuid } from 'uuid';
import nativeConfigurer from '@arql/stdlib-native';

// implementation-independent declarations

export const models = {
  elephants: {
    id: {
      type: 'datafield',
      datatype: 'number',
    },
    age: {
      type: 'datafield',
      datatype: 'number',
    },
    _id: {
      type: 'datafield',
      datatype: 'string',
    },
  },
  users: {
    id: {
      type: 'datafield',
      datatype: 'number',
    },
    name: {
      type: 'datafield',
      datatype: 'string',
    },
    orders: {
      type: 'datareference',
      model: 'orders',
      join: (self: string, other: string) =>
        `| filter(${self}.id = ${other}.userId)`,
    },
    _id: {
      type: 'datafield',
      datatype: 'string',
    },
  },
  orders: {
    id: {
      type: 'datafield',
      datatype: 'number',
    },
    userId: {
      type: 'datafield',
      datatype: 'number',
    },
    name: {
      type: 'datafield',
      datatype: 'string',
    },
    user: {
      type: 'datareference',
      model: 'users',
      join: (self: string, other: string) =>
        `| filter(${self}.userId = ${other}.id) | first()`,
    },
    _id: {
      type: 'datafield',
      datatype: 'string',
    },
  },
  tigers: {
    id: {
      type: 'datafield',
      datatype: 'number',
    },
    tag: {
      type: 'datafield',
      datatype: 'string',
    },
    elephantId: {
      type: 'datafield',
      datatype: 'number',
    },
    elephant: {
      type: 'datareference',
      model: 'elephants',
      join: (self: string, other: string) =>
        `| filter(${self}.elephantId = ${other}.id)`,
    },
    _id: {
      type: 'datafield',
      datatype: 'string',
    },
  },
} as const;

// Native DB custom setup and seeding

type ModelsTypes = ModelsDeclarationTypes<typeof models>;

const usersData: ModelsTypes['users'][] = [
  { id: 1, name: 'hello', _id: uuid() },
];
const elephantsData: ModelsTypes['elephants'][] = [
  { id: 1, age: 42, _id: uuid() },
  { id: 2, age: 39, _id: uuid() },
];
const tigersData: ModelsTypes['tigers'][] = [
  { id: 1, tag: 'A', elephantId: 2, _id: uuid() },
  { id: 2, tag: 'B', elephantId: 1, _id: uuid() },
  { id: 3, tag: 'C', elephantId: 2, _id: uuid() },
];
const ordersData: ModelsTypes['orders'][] = [
  { id: 1, userId: 1, name: 'foo', /*stuff: new Date(),*/ _id: uuid() },
];

const mainDb = new Native({
  users: usersData,
  elephants: elephantsData,
  tigers: tigersData,
});
nativeConfigurer(mainDb);

const secondaryDb = new Native({ orders: ordersData });
nativeConfigurer(secondaryDb);

// implementation-independent declarations

const sourceLookup = {
  users: mainDb,
  orders: secondaryDb,
  elephants: mainDb,
  tigers: mainDb,
} as const;

const sourcedModels = getSourcedModels(models, sourceLookup);

export const elephants: DataModel = sourcedModels['elephants'];
export const tigers: DataModel = sourcedModels['tigers'];
export const users: DataModel = sourcedModels['users'];
export const orders: DataModel = sourcedModels['orders'];

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
