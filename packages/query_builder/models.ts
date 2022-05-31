import type { BaseDataField, DataTypes } from 'arql';

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
    },
  },
} as const;

type PickByNotValue<T, ValueType> = Pick<
  T,
  { [Key in keyof T]-?: T[Key] extends ValueType ? never : Key }[keyof T]
>;

type DataTypeDef<
  T extends keyof typeof Models,
  U extends typeof Models[T],
  V extends keyof U
> = U[V] extends BaseDataField ? U[V]['datatype'] : never;

type TypeFor<
  T extends keyof typeof Models,
  U extends keyof typeof Models[T]
> = DataTypes[DataTypeDef<T, typeof Models[T], U>];

type ModelType<T extends keyof typeof Models> = PickByNotValue<
  {
    [U in keyof typeof Models[T]]: TypeFor<T, U>;
  },
  never
>;

export type ModelsTypes = {
  [T in keyof typeof Models]: ModelType<T>;
};
