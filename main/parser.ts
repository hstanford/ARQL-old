/**
 * PARSER
 *
 * The Parser's role is to take a string and construct an AST (Abstract Syntax Tree)
 * which is independent of the models configured. It is "what is the user trying to
 * ask for" without knowing what can be provided.
 *
 * It is dependent on an "opResolver" function, which is used to transform a flat
 * expression into a tree. This function should know what symbols correspond to which
 * operations, and know the overall operator precedence. Except for modifications
 * "-+", "-x" and "->", all operators are configurable.
 */

import {
  char,
  choice,
  digits,
  many,
  many1,
  optionalWhitespace,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
  Parser,
  sepBy,
  Ok,
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
  Wildcard,
} from './types.js';

export default function buildParser(opResolver = (expr: any) => expr) {
  // first_name, firstName, f1rstnam3 etc
  const keyword: Parser<string, string, any> = regex(/^[a-zA-Z_][a-zA-Z0-9_]*/);

  // keyword preceeded by a "."
  const dotSequence: Parser<string, string, any> = sequenceOf([
    char('.'),
    optionalWhitespace,
    keyword,
    optionalWhitespace,
  ]).map((parts) => parts[2]);

  // a list of dot-separated keywords corresponds to accessing a field
  // in an object: e.g. users.id or users.settings.dark_mode
  const alphachain: Parser<Alphachain, string, any> = sequenceOf([
    keyword,
    optionalWhitespace,
    many(dotSequence),
  ]).map((parts) => ({
    type: 'alphachain',
    root: parts[0],
    parts: parts[2],
  }));

  // change the name used for field or source down the data pipeline
  // by using ":" e.g. "u: users" allows "users" to be referred to as
  // "u" later on
  const alias: Parser<string, string, any> = sequenceOf([
    keyword,
    optionalWhitespace,
    char(':'),
  ]).map((parts) => parts[0]);

  // all variables and primitives like strings, numbers and booleans in a query
  // must be parameterised out to eliminate the risk of injection vulnerabilities.
  // Refer to the parameters by their index in the array of parameters e.g. "$3"
  const param: Parser<Param, string, any> = sequenceOf([char('$'), digits]).map(
    ([, index]) => ({
      type: 'param',
      index: Number(index),
    })
  );

  // the characters matched by this regex can be combined to create operators.
  // The function, name, and precedence of these operators is defined in the
  // "opResolver"
  const opchar: Parser<OpChar, string, any> = regex(
    /^[+\-*\/<>=~!@#%^&|`?:]/
  ) as Parser<any, string, any>;
  const op: Parser<Op, string, any> = many1(opchar).map((x) => ({
    type: 'op',
    symbol: x.join(''),
  }));

  // ->, -+ and -x indicate that data from the left of the query is being
  // used to modify the data on the right side of the query
  const modifier: Parser<Modifier, string, any> = sequenceOf([
    char('-'),
    choice([char('>'), char('+'), char('x')]),
  ]).map((parts) => parts.join('') as Modifier);

  // an expression is a series of parameters, fields, or sources transformed
  // in some way by operators and functions. Parentheses group sections of the
  // expression and can be used to subvert or clarify operator precedence.
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

  // expressions are parsed by looking for prefix/postfix operators then recursively
  // looking for expressions once those operators are considered
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

  // a comma-separated list of expressions form function arguments
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

  // transforms are functions applied to sources. Examples include filters,
  // sorts, limits/offsets, joins, unions, and aggregate functions.
  // They are invoked like functions, e.g. filter(users.id = orders.userId)
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

  // transforms are applied to a data source using a vertical bar, conceptually
  // similar to the "pipe" in unix.
  const transforms: Parser<Transform[], string, any> = many1(
    sequenceOf([
      char('|'),
      optionalWhitespace,
      transform,
      optionalWhitespace,
    ]).map((parts) => parts[2])
  );

  // a source corresponds to another source or data model providing
  // the incoming data, 0 or more transforms, and then finally an
  // optional "shape"
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
          [parts[2].root, ...parts[2].parts].pop()) ||
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
            [parts[2].root, ...parts[2].parts].pop()) ||
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
          [parts[2].root, ...parts[2].parts].pop()) ||
        undefined,
      value: parts[2],
      transforms: parts[4],
      shape: parts[5],
    }))
  );

  // when you want to combine data from different sources, you can collect
  // them in parentheses as a sourcelist before applying a transform to combine
  // e.g. ( users, orders ) | join(users.id = orders.userId)
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

  // when applying a modifier, you're writing data somewhere. That somewhere
  // is the destination "dest". e.g. "-x users | filter(id = $1)" means
  // delete users whose id is equal to the value stored in parameter 1
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
      (parts[2].type === 'alphachain' &&
        [parts[2].root, ...parts[2].parts].pop()) ||
      null,
    value: parts[2],
  }));

  const wildcard: Parser<Wildcard, string, any> = sequenceOf([
    many(sequenceOf([
      keyword,
      optionalWhitespace,
      char('.'),
      optionalWhitespace,
    ]).map(parts => parts[0])),
    char('*')
  ]).map(([[root, ...parts], wcard]) => {
    if (wcard !== '*') {
      throw new Error('Unknown wildcard character');
    }
    return {
      type: 'wildcard',
      value: wcard,
      root,
      parts,
    }
  });

  const fieldList: Parser<(Field | Wildcard)[], string, any> = sequenceOf([
    optionalWhitespace,
    sepBy(sequenceOf([optionalWhitespace, char(','), optionalWhitespace]))(
      possibly(choice([wildcard, field]))
    ),
    optionalWhitespace,
  ]).map((parts) => parts[1].filter((i) => !!i) as (Field | Wildcard)[]);

  // the shape is effectively a very powerful transform function. You specify the
  // structure of the data you want out of the source in json-like syntax. If you
  // want graphical data access you can use the shape for this e.g.
  // users {                                                 [{
  //   userId: users.id,                                ->     "userId": 1,
  //   orders | filter(users.id = orders.userId) {id}   ->     "orders": [{"id": 2}]
  // }                                                       }]
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

  // when selecting static data it's often useful to express many shapes
  // between [] in an array-like syntax. e.g. [{id: $1}, {id: $2}]
  const multiShape: Parser<Shape[], string, any> = sequenceOf([
    char('['),
    optionalWhitespace,
    sepBy(sequenceOf([optionalWhitespace, char(','), optionalWhitespace]))(
      possibly(shape)
    ),
    optionalWhitespace,
    char(']'),
  ]).map((parts) => parts[2].filter((i) => !!i) as Shape[]);

  // the query parser is used to parse all forms of queries
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

  function run<T extends keyof typeof parsers>(str: string, parserName: T) {
    type extractGeneric<Type> = Type extends Parser<infer X> ? X : never;
    type S = extractGeneric<typeof parsers[T]>;
    const out = parsers[parserName].run(str);
    if (out.isError === true) throw new Error(out.error);
    else return out.result as S;
  }

  run.query = function (str: string) {
    return run(str, 'query');
  };

  return run;
}

export type ARQLParser = ReturnType<typeof buildParser>;