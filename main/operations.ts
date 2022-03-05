import type { Operator, RankedOperator } from './types.js';
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
