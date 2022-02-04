import {
  char,
  choice,
  coroutine,
  digits,
  many,
  many1,
  optionalWhitespace,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
  str,
  tapParser,
  Parser,
} from 'arcsecond';

type JoinModifier = 'inner' | 'left' | 'anti';
type OpChar = '+' | '-' | '*' | '/' | '<' | '>' | '=' | '~' | '!' | '@' | '#' | '%' | '^' | '& '| '|' | '`' | '?' | ':';
interface Join {
  type: 'join';
  modifier: JoinModifier;
  to: Source;
}

interface ModifierMap {
  [key: string]: JoinModifier;
}

const modifierMap: ModifierMap = {
  '?': 'left',
  '!': 'anti',
  '': 'inner',
};

export interface Alphachain {
  type: 'alphachain';
  root: string;
  parts: string[];
}

export interface Param {
  type: 'param';
  index: number;
}

export interface Op {
  type: 'op',
  symbol: string;
}

export type Expr = ExprTree | Param | Alphachain;
export type ExprUnary = SubExpr | FunctionCall | Op;

type SubExpr = Expr | Param | Alphachain;

interface ExprTree {
  type: 'exprtree',
  op: string;
  args: ExprUnary[];
}

interface FunctionCall {
  type: 'function';
  expr: Expr;
  args: Expr[];
}

export interface Transform {
  type: 'transform';
  description: Alphachain;
  args: Expr[];
}

export interface Source {
  type: 'source';
  alias: Alphachain | string | undefined;
  value: Alphachain | FullFrom;
  joins: Join[];
}

interface FullFrom {
  type: 'from';
  source: Source | null;
  transforms: Transform[];
  shape: Shape | null;
}

export interface From {
  type: 'from';
  source: Source | null;
  transforms: Transform[];
  shape: Shape;
}

export interface Model {
  type: 'model';
  alias: string | null;
  value: Alphachain;
}

export interface To {
  type: 'to';
  source: Model;
  transforms: Transform[];
  shape: Shape | null;
}

export interface Field {
  type: 'field';
  alias: string | null;
  value: From | Expr;
}

export interface Shape {
  type: 'shape';
  fields: Field[];
};

export interface Query {
  type: 'query';
  from: From | null;
  modifier: Modifier | null;
  to: To | null;
}

type Modifier = '->' | '-+' | '-x';

export default function buildParser (opResolver = (expr: any) => expr) {
  const keyword: Parser<string, string, any> = regex(/^[a-zA-Z][a-zA-Z0-9]*/);

  const dotSequence: Parser<string, string, any> = sequenceOf([
    char('.'),
    optionalWhitespace,
    keyword,
    optionalWhitespace, 
  ]).map(parts => parts[2]);

  const alphachain: Parser<Alphachain, string, any> = sequenceOf([
    keyword,
    optionalWhitespace,
    many(dotSequence),
  ]).map(parts => ({
    type: 'alphachain',
    root: parts[0],
    parts: parts[2],
  }));

  const alias: Parser<string, string, any> = sequenceOf([
    keyword,
    optionalWhitespace,
    char(':'),
  ]).map(parts => parts[0]);

  const join: Parser<string | null, string, any> = sequenceOf([
    possibly(regex(/^[?!]/)),
    optionalWhitespace,
    char('.'),
  ]).map(parts => parts[0]);

  const param: Parser<Param, string, any> = sequenceOf([
    char('$'),
    digits
  ]).map(([,index]) => ({
    type: 'param',
    index: Number(index),
  }))

  const opchar: Parser<OpChar, string, any> = regex(/^[+\-*\/<>=~!@#%^&|`?:]/) as Parser<any, string, any>;
  const op: Parser<Op, string, any> = many1(opchar).map(x => ({
    type: 'op',
    symbol: x.join(''),
  }));

  const exprNoOp: Parser<SubExpr, string, any> = recursiveParser(function (): any {
    return choice([
      sequenceOf([
        char('('),
        optionalWhitespace,
        expr,
        optionalWhitespace,
        char(')')
      ]).map(parts => parts[2]),
      param,
      alphachain,
    ]);
  });

  const funOrExpr: Parser<SubExpr | FunctionCall> = recursiveParser(() => sequenceOf([
    exprNoOp,
    possibly(sequenceOf([
      char('('),
      optionalWhitespace,
      exprlist,
      optionalWhitespace,
      char(')')
    ]).map(parts => parts[2])),
  ]).map(([ex, args]) => args ? {
    type: 'function',
    expr: ex,
    args,
  } : ex));

  const exprUnary: Parser<ExprUnary[], string, any> = recursiveParser(() => choice([
    sequenceOf([
      op,
      optionalWhitespace,
      exprUnary,
      optionalWhitespace,
      many(sequenceOf([
        op,
        optionalWhitespace,
      ]).map(parts => parts[0])),
    ]).map(parts => [parts[0], ...parts[2], ...parts[4]]),
    sequenceOf([
      optionalWhitespace,
      funOrExpr,
      optionalWhitespace,
      many(sequenceOf([
        op,
        optionalWhitespace,
      ]).map(parts => parts[0])),
    ]).map(parts => [parts[1], ...parts[3]]),
  ]));

  const exprOp: Parser<ExprTree, string, any> = sequenceOf([
    optionalWhitespace,
    many1(exprUnary),
  ]).map(parts => opResolver(parts[1].reduce((acc, item) => {
    acc.push(...item);
    return acc;
  }, [])));

  const expr: Parser<Expr, string, any> = recursiveParser(() => choice([
    exprOp,
    exprNoOp,
  ]));

  const exprlist: Parser<Expr[] | null, string, any> = possibly(sequenceOf([
    expr,
    optionalWhitespace,
    many(sequenceOf([
      char(','),
      optionalWhitespace,
      possibly(expr), // "possibly" to allow for trailing commas
      optionalWhitespace
    ]).map(parts => parts[2])),
  ]).map(parts => [parts[0], ...parts[2]].filter(p => p !== null) as Expr[]));

  const transform: Parser<Transform, string, any> = sequenceOf([
    char('|'),
    optionalWhitespace,
    alphachain,
    optionalWhitespace,
    possibly(sequenceOf([
      char('('),
      optionalWhitespace,
      exprlist,
      optionalWhitespace,
      char(')'),
    ]).map(parts => parts[2])),
    optionalWhitespace,
  ]).map(parts => ({
    type: 'transform',
    description: parts[2],
    args: parts[4] || [],
  }));

  const subSource: Parser<Source, string, any> = recursiveParser(() => sequenceOf([
    char('('),
    optionalWhitespace,
    possibly(alias),
    optionalWhitespace,
    fullFrom,
    optionalWhitespace,
    char(')'),
  ]).map(parts => ({
    type: 'source',
    alias: parts[2] || (parts[4].source as (Source | undefined))?.alias,
    value: parts[4],
    joins: [],
  })));

  // TODO: fix users.things unclear:
  // is it a property access or a join?? (ok to be contextual?)
  const source: Parser<Source, string, any> = recursiveParser(() => sequenceOf([
    choice([subSource, alphachain]),
    optionalWhitespace,
    many(fullJoin)
  ]).map(parts => parts[0].type === 'source' ? {
    ...parts[0],
    joins: parts[0].joins.concat(parts[2]),
  } : {
    type: 'source',
    value: parts[0],
    alias: parts[0],
    joins: parts[2],
  }));

  const fullJoin: Parser<Join, string, any> = sequenceOf([
    join,
    optionalWhitespace,
    source,
    optionalWhitespace,
  ]).map(parts => ({
    type: 'join',
    modifier: modifierMap[parts[0] || ''],
    to: parts[2],
  }));

  
  const fullFrom: Parser<FullFrom, string, any> = recursiveParser(() => sequenceOf([
    possibly(source),
    optionalWhitespace,
    many(transform),
    possibly(shape)
  ])).map(parts => ({
    type: 'from',
    source: parts[0],
    transforms: parts[2],
    shape: parts[3],
  }));

  const from: Parser<From, string, any> = recursiveParser(() => sequenceOf([
    possibly(source),
    optionalWhitespace,
    many(transform),
    shape
  ]).map(parts => ({
    type: 'from',
    source: parts[0],
    transforms: parts[2],
    shape: parts[3],
  })));

  const model: Parser<Model, string, any> = choice([
    sequenceOf([
      char('('),
      optionalWhitespace,
      possibly(alias),
      optionalWhitespace,
      alphachain,
      optionalWhitespace,
      char(')')
    ]).map(parts => ({
      type: 'model',
      alias: parts[2],
      value: parts[4]
    })),
    sequenceOf([
      optionalWhitespace,
      possibly(alias),
      optionalWhitespace,
      alphachain,
      optionalWhitespace,
    ]).map(parts => ({
      type: 'model',
      alias: parts[1],
      value: parts[3],
    }))
  ]);

  const to: Parser<To, string, any> = recursiveParser(() => sequenceOf([
    model,
    optionalWhitespace,
    many(transform),
    possibly(shape),
  ]).map(parts => ({
    type: 'to',
    source: parts[0],
    transforms: parts[2],
    shape: parts[3],
  })));

  const field: Parser<Field, string, any> = sequenceOf([
    possibly(alias),
    optionalWhitespace,
    choice([from, expr]),
  ]).map(parts => ({
    type: 'field',
    alias: parts[0],
    value: parts[2],
  }));

  const fieldList: Parser<Field[], string, any> = many(sequenceOf([
    field,
    optionalWhitespace,
    possibly(char(',')),
    optionalWhitespace,
  ]).map(parts => parts[0]));

  const shape: Parser<Shape, string, any> = sequenceOf([
    char('{'),
    optionalWhitespace,
    fieldList,
    optionalWhitespace,
    char('}'),
  ]).map(parts => ({
    type: 'shape',
    fields: parts[2],
  }));

  const select: Parser<Query, string, any> = from.map(value => ({
    type: 'query',
    from: value,
    modifier: null,
    to: null,
  }));

  const modifier = choice([str('-+'), str('->'), str('-x')]) as Parser<Modifier, string, any>;
  
  const modify: Parser<Query, string, any> = sequenceOf([
    from,
    optionalWhitespace,
    modifier,
    optionalWhitespace,
    to,
  ]).map(parts => ({
    type: 'query',
    from: parts[0],
    modifier: parts[2],
    to: parts[4],
  }));

  const del: Parser<Query, string, any> = sequenceOf([
    str('->') as Parser<Modifier, string, any>,
    optionalWhitespace,
    to,
  ]).map(parts => ({
    type: 'query',
    from: null,
    modifier: parts[0],
    to: parts[2]
  }));

  const query: Parser<Query, string, any> = sequenceOf([
    optionalWhitespace,
    choice([del, modify, select]),
    optionalWhitespace,
  ]).map(parts => parts[1]);

  return function run (str: string) {
    const out = query.run(str);
    if (out.isError === true)
      throw new Error(out.error);
    else
      return out.result;
  };
}

