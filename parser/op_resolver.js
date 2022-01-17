import { EXPR } from '../operations/index.js';

function indexOfSymbol (arr, symbol) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].type === 'op' && arr[i].symbol === symbol)
      return i;
  }
  return -1;
}

function match (expr, op) {
  const args = [];
  const initial = op.pattern.find(val => val !== EXPR);
  const initPatternOffset = op.pattern.indexOf(initial);

  const initExprOffset = indexOfSymbol(expr, initial);
  const pOffset = initExprOffset - initPatternOffset;
  if (pOffset < 0 || (pOffset + op.pattern.length) > expr.length)
    throw new Error(`Operator "${initial}" does not match`);

  for (let i = 0; i < op.pattern.length; i++) {
    if (expr[i + pOffset].type === 'op') {
      if (op.pattern[i] !== expr[i + pOffset].symbol)
        throw new Error('No match');
    } else {
      if (op.pattern[i] !== EXPR)
        throw new Error('No match');

      args.push(expr[i + pOffset]);
    }
  }

  // matching pattern, splice
  expr.splice(pOffset, op.pattern.length, {
    type: 'expr',
    opName: op.name,
    args,
  });
}

export default function (opMap) {
  return function resolve (expr=[]) {
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

    const ops = keys.map(key => {
      const val = opMap.get(key);
      if (!val)
        throw new Error(`Unknown operator ${key}`);
      return val;
    }).sort((a, b) => a.rank - b.rank);

    let op;
    while (ops.length) {
      op = ops.shift();
      for (let i = 0; i < op.pattern.filter(x => x !== EXPR).length - 1; i++)
        ops.shift();
      match(out, op);
    }

    return out[0];
  };
};
