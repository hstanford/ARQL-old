export type Dictionary<T = any> = { [key: string]: T };
export type AnyObj = Dictionary;

export type PickByNotValue<T, ValueType> = Pick<
  T,
  { [Key in keyof T]-?: T[Key] extends ValueType ? never : Key }[keyof T]
>;
