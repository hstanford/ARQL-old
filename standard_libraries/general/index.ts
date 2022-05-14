import type { TransformDef } from 'arql';

const EXPR = Symbol.for('EXPR');

function prefixUnary(symbol: string) {
  return [symbol, EXPR];
}

function postfixUnary(symbol: string) {
  return [EXPR, symbol];
}

function binary(symbol: string) {
  return [EXPR, symbol, EXPR];
}

function ternary(symbol1: string, symbol2: string) {
  return [EXPR, symbol1, EXPR, symbol2, EXPR];
}

// this configuration applies to all data sources:
// postgres, native js, etc
export default function generic() {
  const transforms: TransformDef[] = [
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
    }
  ].map((o) => ({ ...o, type: 'transformdef' }));

  const operators = [
    {
      name: 'negation',
      pattern: prefixUnary('!'),
    },
    {
      name: '+',
      pattern: binary('+'),
    },
    {
      name: '-',
      pattern: binary('-'),
    },
    {
      name: 'equality',
      pattern: binary('='),
    },
    {
      name: 'ternary',
      pattern: ternary('?', ':'),
    },
    {
      name: 'notEquals',
      pattern: binary('!='),
    },
    {
      name: 'gt',
      pattern: binary('>'),
    },
    {
      name: 'lt',
      pattern: binary('<'),
    },
    {
      name: 'gte',
      pattern: binary('>='),
    },
    {
      name: 'lte',
      pattern: binary('<='),
    },
    {
      name: 'in',
      pattern: binary('<@'),
    },
    {
      name: 'notIn',
      pattern: binary('!<@'),
    },
  ];
  return {
    transforms,
    operators,
  };
}
