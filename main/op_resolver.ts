/**
 * OP RESOLVER
 *
 * The Op Resolver takes user-defined operators and turns a flat
 * list of symbols and values into a tree based on precedence and
 * arity of the operators
 */

import type { ExprUnary, RankedOperator } from './types.js';

function indexOfSymbol(arr: ExprUnary[], symbol: string) {
  for (let i = 0; i < arr.length; i++) {
    const item: ExprUnary = arr[i];
    if (item.type === 'op' && item.symbol === symbol) return i;
  }
  return -1;
}

function match(expr: ExprUnary[], op: RankedOperator) {
  const args = [];
  const initial = op.pattern.find((val) => !(typeof val === 'symbol'));
  if (!initial || typeof initial === 'symbol') {
    throw new Error(`Pattern only contains EXPRs`);
  }
  const initPatternOffset = op.pattern.indexOf(initial);

  const initExprOffset = indexOfSymbol(expr, initial);
  const pOffset = initExprOffset - initPatternOffset;
  if (pOffset < 0 || pOffset + op.pattern.length > expr.length) {
    throw new Error(`Operator "${initial}" does not match`);
  }

  for (let i = 0; i < op.pattern.length; i++) {
    const item: ExprUnary = expr[i + pOffset];
    if (item.type === 'op') {
      if (op.pattern[i] !== item.symbol) throw new Error('No match');
    } else {
      if (!(typeof op.pattern[i] === 'symbol')) throw new Error('No match');

      args.push(expr[i + pOffset]);
    }
  }

  // matching pattern, splice
  expr.splice(pOffset, op.pattern.length, {
    type: 'exprtree',
    op: op.name,
    args,
  });
}

export default function (opMap: Map<string, RankedOperator>) {
  return function resolve(expr: ExprUnary[] = []) {
    const keys = [];
    let out = [...expr];
    for (const token of expr) {
      if (token.type === 'op') {
        keys.push(token.symbol);
      }

      // recursion handled by main parser
      /*if (token.type === 'expr' && Array.isArray(token.value)) {
        token.value = resolve(token.value);
      }*/
    }

    const ops = keys
      .map((key) => {
        const val = opMap.get(key);
        if (!val) throw new Error(`Unknown operator ${key}`);
        return val;
      })
      .sort((a, b) => a.rank - b.rank);

    let op;
    while (ops.length) {
      op = ops.shift();
      if (!op) continue;
      for (
        let i = 0;
        i < op.pattern.filter((x) => !(typeof x === 'symbol')).length - 1;
        i++
      )
        ops.shift();
      match(out, op);
    }

    return out[0];
  };
}
