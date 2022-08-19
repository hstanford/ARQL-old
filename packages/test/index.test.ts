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
} from '@arql/core';

import models from './models.js';
import generic from '@arql/stdlib-general';
import nativeConfigurer from '@arql/stdlib-native';

const { transforms, operators } = generic();
const opMap = getOperatorLookup(operators);

// declare this once for multiple parsings
const resolve = opResolver(opMap);

const parser = buildParser(resolve);

const collector = new Collector();
nativeConfigurer(collector);

async function arql(query: string, params: any[]) {
  console.time(query);
  let ast = parser.query(query);
  const contextualised = contextualise(ast, models, transforms, parser);
  const delegated = delegator(contextualised);
  const data = await collector.run(delegated, params);
  console.timeEnd(query);

  return data;
}

describe('can retrieve a join and a reshaping', () => {
  it('Basic name from users', async () => {
    const data = await arql('users {name}', []);

    expect(data).to.deep.equal([{ name: 'hello' }]);
  });

  it('Basic aliased name from users', async () => {
    const data = await arql('users {foo: name}', []);

    expect(data).to.deep.equal([{ foo: 'hello' }]);
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

    expect(data).to.deep.equal([{ username: 'hello', ordername: 'foo' }]);
  });

  it('Basic filtering', async () => {
    const data = await arql(
      `
      elephants | filter(age = $1)
    `,
      [39]
    );

    expect(data).to.deep.equal([{ id: 2, age: 39 }]);
  });

  it('Basic reshaping with no aliasing', async () => {
    const data = await arql(
      `
      elephants { elephantAge: age }
    `,
      [39]
    );

    expect(data).to.deep.equal([{ elephantAge: 42 }, { elephantAge: 39 }]);
  });

  it('Basic sort with modifier', async () => {
    const data = await arql(
      `
      elephants | sort.desc(age) { age }
    `,
      []
    );

    expect(data).to.deep.equal([{ age: 42 }, { age: 39 }]);
  });

  it('Basic sort with opposite modifier', async () => {
    const data = await arql(
      `
      elephants | sort.asc(age) { age }
    `,
      []
    );

    expect(data).to.deep.equal([{ age: 39 }, { age: 42 }]);
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

    expect(data).to.deep.equal([{ id: 1, orders: [{ name: 'foo' }] }]);
  });

  it('param in shape', async () => {
    const data = await arql(
      `
      users {id: $1}
    `,
      ['hi']
    );

    expect(data).to.deep.equal([{ id: 'hi' }]);
  });

  it('expr in shape', async () => {
    const data = await arql(
      `
      users {id: id + $1,}
    `,
      [1]
    );

    expect(data).to.deep.equal([{ id: 2 }]);
  });

  it('model in shape', async () => {
    const data = await arql(
      `
      users {elephants}
    `,
      []
    );

    expect(data[0].elephants).to.deep.contain({ id: 2, age: 39 });
    expect(data[0].elephants).to.deep.contain({ id: 1, age: 42 });
  });

  it('filtered model in shape conforms to filter', async () => {
    const data = await arql(
      `
      users {elephants | filter(elephants.id = users.id)}
    `,
      []
    );

    expect(data[0].elephants).to.have.length(1);
    expect(data[0].elephants).to.deep.contain({ id: 1, age: 42 });
  });

  it('handles static data', async () => {
    const data = await arql(
      `
      {
        id: $1
      }
    `,
      [1]
    );

    expect(data).to.deep.equal({ id: 1 });
  });

  it('handles static data inside a shape', async () => {
    const data = await arql(
      `
      {
        stuff: { name: $1 }
      }
    `,
      [1]
    );

    expect(data).to.deep.equal({ stuff: { name: 1 } });
  });

  it('filtered model in shape conforms to filter when the models are from different sources (1)', async () => {
    const data = await arql(
      `
      users {orders | filter(orders.userId = users.id)}
    `,
      []
    );

    expect(data[0].orders).to.have.length(1);
    expect(data[0].orders).to.deep.contain({ id: 1, userId: 1, name: 'foo' });
  });

  it('filtered model in shape conforms to filter when the models are from different sources (2)', async () => {
    const data = await arql(
      `
      users {orders | filter(orders.userId = users.id + $1)}
    `,
      [1]
    );

    expect(data[0].orders).to.have.length(0);
  });

  it('field names in shape default to the underlying field name rather than model name', async () => {
    const data = await arql(
      `
      (
        u: users,
        o: orders
      ) | join(u.id = o.userId) {
        u.id,
        orderId: o.id,
      }
    `,
      []
    );

    expect(data).to.deep.equal([
      {
        id: 1,
        orderId: 1,
      },
    ]);
  });

  it('sort after a filter definitely sorts', async () => {
    const data = await arql(
      `
      (
        e: elephants,
        t: tigers
      ) | join(e.id = t.elephantId) | sort(t.id) {
        e.id,
        tigerId: t.id,
        t.tag,
      }
    `,
      []
    );

    expect(data).to.deep.equal([
      {
        id: 2,
        tigerId: 1,
        tag: 'A',
      },
      {
        id: 1,
        tigerId: 2,
        tag: 'B',
      },
      {
        id: 2,
        tigerId: 3,
        tag: 'C',
      },
    ]);
  });

  it('supports multiple static objects as a source', async () => {
    const data = await arql(
      `
      [
        {
          id: $1,
          name: $2,
        },
        {
          id: $3,
          name: $4
        }
      ]
    `,
      [1, 'foo', 2, 'bar']
    );

    expect(data).to.deep.equal([
      {
        id: 1,
        name: 'foo',
      },
      {
        id: 2,
        name: 'bar',
      },
    ]);
  });

  it('does nice inner shape selects', async () => {
    const data = await arql(
      `users {
      user: {
        name: users.name
      }
    }`,
      []
    );

    expect(data).to.deep.equal([{ user: { name: 'hello' } }]);
  });

  it('supports any type of field in a filter', async () => {
    const data = await arql(
      `(users, elephants) | join(users.id = elephants.id){
      users.id,
      elephants.age,
      orders | filter(orders.id)
    }`,
      []
    );
    expect(data).to.deep.equal([
      {
        id: 1,
        age: 42,
        orders: [
          {
            id: 1,
            name: 'foo',
            userId: 1,
          },
        ],
      },
    ]);
  });

  it('supports relationships', async () => {
    const data = await arql(`u: users {u.id, u.orders {name}}`);
    expect(data).to.deep.equal([
      {
        id: 1,
        orders: [{ name: 'foo' }],
      },
    ]);
  });

  it('supports relationships to lone models', async () => {
    const data = await arql(`orders {id, orders.user {name}}`);
    expect(data).to.deep.equal([
      {
        id: 1,
        user: { name: 'hello' },
      },
    ]);
  });

  it('supports "first" transforms', async () => {
    const data = await arql(`orders | first() {id, name}`);
    expect(data).to.deep.equal({
      id: 1,
      name: 'foo',
    });
  });

  it('supports passing fields from inner shapes', async () => {
    const data = await arql(`(users { id, uname: name }) {uname}`);
    expect(data).to.deep.equal([
      {
        uname: 'hello',
      },
    ]);
  });

  it('supports field switching', async () => {
    const data = await arql(`users {name: id, id: name}`);
    expect(data).to.deep.equal([
      {
        name: 1,
        id: 'hello',
      },
    ]);
  });

  it('supports count aggregations in the aggregation', async () => {
    const data = await arql(`users | group(id, {
      id,
      num: count(id)
    })`);
    expect(data).to.deep.equal([
      {
        id: 1,
        num: 1,
      },
    ]);
  });

  it('supports count aggregations outside the aggregation', async () => {
    const data = await arql(`users | group(id) {
      id,
      num: count(id)
    }`);
    expect(data).to.deep.equal([
      {
        id: 1,
        num: 1,
      },
    ]);
  });

  it('supports union', async () => {
    const data = await arql(`
    (
      users {id, name},
      orders {id, name}
    ) | union {id, name}
    `);
    expect(data).to.deep.equal([
      { id: 1, name: 'hello' },
      { id: 1, name: 'foo' },
    ]);
  });
});

describe('data modification', () => {
  it('can perform a basic insert statement', async () => {
    const data = await arql(
      `
      {id: $1, name: $2} -+ users
    `,
      [2, 'newUser']
    );

    expect(data).to.deep.equal({ id: 2, name: 'newUser' });

    const data2 = await arql('users | filter(id = $1)', [2]);

    expect(data2).to.deep.equal([{ id: 2, name: 'newUser' }]);
  });

  it('can perform a basic delete statement', async () => {
    const data = await arql(
      `
       -x users | filter(id = $1)
    `,
      [2]
    );

    expect(data).to.deep.equal([{ id: 2, name: 'newUser' }]);

    const data2 = await arql('users', []);

    expect(data2).to.deep.equal([{ id: 1, name: 'hello' }]);
  });

  it('can perform a basic update statement', async () => {
    const data = await arql(
      `
      {name: $1} -> users | filter(id = $2)
    `,
      ['blah', 1]
    );

    expect(data).to.deep.equal([{ id: 1, name: 'blah' }]);

    const data2 = await arql('users', []);

    expect(data2).to.deep.equal([{ id: 1, name: 'blah' }]);
  });

  it('can insert from a multi-shape', async () => {
    const data0 = await arql('users', []);
    expect(data0).to.have.length(1);

    const data = await arql(
      `
    [{id: $1, name: $2}, {id: $3, name: $2 + $4}] -+ users
    `,
      [4, 'mctest', 5, '2']
    );

    expect(data).to.deep.equal([
      {
        id: 4,
        name: 'mctest',
      },
      {
        id: 5,
        name: 'mctest2',
      },
    ]);

    const data2 = await arql('users', []);
    expect(data2).to.have.length(3);
  });

  it.skip('can delete from a selection', async () => {
    const data0 = await arql('users', []);
    expect(data0).to.have.length(3);

    const data1 = await arql(
      `
    old: {id: $1} -x users | filter(users.id = old.id)
    `,
      [4]
    );

    const data = await arql('users', []);

    expect(data).to.deep.equal([
      {
        id: 1,
        name: 'blah',
      },
      {
        id: 5,
        name: 'mctest2',
      },
    ]);

    expect(data).to.have.length(2);
  });
});
