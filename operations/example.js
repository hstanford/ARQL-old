import { EXPR, getOperatorLookup } from './index.js';

const operators = [
  {
    name: 'negation',
    pattern: ['!', EXPR],
  },
  {
    name: 'addition',
    pattern: [EXPR, '+', EXPR],
  },
  {
    name: 'equality',
    pattern: [EXPR, '=', EXPR],
  },
  {
    name: 'ternary',
    pattern: [EXPR, '?', EXPR, ':', EXPR],
  },
];

export default getOperatorLookup(operators);
