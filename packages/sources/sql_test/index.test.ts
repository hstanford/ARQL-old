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
} from 'arql';

import SQL from '@arql/source-sql';

import { Models, ModelsTypes } from './models.js';

import generic from '@arql/stdlib-general';
import applyStdlib from '@arql/stdlib-sql';
import { Sql, TableWithColumns } from 'sql-ts';

type MT<T extends keyof typeof Models> = ModelsTypes[T];
class ExtSQL extends SQL {
  getModel<T extends keyof typeof Models>(key: T): TableWithColumns<MT<T>> {
    const out = this.baseModels.get(key);
    if (!out) throw new Error('Could not find model');
    return out as any;
  }
  setModel<T extends keyof typeof Models>(key: T) {
    type FieldKey = keyof typeof Models[T] & string;
    const columnKeys = Object.keys(Models[key]).filter(function (
      k
    ): k is FieldKey {
      return typeof k === 'string';
    }) as FieldKey[];
    const subDef = Models[key];
    this.baseModels.set(
      key,
      this.sql.define<ModelsTypes[T]>({
        name: key,
        columns: columnKeys.filter(function (k) {
          const val = subDef[k] as any;
          return val.type === 'datafield';
        }),
      })
    );
  }
}

const s = new ExtSQL({
  db: {},
  sql: new Sql(),
  models: [],
  operators: new Map(),
  transforms: new Map(),
});

applyStdlib(s);

(Object.keys(Models) as (keyof typeof Models)[]).forEach((k) => s.setModel(k));

const models: Map<keyof typeof Models, DataModel> = Object.entries(
  Models
).reduce<Map<keyof typeof Models, DataModel>>((acc, [key, value]) => {
  acc.set(key as keyof typeof Models, {
    type: 'datamodel',
    name: key,
    source: s,
    fields: Object.entries(value)
      .filter(([, v]) => v.type === 'datafield')
      .map(([k, v]) => ({
        type: v.type,
        name: k,
        datatype: v.datatype,
        source: s,
      })) as DataField[],
  });
  return acc;
}, new Map());

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
