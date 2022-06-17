import type { ModelsDeclarationTypes } from 'arql';

export const Models = {
  elephants: {
    id: {
      type: 'datafield',
      datatype: 'number',
    },
    age: {
      type: 'datafield',
      datatype: 'number',
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
      join: (self: string, other: string) => `| filter(${self}.id = ${other}.userId)`,
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
      join: (self: string, other: string) => `| filter(${self}.userId = ${other}.id) | first()`,
    },
  },
} as const;


export type ModelsTypes = ModelsDeclarationTypes<typeof Models>;