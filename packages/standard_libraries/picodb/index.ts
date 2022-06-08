import type { ContextualisedField } from 'arql';
import type Pico from '@arql/source-picodb';

export default function pico(source: Pico) {
  // basic pico operators
  source.operators = new Map([
    ['notEquals', (a, b) => ({ [a]: { $ne: b } } as any)],
    ['equals', (a, b) => ({ [a]: { $eq: b } } as any)],
    ['gt', (a, b) => ({ [a]: { $gt: b } } as any)],
    ['lt', (a, b) => ({ [a]: { $lt: b } } as any)],
    ['gte', (a, b) => ({ [a]: { $gte: b } } as any)],
    ['lte', (a, b) => ({ [a]: { $lte: b } } as any)],
    ['in', (a, b) => ({ [a]: { $in: b } } as any)],
    ['notIn', (a, b) => ({ [a]: { $nin: b } } as any)],
    ['and', (a, b) => ({ ...a, ...b } as any)],
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
