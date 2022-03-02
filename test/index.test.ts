import mocha from 'mocha';
const { describe, it } = mocha;
import { expect } from 'chai';

import buildParser, { Query, ExprTree } from 'arql-parser';
import opResolver from 'arql-op-resolver';
import contextualise, {
  ContextualisedExpr,
  ContextualisedQuery,
  TransformDef,
} from 'arql-contextualiser';
import { getOperatorLookup } from 'arql-operations';
import models from './models.js';
import delegator from 'arql-delegator';
//import Resolver from 'arql-resolver-native';
import Collector from 'arql-collector';

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

const collector = new Collector();

describe('can retrieve a join and a reshaping', () => {
  it('Basic name from users', async () => {
    console.time('b');
    let ast = run.query('users {name}');
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, []);
    console.timeEnd('b');

    expect(data).to.deep.equal([{ name: 'hello' }]);
  });

  it('Basic aliased name from users', async () => {
    console.time('c');
    let ast = run.query('users {foo: name}');
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, []);
    console.timeEnd('c');

    expect(data).to.deep.equal([{ foo: 'hello' }]);
  });

  it('Join and reshaping', async () => {
    console.time('a');
    let ast = run.query(`
    (
      u: users,
      o: orders,
    ) | join(o.userId = u.id) {
      username: u.name,
      ordername: o.name,
    }
    `);
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, []);
    console.timeEnd('a');

    expect(data).to.deep.equal([{ username: 'hello', ordername: 'foo' }]);
  });

  it('Basic filtering', async () => {
    console.time('d');
    let ast = run.query(`
      elephants | filter(age = $1)
    `);
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, [39]);
    console.timeEnd('d');

    expect(data).to.deep.equal([{ id: 2, age: 39 }]);
  });
});
