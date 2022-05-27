import type { ContextualisedField, Native, AnyObj } from 'arql';

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
  ]);
}
