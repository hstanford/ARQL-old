// @ts-nocheck
import mocha from 'mocha';
const { describe, it } = mocha;
import { expect } from 'chai';

import {
  buildParser,
  opResolver,
  contextualise,
  getOperatorLookup,
  delegator,
  Collector,
  DataModel,
  DataField,
  getSourcedModels,
} from 'arql';

import SQL from '@arql/source-sql';

import { Models } from './models.js';

import generic from '@arql/stdlib-general';
import applyStdlib from '@arql/stdlib-sql';
import { Sql } from 'sql-ts';

const s = new SQL({
  db: {},
  sql: new Sql(),
  models: [],
  operators: new Map(),
  transforms: new Map(),
});

applyStdlib(s);

s.setModel('elephants', Models.elephants);
s.setModel('users', Models.users);
s.setModel('orders', Models.orders);

const sourceLookup = {
  elephants: s,
  users: s,
  orders: s,
}

const models = new Map(Object.entries(getSourcedModels(Models, sourceLookup)));

const { transforms, operators } = generic();
const opMap = getOperatorLookup(operators);

// declare this once for multiple parsings
const resolve = opResolver(opMap);

const parser = buildParser(resolve);

const collector = new Collector();
collector.operators = new Map();
collector.transforms = new Map();

async function arql(query: string, params: any[]) {
  console.time(query);
  let ast = parser.query(query);
  const contextualised = contextualise(ast, models, transforms, parser);
  const delegated = delegator(contextualised);
  const data = await collector.run(delegated, params);
  console.timeEnd(query);

  return data;
}

describe('sql', () => {
  it('can resolve a basic query', async () => {
    const out = await arql('users | filter(id = $1) {blah: id + $1}', [1]);
    expect(out).to.deep.equal({
      query:
        'SELECT ("users"."id" + 1) AS "blah" FROM "users" WHERE ("users"."id" = 1)',
    });
  });

  it('can resolve a basic query', async () => {
    const out = await arql(
      '(users, orders) | join(orders.userId = users.id) {ordername: orders.name, username: users.name}',
      []
    );
    expect(out).to.deep.equal({
      query:
        'SELECT "users".*, "users"."name" AS "ordername", "users"."name" AS "username" FROM "users" INNER JOIN "orders" ON ("orders"."userId" = "users"."id")',
    });
  });
});
