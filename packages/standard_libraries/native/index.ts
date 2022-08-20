import { Native, getAlias } from '@arql/core';
import { ContextualisedField, AnyObj } from '@arql/types';

// TODO: make this better
function getKey(...values: any[]) {
  return JSON.stringify(
    values.map((value) =>
      typeof value === 'object' ? JSON.stringify(value) : value
    )
  );
}

// this configuration applies only to native sources
// (or the collector) and tells them how to perform
// the actions the query tree asks for
export default function native(source: Native) {
  // basic native operators
  source.operators = new Map([
    ['addition', (a, b) => a + b],
    ['subtraction', (a, b) => a - b],
    ['negation', (a) => !a],
    ['ternary', (a, b, c) => (a ? b : c)],
    ['add', (a, b) => a + b],
    ['minus', (a, b) => a - b],
    ['notEquals', (a, b) => a !== b],
    ['equals', (a, b) => a === b],
    ['gt', (a, b) => a > b],
    ['lt', (a, b) => a < b],
    ['gte', (a, b) => a >= b],
    ['lte', (a, b) => a <= b],
    ['in', (a, b) => b.includes(a)],
    ['notIn', (a, b) => !b.includes(a)],
    ['and', (a, b) => a && b],
    ['or', (a, b) => a || b],
  ]);

  // transform definitions:
  // transforms that follow a sourcelist will recieve a Map as input
  // anything else will recieve an array
  source.transforms = new Map<
    string,
    (
      modifiers: string[],
      params: any[],
      values: Map<any, any> | AnyObj[],
      ...args: any[]
    ) => Promise<AnyObj | AnyObj[]>
  >([
    [
      'join',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[],
        condition: ContextualisedField
      ): Promise<AnyObj[]> => {
        if (Array.isArray(values)) {
          throw new Error('Unsupported input');
        }
        const vals: AnyObj[] = [];
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
      'union',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[]
      ): Promise<AnyObj[]> => {
        if (Array.isArray(values)) {
          throw new Error('Unsupported input');
        }
        const vals: AnyObj[] = [];
        for (const [, model] of values.entries()) {
          for (const row of model) {
            vals.push(row);
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
        values: Map<any, any> | AnyObj[],
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
        values: Map<any, any> | AnyObj[],
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
          for (let i = 0; i < v1[0].length; i++) {
            let f1 = v1[0][i],
              f2 = v2[0][i];
            isGreater = isGreater || (f1 > f2 ? 1 : f1 < f2 ? -1 : 0);
          }
          return modifiers.includes('desc') ? -isGreater : isGreater;
        };
        comparable.sort(compareFn);
        return comparable.map((c) => c[1]);
      },
    ],
    [
      'first',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any> | AnyObj[]
      ) => {
        if (!Array.isArray(values)) {
          throw new Error('Unsupported input format for "first"');
        }
        return values[0];
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
        if (!Array.isArray(values)) {
          throw new Error('Unsupported input format for "group"');
        }
        const group = new Map<any, any[]>();
        for (const value of values) {
          const resolvedValues = [];
          for (const groupField of groupFields) {
            const [, resolved] = await source.resolveField(
              groupField,
              value,
              [],
              params
            );
            resolvedValues.push(resolved);
          }
          const key = getKey(...resolvedValues);
          if (!group.has(key)) {
            group.set(key, [value]);
          } else {
            const arr = group.get(key);
            if (arr) arr.push(value);
          }
        }
        const out = [];
        for (let [key, values] of group.entries()) {
          const val: Record<any, any> = { __values: values };
          for (const groupField of groupFields) {
            const alias = getAlias(groupField.alias || groupField.name);
            val[alias] = alias in values[0] ? values[0][alias] : key;
          }
          out.push(val);
        }
        return out;
      },
    ],
    [
      'count',
      async (modifiers: string[], params: any[], values: AnyObj) => {
        return values.__values?.length || 0;
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
        if (!values.__values) {
          throw new Error(
            'Array aggregation only supported with grouped output'
          );
        }
        const out = [];
        for (let value of values.__values) {
          const [, resolved] = await source.resolveField(
            field,
            value,
            [],
            params
          );
          out.push(resolved);
        }
        return out;
      },
    ],
    [
      'uniq',
      async (modifiers: string[], params: any[], values: any) => {
        if (!Array.isArray(values)) {
          throw new Error('Only arrays supported for uniq');
        }
        const out = [];
        const vals = new Set();
        for (const val of values) {
          // TODO: handle object types?
          if (vals.has(val)) continue;
          vals.add(val);
          out.push(val);
        }
        return out;
      },
    ],
  ]);
}
