export const EXPR = Symbol('EXPR');

// operators must be +-*/<>=~!@£#%^&|`?:

/* example of operators
const baseOperators = [
  {
    name: 'negation',
    pattern: ['!', EXPR],
  },
  {
    name: 'addition',
    pattern: [EXPR, '+', EXPR],
  },
  {
    name: 'ternary',
    pattern: [EXPR, '?', EXPR, ':', EXPR],
  },
];
*/

export interface Operator {
  name: string;
  pattern: (symbol | string)[];
}

export interface RankedOperator extends Operator {
  rank: number;
}

export function getOperatorLookup(
  operators: Operator[]
): Map<string, RankedOperator> {
  return operators.reduce((acc, item, idx) => {
    for (const token of item.pattern) {
      if (token === EXPR) continue;

      acc.set(token, { ...item, rank: idx });
    }
    return acc;
  }, new Map());
}
