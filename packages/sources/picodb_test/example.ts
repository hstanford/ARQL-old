import type {
  Native,
} from '@arql/core';
import {
  ContextualisedField,
  Dictionary,
  TransformDef,
} from '@arql/types';
import Pico from '@arql/source-picodb';

// this configuration applies to all data sources:
// postgres, native js, etc
export function generic() {
  const transforms: TransformDef[] = [
    {
      name: 'filter',
      modifiers: [],
      nArgs: 1,
    },
  ].map((o) => ({ ...o, type: 'transformdef' }));

  const EXPR = Symbol.for('EXPR');

  const operators = [
    {
      name: 'gt',
      pattern: [EXPR, '>', EXPR],
    },
    {
      name: 'lt',
      pattern: [EXPR, '<', EXPR],
    },
    {
      name: 'equality',
      pattern: [EXPR, '=', EXPR],
    },
  ];
  return {
    transforms,
    operators,
  };
}

export function pico(source: Pico) {
  // basic pico operators
  source.operators = new Map([
    ['notEquals', (a, b) => ({ [a]: { $ne: b } } as any)],
    ['equality', (a, b) => ({ [a]: { $eq: b } } as any)],
    ['gt', (a, b) => ({ [a]: { $gt: b } } as any)],
    ['lt', (a, b) => ({ [a]: { $lt: b } } as any)],
    ['gte', (a, b) => ({ [a]: { $gte: b } } as any)],
    ['lte', (a, b) => ({ [a]: { $lte: b } } as any)],
    ['in', (a, b) => ({ [a]: { $in: b } } as any)],
    ['notIn', (a, b) => ({ [a]: { $nin: b } } as any)],
  ]);

  // transform definitions:
  // transforms that follow a sourcelist will recieve a Map as input
  // anything else will recieve an array
  source.transforms = new Map<
    string,
    (
      modifiers: string[],
      params: any[],
      values: any,
      ...args: any[]
    ) => Promise<any>
  >([
    [
      'filter',
      (
        modifiers: string[],
        params: any[],
        query: any,
        condition: ContextualisedField
      ) => {
        return source.resolveField(condition, params);
      },
    ],
  ]);
}

// this configuration applies only to native sources
// (or the collector) and tells them how to perform
// the actions the query tree asks for
export function native(source: Native) {
  // basic native operators
  source.operators = new Map([
    ['notEquals', (a, b) => a !== b],
    ['equality', (a, b) => a === b],
    ['gt', (a, b) => a > b],
    ['lt', (a, b) => a < b],
    ['gte', (a, b) => a >= b],
    ['lte', (a, b) => a <= b],
    ['in', (a, b) => b.includes(a)],
    ['notIn', (a, b) => !b.includes(a)],
  ]);

  // transform definitions:
  // transforms that follow a sourcelist will recieve a Map as input
  // anything else will recieve an array
  source.transforms = new Map<
    string,
    (
      modifiers: string[],
      params: any[],
      values: Map<any, any> | Dictionary[],
      ...args: any[]
    ) => Promise<Dictionary[]>
  >([
    [
      'join',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | Dictionary[],
        condition: ContextualisedField
      ): Promise<Dictionary[]> => {
        if (Array.isArray(values)) {
          throw new Error('Unsupported input');
        }
        const vals: Dictionary[] = [];
        let i = 0;
        for (const [alias, model] of values.entries()) {
          if (i++ > 0) break;
          for (const [otheralias, othermodel] of values.entries()) {
            if (alias === otheralias) continue;
            for (const row of model) {
              for (let r of othermodel) {
                const [, matches] = await source.resolveField(
                  condition,
                  { [alias]: row, [otheralias]: r },
                  [],
                  params
                );
                if (matches) {
                  vals.push({ ...r, ...row, [alias]: row, [otheralias]: r });
                }
              }
            }
          }
        }
        return vals;
      },
    ],
    [
      'filter',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | Dictionary[],
        condition: ContextualisedField
      ) => {
        if (!Array.isArray(values)) {
          throw new Error('Unsupported input');
        }
        const filtered = [];
        for (const r of values) {
          const [, matches] = await source.resolveField(
            condition,
            r,
            [],
            params
          );
          if (matches) {
            filtered.push(r);
          }
        }
        return filtered;
      },
    ],
    [
      'sort',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | Dictionary[],
        ...fields: ContextualisedField[]
      ) => {
        if (!Array.isArray(values)) {
          throw new Error('Unsupported input');
        }
        const comparable = [];
        for (const value of values) {
          const results = [];
          for (const field of fields) {
            const [, resolved] = await source.resolveField(
              field,
              value,
              [],
              params
            );
            results.push(resolved);
          }
          comparable.push([results, value]);
        }
        const compareFn = (v1: any, v2: any) => {
          let isGreater = 0;
          for (let field of fields) {
            let f1 = v1[0],
              f2 = v2[0];
            isGreater = isGreater || (f1 > f2 ? 1 : f1 < f2 ? -1 : 0);
          }
          return modifiers.includes('desc') ? -isGreater : isGreater;
        };
        comparable.sort(compareFn);
        return comparable.map((c) => c[1]);
      },
    ],
  ]);
}
