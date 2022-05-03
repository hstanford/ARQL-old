import {
  char,
  choice,
  digit,
  digits,
  many,
  many1,
  optionalWhitespace,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
  Parser,
  lookAhead,
  sepBy,
} from 'arcsecond';

import type {
  Alphachain,
  Param,
  OpChar,
  Op,
  Modifier,
  SubExpr,
  FunctionCall,
  ExprUnary,
  Expr,
  ExprTree,
  Shape,
  Source,
  Transform,
  Dest,
  Field,
  Query,
} from './types.js';

export default function buildParser(opResolver = (expr: any) => expr) {
  const keyword: Parser<string, string, any> = regex(/^[a-zA-Z_][a-zA-Z0-9_]*/);

  const dotSequence: Parser<string, string, any> = sequenceOf([
    char('.'),
    optionalWhitespace,
    keyword,
    optionalWhitespace,
  ]).map((parts) => parts[2]);

  const alphachain: Parser<Alphachain, string, any> = sequenceOf([
    keyword,
    optionalWhitespace,
    many(dotSequence),
  ]).map((parts) => ({
    type: 'alphachain',
    root: parts[0],
    parts: parts[2],
  }));

  const alias: Parser<string, string, any> = sequenceOf([
    keyword,
    optionalWhitespace,
    char(':'),
  ]).map((parts) => parts[0]);

  const param: Parser<Param, string, any> = sequenceOf([char('$'), digits]).map(
    ([, index]) => ({
      type: 'param',
      index: Number(index),
    })
  );

  const opchar: Parser<OpChar, string, any> = regex(
    /^[+\-*\/<>=~!@#%^&|`?:]/
  ) as Parser<any, string, any>;
  const op: Parser<Op, string, any> = many1(opchar).map((x) => ({
    type: 'op',
    symbol: x.join(''),
  }));

  const modifier: Parser<Modifier, string, any> = sequenceOf([
    char('-'),
    choice([char('>'), char('+'), char('x')]),
  ]).map((parts) => parts.join('') as Modifier);

  const exprNoOp: Parser<SubExpr, string, any> = recursiveParser(function () {
    return choice([
      sequenceOf([
        char('('),
        optionalWhitespace,
        expr,
        optionalWhitespace,
        char(')'),
      ]).map((parts) => parts[2]),
      param,
      alphachain,
      source, // TODO: this will get messed up by alphachain: fix
    ]);
  });

  const funOrExpr: Parser<SubExpr | FunctionCall> = recursiveParser(() =>
    sequenceOf([
      exprNoOp,
      possibly(
        sequenceOf([
          char('('),
          optionalWhitespace,
          exprlist,
          optionalWhitespace,
          char(')'),
        ]).map((parts) => parts[2])
      ),
    ]).map(([ex, args]) =>
      args
        ? {
            type: 'function',
            expr: ex,
            args,
          }
        : ex
    )
  );

  const exprUnary: Parser<ExprUnary | ExprUnary[], string, any> =
    recursiveParser(() =>
      choice([
        sequenceOf([
          op,
          optionalWhitespace,
          exprUnary,
          optionalWhitespace,
          many(sequenceOf([op, optionalWhitespace]).map((parts) => parts[0])),
        ]).map((parts) => [
          parts[0],
          ...(Array.isArray(parts[2]) ? parts[2] : [parts[2]]),
          ...parts[4],
        ]),
        sequenceOf([
          optionalWhitespace,
          funOrExpr,
          optionalWhitespace,
          many(sequenceOf([op, optionalWhitespace]).map((parts) => parts[0])),
        ]).map((parts) => {
          const fullSeq = [parts[1], ...parts[3]];
          return fullSeq.length === 1 ? fullSeq[0] : fullSeq;
        }),
      ])
    );

  const exprOp: Parser<ExprTree, string, any> = sequenceOf([
    optionalWhitespace,
    many1(exprUnary),
  ]).map((parts) => {
    if (parts[1].length === 1) return parts[1][0];
    return opResolver(
      parts[1].reduce((acc: ExprUnary[], item) => {
        const allItems: ExprUnary[] = Array.isArray(item) ? item : [item];
        acc.push(...allItems);
        return acc;
      }, [])
    );
  });

  const expr: Parser<Expr, string, any> = recursiveParser(() =>
    choice([sourceWithTransforms, sourceWithShape, exprOp, exprNoOp])
  );

  const exprlist: Parser<Expr[] | null, string, any> = possibly(
    sequenceOf([
      expr,
      optionalWhitespace,
      many(
        sequenceOf([
          char(','),
          optionalWhitespace,
          expr,
          optionalWhitespace,
        ]).map((parts) => parts[2])
      ),
      possibly(char(',')),
    ]).map((parts) => [parts[0], ...parts[2]].filter((p) => p !== null))
  );

  const transformArg: Parser<Expr | Shape | Source> = recursiveParser(() =>
    choice([expr, shape, source])
  );

  const transformArgs: Parser<(Expr | Shape | Source)[] | null> = possibly(
    sequenceOf([
      transformArg,
      optionalWhitespace,
      many(
        sequenceOf([
          char(','),
          optionalWhitespace,
          transformArg,
          optionalWhitespace,
        ]).map((parts) => parts[2])
      ),
      possibly(char(',')),
    ]).map((parts) => [parts[0], ...parts[2]].filter((p) => p !== null))
  );

  const transform: Parser<Transform, string, any> = sequenceOf([
    alphachain,
    optionalWhitespace,
    possibly(
      sequenceOf([
        char('('),
        optionalWhitespace,
        transformArgs,
        optionalWhitespace,
        char(')'),
      ]).map((parts) => parts[2])
    ),
  ]).map((parts) => ({
    type: 'transform',
    description: parts[0],
    args: parts[2] || [],
  }));

  const possiblyTransforms: Parser<Transform[], string, any> = many(
    sequenceOf([
      char('|'),
      optionalWhitespace,
      transform,
      optionalWhitespace,
    ]).map((parts) => parts[2])
  );

  const transforms: Parser<Transform[], string, any> = many1(
    sequenceOf([
      char('|'),
      optionalWhitespace,
      transform,
      optionalWhitespace,
    ]).map((parts) => parts[2])
  );

  const source: Parser<Source, string, any> = recursiveParser(() =>
    sequenceOf([
      possibly(alias),
      optionalWhitespace,
      choice([sourcelist, alphachain]),
      optionalWhitespace,
      possiblyTransforms,
      possibly(shape),
    ]).map((parts) => ({
      type: 'source',
      alias:
        parts[0] ||
        (typeof parts[2] === 'string' && parts[2]) ||
        (!Array.isArray(parts[2]) &&
          parts[2].type === 'alphachain' &&
          parts[2].root) ||
        undefined,
      value: parts[2],
      transforms: parts[4],
      shape: parts[5],
    }))
  );

  const sourceWithTransforms: Parser<Source, string, any> = recursiveParser(
    () =>
      sequenceOf([
        possibly(alias),
        optionalWhitespace,
        choice([sourcelist, alphachain]),
        optionalWhitespace,
        transforms,
        possibly(shape),
      ]).map((parts) => ({
        type: 'source',
        alias:
          parts[0] ||
          (typeof parts[2] === 'string' && parts[2]) ||
          (!Array.isArray(parts[2]) &&
            parts[2].type === 'alphachain' &&
            parts[2].root) ||
          undefined,
        value: parts[2],
        transforms: parts[4],
        shape: parts[5],
      }))
  );

  const sourceWithShape: Parser<Source, string, any> = recursiveParser(() =>
    sequenceOf([
      possibly(alias),
      optionalWhitespace,
      possibly(choice([sourcelist, alphachain])),
      optionalWhitespace,
      possiblyTransforms,
      choice([shape, multiShape]),
    ]).map((parts) => ({
      type: 'source',
      alias:
        parts[0] ||
        (typeof parts[2] === 'string' && parts[2]) ||
        (!Array.isArray(parts[2]) &&
          parts[2]?.type === 'alphachain' &&
          parts[2].root) ||
        undefined,
      value: parts[2],
      transforms: parts[4],
      shape: parts[5],
    }))
  );

  const sourcelist: Parser<Source | Source[], string, any> = sequenceOf([
    char('('),
    optionalWhitespace,
    source,
    optionalWhitespace,
    many(
      sequenceOf([
        char(','),
        optionalWhitespace,
        source,
        optionalWhitespace,
      ]).map((parts) => parts[2])
    ),
    possibly(char(',')),
    optionalWhitespace,
    char(')'),
  ]).map((parts) => {
    return parts[4].length ? [parts[2]].concat(parts[4]) : parts[2];
  });

  const dest: Parser<Dest, string, any> = recursiveParser(() =>
    sequenceOf([
      possibly(alias),
      optionalWhitespace,
      keyword,
      optionalWhitespace,
      possiblyTransforms,
      possibly(shape),
    ]).map((parts) => ({
      type: 'dest',
      alias: parts[0] || parts[2],
      value: parts[2],
      transforms: parts[4],
      shape: parts[5],
    }))
  );

  const field: Parser<Field, string, any> = sequenceOf([
    possibly(alias),
    optionalWhitespace,
    expr,
  ]).map((parts) => ({
    type: 'field',
    alias:
      parts[0] ||
      (parts[2].type === 'source' && parts[2].alias) ||
      (parts[2].type === 'alphachain' && [parts[2].root, ...parts[2].parts].pop()) ||
      null,
    value: parts[2],
  }));

  const fieldList: Parser<Field[], string, any> = sequenceOf([
    optionalWhitespace,
    sepBy(sequenceOf([optionalWhitespace, char(','), optionalWhitespace]))(
      possibly(field)
    ),
    optionalWhitespace,
  ]).map((parts) => parts[1].filter((i) => !!i) as Field[]);

  const shape: Parser<Shape, string, any> = sequenceOf([
    char('{'),
    optionalWhitespace,
    fieldList,
    optionalWhitespace,
    char('}'),
  ]).map((parts) => ({
    type: 'shape',
    fields: parts[2],
  }));

  const multiShape: Parser<Shape[], string, any> = sequenceOf([
    char('['),
    optionalWhitespace,
    sepBy(sequenceOf([optionalWhitespace, char(','), optionalWhitespace]))(
      possibly(shape)
    ),
    optionalWhitespace,
    char(']'),
  ]).map((parts) => parts[2].filter((i) => !!i) as Shape[]);

  const query: Parser<Query, string, any> = sequenceOf([
    optionalWhitespace,
    possibly(choice([source, sourceWithShape])),
    optionalWhitespace,
    possibly(
      sequenceOf([modifier, optionalWhitespace, dest]).map((parts) => ({
        modifier: parts[0],
        dest: parts[2],
      }))
    ),
    optionalWhitespace,
  ]).map((parts) => ({
    type: 'query',
    source: parts[1],
    modifier: parts[3]?.modifier,
    dest: parts[3]?.dest,
  }));

  const parsers = {
    keyword,
    dotSequence,
    alphachain,
    alias,
    param,
    opchar,
    modifier,
    exprNoOp,
    funOrExpr,
    exprUnary,
    exprOp,
    expr,
    exprlist,
    transformArg,
    transformArgs,
    transform,
    transforms,
    source,
    sourceWithTransforms,
    sourceWithShape,
    sourcelist,
    dest,
    field,
    fieldList,
    shape,
    query,
  };

  function run(str: string, parserName: keyof typeof parsers = 'query') {
    const out = parsers[parserName].run(str);
    if (out.isError === true) throw new Error(out.error);
    else return out.result;
  }

  run.query = function (str: string) {
    return run(str) as Query;
  };

  return run;
}
