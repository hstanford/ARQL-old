import { operators } from '@arql/stdlib-general';

type ArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

const operatorNames = operators.map((o) => o.name);
const operatorTypes = operators.map((o) => o.type);
const operatorSymbols = operators.map((o) => o.symbols);
type OperatorNames = ArrayElement<typeof operatorNames>;
type OperatorTypes = ArrayElement<typeof operatorTypes>;
type OperatorSymbols = ArrayElement<typeof operatorSymbols>;
type OperatorFunction = (...otherVals: any[]) => Expression;
type OperatorsType = Record<
  ArrayElement<typeof operatorNames>,
  OperatorFunction
>;

export const Operators = operators.reduce<Partial<OperatorsType>>((acc, op) => {
  acc[op.name] = function (...otherVals: any[]) {
    return {
      ops: op.symbols,
      args: [this, ...otherVals],
      type: op.type,
    };
  };
  return acc;
}, {}) as OperatorsType;

type FieldType = {
  [k in OperatorNames]: OperatorFunction;
};

type BaseFieldType = {
  _name: string;
  _datatype: string;
  _model: string;
};

export type Field = BaseFieldType & FieldType;

export function isField(ipt: any): ipt is Field {
  return ipt?._type !== 'model' && !!ipt?._name;
}

type Model<T> = {
  _type: 'model';
  _name: string;
} & FieldMap<T>;

export function isModel(ipt: any): ipt is Model<any> {
  return ipt?._type === 'model';
}

interface Transform {
  name: string;
  args: any[];
}

export interface Expression {
  ops: OperatorSymbols;
  args: (Expression | Field)[];
  type: OperatorTypes;
}

export function isExpression(ipt: any): ipt is Expression {
  return !!(ipt?.ops && ipt?.args && ipt?.type);
}

type FieldMap<T> = { [k in keyof T]: Field };
