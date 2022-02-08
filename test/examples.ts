import buildParser from 'arql-parser';
import opResolver from 'arql-op-resolver';
import contextualise, { TransformDef } from 'arql-contextualiser';
import models from 'arql-models';
import { getOperatorLookup } from 'arql-operations';

const transforms: TransformDef[] = [
  {
    type: 'transformdef',
    name: 'filter',
    modifiers: [],
    nArgs: 1,
  },
  {
    type: 'transformdef',
    name: 'sort',
    modifiers: ['desc', 'asc', 'nullsFirst', 'nullsLast'],
    nArgs: '1+',
  },
];

const EXPR = Symbol.for('EXPR');

const operators = [
  {
    name: 'negation',
    pattern: ['!', EXPR],
  },
  {
    name: '+',
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

const t = `(u: users) {name} -> (u2: users) | filter(u2.name = u.id);`;

const multiModel = `
  (u: users).(o: orders | filter(o.userId = u.id)) { username: users.name, ordername: o.name }
`;

let ast = run(multiModel);
const contextualised = contextualise(ast, models, transforms);
//const arg = contextualised.to?.transforms?.[0]?.args?.[0];
//if (arg?.type === 'exprtree')
//  console.log(arg.args[0]);
export default contextualised;
