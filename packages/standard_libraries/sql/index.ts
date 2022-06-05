import type { ContextualisedField, AnyObj, DataSource } from 'arql';
import { getAlias } from 'arql';
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
    ['addition', (a, b) => {
      console.log(a, b);
      return a.plus(b);
    }],
    ['subtraction', (a, b) => a.minus(b)],
    ['negation', (a) => (new Sql()).function('NOT')(a)],
    ['ternary', (a, b, c) => a.case([a], [b], c)],
    ['add', (a, b) => {
      console.log(a, b);
      return a.plus(b);
    }],
    ['minus', (a, b) => a.minus(b)],
    ['notEquals', (a, b) => a.notEquals(b)],
    ['equals', (a, b) => a.equals(b)],
    ['gt', (a, b) => a.gt(b)],
    ['lt', (a, b) => a.lt(b)],
    ['gte', (a, b) => a.gte(b)],
    ['lte', (a, b) => a.lte(b)],
    ['in', (a, b) => a.in(b)],
    ['notIn', (a, b) => a.notIn(b)],
  ]);

  // transform definitions:
  // transforms that follow a sourcelist will recieve a Map as input
  // anything else will recieve an array
  source.transforms = new Map<
    string,
    (
      modifiers: string[],
      params: any[],
      query: any,
      ...args: any[]
    ) => Promise<any>
  >([
    [
      'join',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[],
        condition: ContextualisedField
      ): Promise<any> => {
        return;
      },
    ],
    [
      'union',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[]
      ): Promise<any> => {
        return;
      },
    ],
    [
      'filter',
      async (
        modifiers: string[],
        params: any[],
        query,
        expr
      ) => {
        return query.where((source as any).resolveExpression(query, expr, params));
      },
    ],
    [
      'sort',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[],
        ...fields: ContextualisedField[]
      ) => {
        return;
      },
    ],
    [
      'first',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[]
      ) => {
      },
    ],
    [
      'group',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[],
        ...groupFields: ContextualisedField[]
      ) => {
      },
    ],
    [
      'count',
      async (modifiers: string[], params: any[], values: AnyObj) => {
      },
    ],
    [
      'array',
      async (
        modifiers: string[],
        params: any[],
        values: AnyObj,
        field: ContextualisedField
      ) => {
      },
    ],
    [
      'uniq',
      async (modifiers: string[], params: any[], values: any) => {
      },
    ],
  ]);
}
