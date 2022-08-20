import { PickByNotValue } from './util';
export type dataType = 'string' | 'number' | 'boolean' | 'json' | 'date';

export interface BaseDataField {
  type: 'datafield';
  datatype: dataType;
}

export interface BaseDataReference<T> {
  type: 'datareference';
  model: keyof T;
  join: (self: string, other: string) => string;
}

export interface BaseModel<T = any> {
  [key: string]: BaseDataField | BaseDataReference<T>;
}

export type ModelsDeclaration = {
  [key: string]: BaseModel;
};

export type DataTypes = {
  number: number;
  string: string;
  boolean: boolean;
  json: { [key: string]: any };
  date: Date;
};

export type DataTypeDef<
  M extends ModelsDeclaration,
  T extends keyof M,
  U extends M[T],
  V extends keyof U
> = U[V] extends BaseDataField ? U[V]['datatype'] : never;

export type TypeFor<
  M extends ModelsDeclaration,
  T extends keyof M,
  U extends keyof M[T]
> = DataTypes[DataTypeDef<M, T, M[T], U>];

export type ModelType<
  M extends ModelsDeclaration,
  T extends keyof M
> = PickByNotValue<
  {
    [U in keyof M[T]]: TypeFor<M, T, U>;
  },
  never
>;

export type ModelsDeclarationTypes<M extends ModelsDeclaration> = {
  [T in keyof M]: ModelType<M, T>;
};
