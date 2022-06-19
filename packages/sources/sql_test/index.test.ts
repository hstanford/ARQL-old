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
  getSourcedModels,
} from '@arql/core';

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
};

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
        'SELECT "orders"."name" AS "ordername", "users"."name" AS "username" FROM (SELECT "users"."id", "users"."name" FROM "users") "users" INNER JOIN (SELECT "orders"."id", "orders"."userId", "orders"."name" FROM "orders") "orders" ON ("orders"."userId" = "users"."id")',
    });
  });
});

describe('basic sql tests', () => {
  it('Basic name from users', async () => {
    const data = await arql('users {name}', []);

    expect(data).to.deep.equal({ query: 'SELECT "users"."name" FROM "users"' });
  });

  it('Basic aliased name from users', async () => {
    const data = await arql('users {foo: name}', []);

    expect(data).to.deep.equal({
      query: 'SELECT "users"."name" AS "foo" FROM "users"',
    });
  });

  it('Join and reshaping', async () => {
    const data = await arql(
      `
    (
      u: users,
      o: orders,
    ) | join(o.userId = u.id) {
      username: u.name,
      ordername: o.name,
    }
    `,
      []
    );

    expect(data).to.deep.equal({
      query:
        'SELECT "users"."name" AS "username", "orders"."name" AS "ordername" FROM (SELECT "users"."id", "users"."name" FROM "users") "users" INNER JOIN (SELECT "orders"."id", "orders"."userId", "orders"."name" FROM "orders") "orders" ON ("orders"."userId" = "users"."id")',
    });
  });

  it('Basic filtering', async () => {
    const data = await arql(
      `
      elephants | filter(age = $1)
    `,
      [39]
    );

    expect(data).to.deep.equal({
      query:
        'SELECT "elephants"."id", "elephants"."age" FROM "elephants" WHERE ("elephants"."age" = 39)',
    });
  });

  it('Basic reshaping with no aliasing', async () => {
    const data = await arql(
      `
      elephants { elephantAge: age }
    `,
      [39]
    );

    expect(data).to.deep.equal({
      query: 'SELECT "elephants"."age" AS "elephantAge" FROM "elephants"',
    });
  });

  it('Basic sort with modifier', async () => {
    const data = await arql(
      `
      elephants | sort.desc(age) { age }
    `,
      []
    );

    expect(data).to.deep.equal({
      query:
        'SELECT "elephants"."age" FROM "elephants" ORDER BY "elephants"."age" DESC',
    });
  });

  it('Basic sort with opposite modifier', async () => {
    const data = await arql(
      `
      elephants | sort.asc(age) { age }
    `,
      []
    );

    // default sort direction is asc
    expect(data).to.deep.equal({
      query:
        'SELECT "elephants"."age" FROM "elephants" ORDER BY "elephants"."age"',
    });
  });

  it('Join in shape', async () => {
    const data = await arql(
      `
      u: users {
        id,
        orders | filter(u.id = orders.userId) {
          name
        }
      }
    `,
      []
    );

    expect(data).to.deep.equal({
      query:
        'SELECT "users"."id", (SELECT ROW_TO_JSON(ROW("orders"."name")) FROM "orders" WHERE ("users"."id" = "orders"."userId")) "orders" FROM "users"',
    });
  });

  it('param in shape', async () => {
    const data = await arql(
      `
      users {id: $1}
    `,
      ['hi']
    );

    expect(data).to.deep.equal({ query: 'SELECT \'hi\' AS "id" FROM "users"' });
  });

  it('expr in shape', async () => {
    const data = await arql(
      `
      users {id: id + $1,}
    `,
      [1]
    );

    expect(data).to.deep.equal({
      query: 'SELECT ("users"."id" + 1) AS "id" FROM "users"',
    });
  });

  it('model in shape', async () => {
    const data = await arql(
      `
      users {elephants}
    `,
      []
    );

    expect(data).to.deep.equal({
      query:
        'SELECT (SELECT ROW_TO_JSON("elephants") FROM "elephants") "elephants" FROM "users"',
    });
  });

  it('aliased model in shape', async () => {
    const data = await arql(
      `
      users {blah: elephants}
    `,
      []
    );

    expect(data).to.deep.equal({
      query:
        'SELECT (SELECT ROW_TO_JSON("elephants") FROM "elephants") "blah" FROM "users"',
    });
  });

  it('filtered model in shape conforms to filter', async () => {
    const data = await arql(
      `
      users {elephants | filter(elephants.id = users.id)}
    `,
      []
    );

    expect(data).to.deep.equal({
      query:
        'SELECT (SELECT ROW_TO_JSON(ROW("elephants"."id", "elephants"."age")) FROM "elephants" WHERE ("elephants"."id" = "users"."id")) "elephants" FROM "users"',
    });
  });
});
