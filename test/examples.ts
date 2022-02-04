import buildParser from 'arql-parser';
import opResolver from 'arql-op-resolver';
import contextualise, { TransformDef } from 'arql-contextualiser';
import models from 'arql-models';
import { getOperatorLookup } from 'arql-operations';

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
  }
];

const EXPR = Symbol.for('EXPR');

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

const opMap = getOperatorLookup(operators);

// declare this once for multiple parsings
const resolve = opResolver(opMap);

const run = buildParser(resolve);

const nameFromUsers = 'users {name}';

const updateUsers = `(u: users) {name} -> users`;

const updateNameFamily = `
  (u: users) | filter(id = $1) | sort.desc.foo(u.id) {
    name
  } -> (u2: users) | filter(u2.name = u.id) {
    idplus: id + $1
  }`;

let ast = run(updateNameFamily);
contextualise(ast, models, transforms);
console.log(ast?.from?.transforms?.[1]);
