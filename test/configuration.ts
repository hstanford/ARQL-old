import type { ContextualisedExpr, TransformDef } from 'arql-contextualiser';

import type Native from 'arql-resolver-native';

export function native(source: Native) {
  source.operators = new Map([
    ['addition', (a, b) => a + b],
    ['subtraction', (a, b) => a - b],
    ['negation', (a) => !a],
    ['equality', (a, b) => a === b],
    ['ternary', (a, b, c) => (a ? b : c)],
  ]);
  source.transforms = new Map([
    [
      'join',
      async (
        modifiers: string[],
        values: Map<any, any>,
        condition: ContextualisedExpr,
        params: any[]
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
        values: Map<any, any>,
        condition: ContextualisedExpr,
        params: any[]
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
      name: 'negation',
      pattern: ['!', EXPR],
    },
    {
      name: '+',
      pattern: [EXPR, '+', EXPR],
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
