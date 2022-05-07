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
} from 'arql';

import models, { mainDb } from './models.js';
import { generic, native as nativeConfigurer } from './example.js';

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
  const contextualised = contextualise(ast, models, transforms);
  const delegated = delegator(contextualised);
  const data = await collector.run(delegated, params);
  console.timeEnd(query);

  return data;
}

describe('picodb', () => {
  it('can resolve a basic query', async () => {
    await mainDb.db.insertMany([
      { count: 8, name: 'yo' },
      { count: 1, name: 'ha' },
      { count: 10, name: 'boo' },
    ]);
    const out = await arql('items | filter(count > $1) {name}', [7]);
    expect(out).to.deep.equal([{name: 'yo'}, {name: 'boo'}]);
  });
});
