import buildParser, {Query} from 'arql-parser';
import opResolver from 'arql-op-resolver';
import contextualise, { ContextualisedQuery, TransformDef } from 'arql-contextualiser';
import { getOperatorLookup } from 'arql-operations';
import models from './models.js';
import delegator from 'arql-delegator';

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
  }
].map((o) => ({ ...o, type: 'transformdef' }));

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

const updateNameFamily2 = `
  u: users
    | filter(id = $1)
    | sort.desc(id) { name }
  -> u2: users | filter(u2.name = u.id) {
    idplus: id + $1
  }
`;

const t = `(u: users) {name} -> (u2: users) | filter(u2.name = u.id);`;

const multiModel = `
  (
    u: users,
    o: orders,
  ) | join(o.userId = u.id) {
    username: u.name,
    ordername: o.name,
  }
`;

let ast = run.query(multiModel);
const contextualised = contextualise(ast, models, transforms);
const delegated: any = delegator(contextualised);
//const arg = contextualised.to?.transforms?.[0]?.args?.[0];
//if (arg?.type === 'exprtree')
//  console.log(arg.args[0]);
export default delegated;
