import type { TransformDef } from 'arql';

const EXPR = Symbol.for('EXPR');

const operationTypes = {
  prefixUnary: (symbol: string) => [symbol, EXPR],
  postfixUnary: (symbol: string) => [EXPR, symbol],
  binary: (symbol: string) => [EXPR, symbol, EXPR],
  ternary: (symbol1: string, symbol2: string) => [
    EXPR,
    symbol1,
    EXPR,
    symbol2,
    EXPR,
  ],
};

export const transforms = [
  {
    name: 'filter',
    modifiers: [],
    nArgs: 1,
  },
  {
    name: 'sort',
    modifiers: ['desc', 'asc', 'nullsFirst', 'nullsLast'],
    nArgs: '1+',
  },
  {
    name: 'join',
    modifiers: [],
    nArgs: 1,
  },
  {
    name: 'first',
    modifiers: [],
    nArgs: 0,
  },
  {
    name: 'group',
    modifiers: [],
    nArgs: '1+',
  },
  {
    name: 'count',
    modifiers: [],
    nArgs: 0,
  },
  {
    name: 'array',
    modifiers: [],
    nArgs: 1,
  },
  {
    name: 'uniq',
    modifiers: [],
    nArgs: 0,
  },
] as const;

export const operators = [
  {
    name: 'negation',
    symbols: ['!'],
    type: 'prefixUnary',
  },
  {
    name: 'add',
    symbols: ['+'],
    type: 'binary',
  },
  {
    name: 'minus',
    symbols: ['-'],
    type: 'binary',
  },
  {
    name: 'equals',
    symbols: ['='],
    type: 'binary',
  },
  {
    name: 'ternary',
    symbols: ['?', ':'],
    type: 'ternary',
  },
  {
    name: 'notEquals',
    symbols: ['!='],
    type: 'binary',
  },
  {
    name: 'gt',
    symbols: ['>'],
    type: 'binary',
  },
  {
    name: 'lt',
    symbols: ['<'],
    type: 'binary',
  },
  {
    name: 'gte',
    symbols: ['>='],
    type: 'binary',
  },
  {
    name: 'lte',
    symbols: ['<='],
    type: 'binary',
  },
  {
    name: 'in',
    symbols: ['<@'],
    type: 'binary',
  },
  {
    name: 'notIn',
    symbols: ['!<@'],
    type: 'binary',
  },
] as const;

// this configuration applies to all data sources:
// postgres, native js, etc
export default function generic() {
  return {
    transforms: transforms.map((o) => ({
      ...o,
      type: 'transformdef',
    })) as any as TransformDef[],
    operators: operators.map((o) => ({
      name: o.name,
      pattern: (
        operationTypes[o.type] as (...args: string[]) => (symbol | string)[]
      ).apply(null, o.symbols as any),
    })),
  };
}
