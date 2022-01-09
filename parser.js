import {
  char,
  choice,
  coroutine,
  digits,
  letters,
  many,
  many1,
  optionalWhitespace,
  possibly,
  recursiveParser,
  sequenceOf,
} from 'arcsecond';

const alphachain = coroutine(function* () {
  const root = yield letters;
  const parts = [];
  yield optionalWhitespace;
  while (yield possibly(char('.'))) {
    yield optionalWhitespace;
    parts.push(yield letters);
    yield optionalWhitespace;
  }
  return {
    type: 'alphachain',
    root,
    parts
  }
});

const alias = coroutine(function* () {
  const name = yield letters;
  yield optionalWhitespace;
  yield char(':');
  return name;
});

const join = coroutine(function* () {
  const modifier = yield choice([char('?'), char('!')]);
  yield optionalWhitespace;
  yield char('.');
  return {
    type: 'join',
    modifier: {
      '?': 'left',
      '!': 'anti'
    }[modifier] || 'inner'
  }
});

const param = coroutine(function* () {
  yield char('$');
  return {
    type: 'param',
    index: Number(yield digits),
  };
});

const opchar = choice([
  char('+'),
  char('-'),
  char('*'),
  char('/'),
  char('<'),
  char('>'),
  char('='),
  char('~'),
  char('!'),
  char('@'),
  char('#'),
  char('%'),
  char('^'),
  char('&'),
  char('|'),
  char('`'),
  char('?'),
]);

const op = coroutine(function* () {
  const opstr = yield opchar;
  let next;
  while (next = yield possibly(opchar)) {
    opstr += next;
  }
  return {
    type: 'op',
    symbol: opstr,
  }
});

const exprNoOp = coroutine(function* () {
  return yield choice([
    coroutine(function* () {
      yield char('(');
      yield optionalWhitespace;
      const subExpr = yield expr;
      yield optionalWhitespace;
      yield char(')');
      return {
        type: 'expr',
        value: subExpr,
      }
    }),
    param,
    alphachain,
  ]);
});

const exprUnary = coroutine(function* () {
  const parts = [];
  const prefix = yield possibly(op);
  yield optionalWhitespace;
  if (prefix) {
    parts.push(prefix, ...(yield exprUnary));
  } else {
    parts.push(yield exprNoOp);
  }
  yield optionalWhitespace;
  let suffix;
  while (suffix = yield possibly(op)) {
    parts.push(suffix);
    yield optionalWhitespace;
  }

  return parts;
});

const exprOp = coroutine(function* () {
  const parts = [];

  yield optionalWhitespace;
  parts.push(...(yield exprUnary));
  yield optionalWhitespace;

  let more;
  while (more = yield possibly(exprUnary)) {
    parts.push(...more);
  }
  return parts;
});

const expr = recursiveParser(() => choice([
  exprOp,
  exprNoOp,
]));

const exprlist = possibly(coroutine(function* () {
  const values = [];
  let curr = yield expr;
  values.push(curr);
  yield optionalWhitespace;
  while (yield possibly(char(','))) {
    yield optionalWhitespace;
    curr = yield possibly(expr);
    if (curr) values.push(curr);
    yield optionalWhitespace;
  }

  return {
    type: 'exprlist',
    values,
  };
}));

const transform = coroutine(function* () {
  let args = [];
  yield char('|');
  yield optionalWhitespace;
  const description = yield alphachain;
  yield optionalWhitespace;
  if (yield possibly(char('('))) {
    yield optionalWhitespace;
    const exprs = yield exprlist;
    args = exprs ? exprs.values : [];
    yield optionalWhitespace;
    yield char(')');
  }

  yield optionalWhitespace;

  return {
    ...description,
    type: 'transform',
    args,
  };
});

// TODO: fix users.things unclear:
// is it a property access or a join??
const source = coroutine(function* () {
  const joins = [];
  const root = yield choice([
    coroutine(function* () {
      yield char('(');
      yield optionalWhitespace;
      const name = yield possibly(alias);
      yield optionalWhitespace;
      const value = yield fullFrom;
      yield optionalWhitespace;
      yield char(')');
      return {
        type: 'source',
        root: name || value.source?.name,
        value,
      }
    }),
    alphachain,
  ]);
  yield optionalWhitespace;

  let j;
  while (j = yield possibly(join)) {
    yield optionalWhitespace;
    joins.push({
      join: j,
      to: yield source,
    });
    yield optionalWhitespace;
  }
  return {
    type: 'source',
    root,
    joins,
  };
});

const fullFrom = coroutine(function* () {
  const src = yield possibly(source);
  const transforms = [];
  yield optionalWhitespace;
  let t;
  while (t = yield possibly(transform)) {
    transforms.push(t);
  }
  const shp = yield possibly(shape);
  return {
    source: src,
    transforms,
    shape: shp,
  };
});

const from = coroutine(function* () {
  const src = yield possibly(source);
  const transforms = [];
  yield optionalWhitespace;
  let t;
  while (t = yield possibly(transform)) {
    transforms.push(t);
  }
  const shp = yield shape;
  return {
    source: src,
    transforms,
    shape: shp,
  };
});

const to = coroutine(function* () {
  const src = yield alphachain;
  const transforms = [];
  yield optionalWhitespace;
  let t;
  while (t = yield possibly(transform)) {
    transforms.push(t);
  }
  const shp = yield possibly(shape);
  return {
    source: src,
    transforms,
    shape: shp,
  };
});

const field = coroutine(function* () {
  let name = yield possibly(alias);
  yield optionalWhitespace;
  const value = yield choice([from, expr]);
  name = name || value.source?.name;
  return {
    root: name,
    value,
  };
});

const fieldList = coroutine(function* () {
  const values = [];
  let curr = yield field;
  values.push(curr);
  yield optionalWhitespace;
  while (yield possibly(char(','))) {
    yield optionalWhitespace;
    curr = yield possibly(field);
    if (curr) values.push(curr);
    yield optionalWhitespace;
  }
  return values;
});

const shape = coroutine(function* () {
  yield char('{');
  yield optionalWhitespace;
  const fields = yield fieldList;
  yield optionalWhitespace;
  yield char('}');
  return fields;
});

const select = coroutine(function* () {
  return {
    from: yield from,
  };
});

const modify = coroutine(function* () {
  const f = yield from;
  yield optionalWhitespace;
  yield char('-');
  const type = yield choice([char('+'), char('>')]);
  yield optionalWhitespace;
  const t = yield to;
  return {
    type: {'+': 'insert', '>': 'update'}[type],
    from: f,
    to: t,
  };
});

const del = coroutine(function* () {
  yield char('-');
  yield choice([char('x'), char('>')]);
  yield optionalWhitespace;
  return { to: yield to };
});

const query = coroutine(function* () {
  yield optionalWhitespace;
  const value = yield choice([del, modify, select]);
  yield optionalWhitespace;
  return value;
});

export default function run (str) {
  return query.run(str).result;
};
