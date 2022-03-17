import type {
  ContextualisedExpr,
  TransformDef,
  DataField,
  Native,
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
      values: Map<any, any>,
      ...args: any[]
    ) => Promise<Map<any, any>>
  >([
    [
      'join',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any>,
        condition: ContextualisedExpr
      ) => {
        const vals: any[] = [];
        const out: Map<any, any> = new Map([[0, vals]]);
        let i = 0;
        for (const [alias, model] of values.entries()) {
          if (i++ > 0) break;
          for (const [otheralias, othermodel] of values.entries()) {
            if (alias === otheralias) continue;
            for (const row of model) {
              const matching = othermodel.filter((r: any) => {
                return source.resolveExpr(
                  condition,
                  new Map([
                    [alias, row],
                    [otheralias, r],
                  ]),
                  params
                );
              });
              for (let m of matching) {
                vals.push({ ...m, ...row, [alias]: row, [otheralias]: m });
              }
            }
          }
        }
        return out;
      },
    ],
    [
      'filter',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any>,
        condition: ContextualisedExpr
      ) => {
        return new Map(
          [...values.entries()].map(([k, v]) => {
            return [
              k,
              v.filter((r: any) =>
                source.resolveExpr(condition, new Map([[k, r]]), params)
              ),
            ];
          })
        );
      },
    ],
    [
      'sort',
      async (
        modifiers: string[],
        params: any[],
        values: Map<any, any[]>,
        ...fields: DataField[]
      ) => {
        const data = [...values.entries()][0][1];
        const compareFn = (v1: any, v2: any) => {
          let isGreater = 0;
          for (let field of fields) {
            isGreater =
              isGreater ||
              (v1[field.name] > v2[field.name]
                ? 1
                : v1[field.name] < v2[field.name]
                ? -1
                : 0);
          }
          return modifiers.includes('desc') ? -isGreater : isGreater;
        };
        return new Map([
          [
            0,
            data.sort(compareFn),
          ]
        ]);
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
