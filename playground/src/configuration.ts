import type {
  ContextualisedField,
  TransformDef,
  Native,
  AnyObj,
} from 'arql';

export function native(source: Native) {
  source.operators = new Map([
    ['+', (a, b) => a + b],
    ['-', (a, b) => a - b],
    ['!', (a) => !a],
    ['equality', (a, b) => a == b],
    ['ternary', (a, b, c) => (a ? b : c)],
  ]);
  source.transforms = new Map<
    string,
    (
      modifiers: string[],
      params: any[],
      values: Map<any, any> | AnyObj[],
      ...args: any[]
    ) => Promise<AnyObj[]>
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
          const results = []
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
            isGreater =
              isGreater ||
              (f1 > f2
                ? 1
                : f1 < f2
                ? -1
                : 0);
          }
          return modifiers.includes('desc') ? -isGreater : isGreater;
        };
        comparable.sort(compareFn);
        return comparable.map(c => c[1]);
      },
    ],
  ]);
}

export function generic() {
  const transforms: TransformDef[] = [
    {
      name: 'filter',
      modifiers: [],
      nArgs: 1,
    },
    {
      name: 'sort',
      modifiers: ['desc', 'asc', 'nullsFirst', 'nullsLast'],
      nArgs: '1+',
    },
    {
      name: 'join',
      modifiers: [],
      nArgs: 1,
    },
  ].map((o) => ({ ...o, type: 'transformdef' }));

  const EXPR = Symbol.for('EXPR');

  const operators = [
    {
      name: '!',
      pattern: ['!', EXPR],
    },
    {
      name: '+',
      pattern: [EXPR, '+', EXPR],
    },
    {
      name: '-',
      pattern: [EXPR, '-', EXPR],
    },
    {
      name: 'equality',
      pattern: [EXPR, '=', EXPR],
    },
    {
      name: 'ternary',
      pattern: [EXPR, '?', EXPR, ':', EXPR],
    },
  ];
  return {
    transforms,
    operators,
  };
}
