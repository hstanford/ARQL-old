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
      (modifiers: string[], params: any[], contextQueries: any[], expr) => {
        const sources = contextQueries[0];
        const origin = sources[0];
        const target = sources[1];

        return (source as any).sql
          .select()
          .from(
            origin
              .join(target)
              .on(
                (source as any).resolveExpression(
                  contextQueries,
                  expr,
                  params,
                  false
                )
              )
          );
      },
    ],
    [
      'union',
      (modifiers: string[], params: any[], contextQueries): any => {
        const sources = contextQueries[0];
        const sql = (source as any).sql;
        return sql
          .select()
          .from(sql.binaryOperator('UNION')(sources[0], sources[1]));
      },
    ],
    [
      'filter',
      (modifiers: string[], params: any[], contextQueries, expr) => {
        return contextQueries[0].where(
          (source as any).resolveField(contextQueries, expr, params, true)
        );
      },
    ],
    [
      'sort',
      (
        modifiers: string[],
        params: any[],
        contextQueries,
        ...fields: ContextualisedField[]
      ) => {
        let mapper = function (field: ContextualisedField) {
          return (source as any).resolveField(contextQueries, field, params, true);
        };
        if (modifiers.includes('desc')) {
          mapper = function (field: ContextualisedField) {
            return (source as any)
              .resolveField(contextQueries, field, params)
              .descending();
          };
        }
        return contextQueries[0].order(...fields.map(mapper));
      },
    ],
    [
      'first',
      (modifiers: string[], params: any[], contextQueries) => {
        return contextQueries[0].distinctOn((source as any).sql.constant(true));
      },
    ],
    [
      'group',
      (
        modifiers: string[],
        params: any[],
        contextQueries,
        ...groupFields: ContextualisedField[]
      ) => {
        return contextQueries[0].group(
          ...groupFields.map((field) =>
            (source as any).resolveField(contextQueries, field, params, true)
          )
        );
      },
    ],
    [
      'count',
      (modifiers: string[], params: any[]) => {
        const sql = (source as any).sql;
        return sql.function('count')(sql.constant(1));
      },
    ],
    [
      'array',
      (
        modifiers: string[],
        params: any[],
        contextQueries,
        field: ContextualisedField
      ) => {
        const sql = (source as any).sql;
        return sql.function('ARRAY_AGG')(
          (source as any).resolveField(contextQueries, field, params)
        );
      },
    ],
    [
      'uniq',
      (modifiers: string[], params: any[], values: any) => {
        // use distinct/distinct on? Group by?
        throw new Error('Not implemented');
      },
    ],
  ]);
}
