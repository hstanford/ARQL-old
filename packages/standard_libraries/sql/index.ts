import { ContextualisedField, AnyObj, DataSource, getAlias } from '@arql/core';
import { Sql } from 'sql-ts';
//import { Knex } from 'knex';

// TODO: make this better
function getKey(...values: any[]) {
  return JSON.stringify(
    values.map((value) =>
      typeof value === 'object' ? JSON.stringify(value) : value
    )
  );
}

export default function sql(source: DataSource<any, any>) {
  // basic sql operators
  source.operators = new Map([
    [
      'addition',
      (a, b) => {
        return a.plus(b);
      },
    ],
    ['subtraction', (a, b) => a.minus(b)],
    ['negation', (a) => new Sql().function('NOT')(a)],
    ['ternary', (a, b, c) => a.case([a], [b], c)],
    [
      'add',
      (a, b) => {
        return a.plus(b);
      },
    ],
    ['minus', (a, b) => a.minus(b)],
    ['notEquals', (a, b) => a.notEquals(b)],
    [
      'equals',
      (a, b) => {
        return a.equals(b);
      },
    ],
    ['gt', (a, b) => a.gt(b)],
    ['lt', (a, b) => a.lt(b)],
    ['gte', (a, b) => a.gte(b)],
    ['lte', (a, b) => a.lte(b)],
    ['in', (a, b) => a.in(b)],
    ['notIn', (a, b) => a.notIn(b)],
    ['and', (a, b) => a.and(b)],
    ['or', (a, b) => a.or(b)],
  ]);

  // transform definitions:
  // transforms that follow a sourcelist will recieve a Map as input
  // anything else will recieve an array
  source.transforms = new Map<
    string,
    (modifiers: string[], params: any[], query: any, ...args: any[]) => any
  >([
    [
      'join',
      (modifiers: string[], params: any[], sources: any[], expr) => {
        // TODO: handle subqueries properly
        const origin = sources[0];
        const target = sources[1];
        return origin
          .select()
          .from(
            origin
              .join(target)
              .on(
                (source as any).resolveExpression(
                  [origin, target],
                  expr,
                  params
                )
              )
          );
      },
    ],
    [
      'union',
      (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[]
      ): any => {
        return;
      },
    ],
    [
      'filter',
      (modifiers: string[], params: any[], query, expr) => {
        return query.where(
          (source as any).resolveExpression(query, expr, params)
        );
      },
    ],
    [
      'sort',
      (
        modifiers: string[],
        params: any[],
        query,
        ...fields: ContextualisedField[]
      ) => {
        let mapper = function (field: ContextualisedField) {
          return (source as any).resolveField(query, field, params);
        };
        if (modifiers.includes('desc')) {
          mapper = function (field: ContextualisedField) {
            return (source as any)
              .resolveField(query, field, params)
              .descending();
          };
        }
        return query.order(...fields.map(mapper));
      },
    ],
    [
      'first',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[]
      ) => {},
    ],
    [
      'group',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[],
        ...groupFields: ContextualisedField[]
      ) => {},
    ],
    ['count', async (modifiers: string[], params: any[], values: AnyObj) => {}],
    [
      'array',
      async (
        modifiers: string[],
        params: any[],
        values: AnyObj,
        field: ContextualisedField
      ) => {},
    ],
    ['uniq', async (modifiers: string[], params: any[], values: any) => {}],
  ]);
}
