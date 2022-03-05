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
} from 'arql';

import models from './models.js';
import { generic, native as nativeConfigurer } from './configuration.js';

const { transforms, operators } = generic();
const opMap = getOperatorLookup(operators);

// declare this once for multiple parsings
const resolve = opResolver(opMap);

const parser = buildParser(resolve);

const collector = new Collector();
nativeConfigurer(collector);

describe('can retrieve a join and a reshaping', () => {
  it('Basic name from users', async () => {
    console.time('a');
    let ast = parser.query('users {name}');
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, []);
    console.timeEnd('a');

    expect(data).to.deep.equal([{ name: 'hello' }]);
  });

  it('Basic aliased name from users', async () => {
    console.time('b');
    let ast = parser.query('users {foo: name}');
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, []);
    console.timeEnd('b');

    expect(data).to.deep.equal([{ foo: 'hello' }]);
  });

  it('Join and reshaping', async () => {
    console.time('c');
    let ast = parser.query(`
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
    console.timeEnd('c');

    expect(data).to.deep.equal([{ username: 'hello', ordername: 'foo' }]);
  });

  it('Basic filtering', async () => {
    console.time('d');
    let ast = parser.query(`
      elephants | filter(age = $1)
    `);
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, [39]);
    console.timeEnd('d');

    expect(data).to.deep.equal([{ id: 2, age: 39 }]);
  });

  it('Basic reshaping with no aliasing', async () => {
    console.time('e');
    let ast = parser.query(`
      elephants { elephantAge: age }
    `);
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, [39]);
    console.timeEnd('e');

    expect(data).to.deep.equal([{ elephantAge: 42 }, { elephantAge: 39 }]);
  });

  it('Basic sort with modifier', async () => {
    console.time('f');
    let ast = parser.query(`
      elephants | sort.desc(age) { age }
    `);
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, []);
    console.timeEnd('f');

    expect(data).to.deep.equal([{ age: 42 }, { age: 39 }]);
  });

  it('Basic sort with opposite modifier', async () => {
    console.time('g');
    let ast = parser.query(`
      elephants | sort.asc(age) { age }
    `);
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, []);
    console.timeEnd('g');

    expect(data).to.deep.equal([{ age: 39 }, { age: 42 }]);
  });

  it('Join in shape', async () => {
    console.time('h');
    let ast = parser.query(`
      u: users {
        id,
        orders | filter(u.id = orders.userId) {
          name
        }
      }
    `);
    const contextualised = contextualise(ast, models, transforms);
    const delegated = delegator(contextualised);
    const data = await collector.run(delegated, []);
    console.timeEnd('h');

    expect(data).to.deep.equal([{ id: 1, orders: [{name: 'foo'}] }]);
  });
});
