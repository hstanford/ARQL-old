import buildParser from './parser';

const dummyOpResolver = (args: any) => ({
  type: 'exprtree',
  op: '',
  args,
});

const run = buildParser(dummyOpResolver);

test('keyword parses a single word correctly', () => {
  const out = run('hello', 'keyword');
  expect(out).toBe('hello');
});

test('keyword takes only the first word of multiple', () => {
  const out = run('hello world', 'keyword');
  expect(out).toBe('hello');
});

test('keyword supports numbers after the first alpha char', () => {
  let out = run('h3llo', 'keyword');
  expect(out).toBe('h3llo');
  try {
    out = run('3ello', 'keyword');
  } catch (e) {
    out = null;
  }
  expect(out).toBeNull();
});

test('dotSequence matches one keyword preceeded by "."', () => {
  let out;
  try {
    out = run('', 'dotSequence');
  } catch (e) {}
  expect(out).toBeUndefined();
  out = run('.hello', 'dotSequence');
  expect(out).toBe('hello');
});

test('alphachain matches one or more dot-separated keywords', () => {
  let out;
  try {
    out = run('', 'alphachain');
  } catch (e) {}
  expect(out).toBeUndefined();
  out = run('hello', 'alphachain');
  expect(out).toEqual({ type: 'alphachain', root: 'hello', parts: [] });
  out = run('hello.world', 'alphachain');
  expect(out).toEqual({ type: 'alphachain', root: 'hello', parts: ['world'] });
  out = run(
    `hello
    .world
    .foo`,
    'alphachain'
  );
  expect(out).toEqual({
    type: 'alphachain',
    root: 'hello',
    parts: ['world', 'foo'],
  });
});

test('alias matches a keyword followed by a colon', () => {
  let out = run('test:', 'alias');
  expect(out).toBe('test');
  out = run('test  :', 'alias');
  expect(out).toBe('test');
});

test('param matches "$" followed by a sequence of digits', () => {
  let out = run('$1', 'param');
  expect(out).toEqual({
    type: 'param',
    index: 1,
  });
  out = run('$987654321', 'param');
  expect(out).toEqual({
    type: 'param',
    index: 987654321,
  });
});

test('opchar matches one of a specific set of characters', () => {
  let out = run('&', 'opchar');
  expect(out).toBe('&');
  expect(() => run('h', 'opchar')).toThrow();
});

test('modifier matches ->, -x and -+ but not -*', () => {
  let out = run('->', 'modifier');
  expect(out).toBe('->');
  out = run('-x', 'modifier');
  expect(out).toBe('-x');
  out = run('-+', 'modifier');
  expect(out).toBe('-+');
  expect(() => run('-*', 'modifier')).toThrow();
});

test('exprNoOp matches a param, an alphachain, or a parenthesised expression', () => {
  let out = run('$20', 'exprNoOp');
  expect(out).toEqual({
    type: 'param',
    index: 20,
  });
  out = run('users.name', 'exprNoOp');
  expect(out).toEqual({
    type: 'alphachain',
    root: 'users',
    parts: ['name'],
  });
  out = run('($1)', 'exprNoOp');
  expect(out).toEqual({ type: 'param', index: 1 });
});

test('funOrExpr matches a function or an expression', () => {
  let out = run('test($1)', 'funOrExpr');
  expect(out).toEqual({
    type: 'function',
    expr: {
      type: 'alphachain',
      root: 'test',
      parts: [],
    },
    args: [
      {
        type: 'param',
        index: 1,
      },
    ],
  });

  out = run('(test + foo)', 'funOrExpr');
  expect(out).toEqual({
    type: 'exprtree',
    op: '',
    args: [
      {
        type: 'alphachain',
        root: 'test',
        parts: [],
      },
      {
        type: 'op',
        symbol: '+',
      },
      {
        type: 'alphachain',
        root: 'foo',
        parts: [],
      },
    ],
  });
});

test('exprUnary matches prefix and postfix operators', () => {
  let out = run('!foo', 'exprUnary');
  expect(out).toEqual([
    {
      type: 'op',
      symbol: '!',
    },
    {
      type: 'alphachain',
      root: 'foo',
      parts: [],
    },
  ]);

  out = run('foo!', 'exprUnary');
  expect(out).toEqual([
    {
      type: 'alphachain',
      root: 'foo',
      parts: [],
    },
    {
      type: 'op',
      symbol: '!',
    },
  ]);

  out = run('! : foo.bar & & @', 'exprUnary');
  expect(out).toEqual([
    {
      type: 'op',
      symbol: '!',
    },
    {
      type: 'op',
      symbol: ':',
    },
    {
      type: 'alphachain',
      root: 'foo',
      parts: ['bar'],
    },
    {
      type: 'op',
      symbol: '&',
    },
    {
      type: 'op',
      symbol: '&',
    },
    {
      type: 'op',
      symbol: '@',
    },
  ]);
});

test('exprOp matches unary, binary and ternary expressions', () => {
  let out = run('!foo', 'exprOp');
  expect(out).toEqual([
    {
      type: 'op',
      symbol: '!',
    },
    {
      type: 'alphachain',
      root: 'foo',
      parts: [],
    },
  ]);

  out = run('foo + bar.baz', 'exprOp');
  expect(out).toEqual({
    type: 'exprtree',
    op: '',
    args: [
      {
        type: 'alphachain',
        root: 'foo',
        parts: [],
      },
      {
        type: 'op',
        symbol: '+',
      },
      {
        type: 'alphachain',
        root: 'bar',
        parts: ['baz'],
      },
    ],
  });

  out = run('foo + bar.baz * bat!', 'exprOp');
  expect(out).toEqual({
    type: 'exprtree',
    op: '',
    args: [
      {
        type: 'alphachain',
        root: 'foo',
        parts: [],
      },
      {
        type: 'op',
        symbol: '+',
      },
      {
        type: 'alphachain',
        root: 'bar',
        parts: ['baz'],
      },
      {
        type: 'op',
        symbol: '*',
      },
      {
        type: 'alphachain',
        root: 'bat',
        parts: [],
      },
      {
        type: 'op',
        symbol: '!',
      },
    ],
  });
});

test('expr should handle nested and non-nested expressions, and also plain params and alphachains', () => {
  let out = run('foo', 'expr');
  expect(out).toEqual({
    type: 'alphachain',
    root: 'foo',
    parts: [],
  });

  out = run('$1', 'expr');
  expect(out).toEqual({
    type: 'param',
    index: 1,
  });

  out = run('(foo.bar === $1) && !baz', 'expr');
  expect(out).toEqual({
    type: 'exprtree',
    op: '',
    args: [
      {
        type: 'exprtree',
        op: '',
        args: [
          {
            type: 'alphachain',
            root: 'foo',
            parts: ['bar'],
          },
          {
            type: 'op',
            symbol: '===',
          },
          {
            type: 'param',
            index: 1,
          },
        ],
      },
      {
        type: 'op',
        symbol: '&&',
      },
      {
        type: 'op',
        symbol: '!',
      },
      {
        type: 'alphachain',
        root: 'baz',
        parts: [],
      },
    ],
  });
});

test('exprlist should match a comma-separated series of expressions', () => {
  let out = run('$1, foo.bar, baz + $2', 'exprlist');
  expect(out).toEqual([
    {
      type: 'param',
      index: 1,
    },
    {
      type: 'alphachain',
      root: 'foo',
      parts: ['bar'],
    },
    {
      type: 'exprtree',
      op: '',
      args: [
        {
          type: 'alphachain',
          root: 'baz',
          parts: [],
        },
        {
          type: 'op',
          symbol: '+',
        },
        {
          type: 'param',
          index: 2,
        },
      ],
    },
  ]);
});

test('exprlist should return null for an empty string', () => {
  let out = run('', 'exprlist');
  expect(out).toEqual(null);
});

test('transformarg should accept an expression, a shape, or a source', () => {
  let out = run('$1', 'transformArg');
  expect(out).toEqual({
    type: 'param',
    index: 1,
  });

  out = run('{id: $2}', 'transformArg');
  expect(out).toEqual({
    type: 'source',
    alias: undefined,
    value: null,
    transforms: [],
    shape: {
      type: 'shape',
      fields: [
        {
          type: 'field',
          alias: 'id',
          value: {
            type: 'param',
            index: 2,
          },
        },
      ],
    }
  });

  // TODO: source test
});

test('transformargs should accept a series of transform args separated by commas', () => {
  let out = run('$3 , {id: $2},foo', 'transformArgs');
  expect(out).toEqual([
    {
      type: 'param',
      index: 3,
    },
    {
      type: 'source',
      alias: undefined,
      value: null,
      transforms: [],
      shape: {
        type: 'shape',
        fields: [
          {
            type: 'field',
            alias: 'id',
            value: {
              type: 'param',
              index: 2,
            },
          },
        ],
      }
    },
    {
      type: 'alphachain',
      root: 'foo',
      parts: [],
    },
  ]);
});

test('transform should match an alphachain followed by parenthesised transformArgs', () => {
  let out = run(
    `namespace.function(
      $3,
      {id: $2},
      foo,
    )`,
    'transform'
  );
  expect(out).toEqual({
    type: 'transform',
    description: {
      type: 'alphachain',
      root: 'namespace',
      parts: ['function'],
    },
    args: [
      {
        type: 'param',
        index: 3,
      },
      {
        type: 'source',
        alias: undefined,
        value: null,
        transforms: [],
        shape: {
          type: 'shape',
          fields: [
            {
              type: 'field',
              alias: 'id',
              value: {
                type: 'param',
                index: 2,
              },
            },
          ],
        }
      },
      {
        type: 'alphachain',
        root: 'foo',
        parts: [],
      },
    ],
  });
});

test('transforms should match a series of transforms separated by "|"', () => {
  let out = run(
    `| namespace.function(
      $3,
      {id: $2},
      foo,
    ) | bar()`,
    'transforms'
  );
  expect(out).toEqual([
    {
      type: 'transform',
      description: {
        type: 'alphachain',
        root: 'namespace',
        parts: ['function'],
      },
      args: [
        {
          type: 'param',
          index: 3,
        },
        {
          type: 'source',
          alias: undefined,
          value: null,
          transforms: [],
          shape: {
            type: 'shape',
            fields: [
              {
                type: 'field',
                alias: 'id',
                value: {
                  type: 'param',
                  index: 2,
                },
              },
            ],
          }
        },
        {
          type: 'alphachain',
          root: 'foo',
          parts: [],
        },
      ],
    },
    {
      type: 'transform',
      description: {
        type: 'alphachain',
        root: 'bar',
        parts: [],
      },
      args: [],
    },
  ]);
});

test('source should consist of "[base source or model] [transforms] [shape]"', () => {
  let out = run('u: users | filter(u.id = $1) {name}', 'source');
  expect(out).toEqual({
    type: 'source',
    alias: 'u',
    value: {
      type: 'alphachain',
      root: 'users',
      parts: [],
    },
    transforms: [
      {
        type: 'transform',
        args: [
          {
            type: 'exprtree',
            op: '',
            args: [
              {
                type: 'alphachain',
                root: 'u',
                parts: ['id'],
              },
              {
                type: 'op',
                symbol: '=',
              },
              {
                type: 'param',
                index: 1,
              },
            ],
          },
        ],
        description: {
          type: 'alphachain',
          root: 'filter',
          parts: [],
        },
      },
    ],
    shape: {
      type: 'shape',
      fields: [
        {
          type: 'field',
          alias: 'name',
          value: {
            type: 'alphachain',
            root: 'name',
            parts: [],
          },
        },
      ],
    },
  });
});

test('sourcelist should handle a comma-separated list of basic sources', () => {
  let out = run(
    `(
    u: users,
    o: orders
  )`,
    'sourcelist'
  );
  expect(out).toEqual([
    {
      type: 'source',
      alias: 'u',
      value: {
        type: 'alphachain',
        root: 'users',
        parts: [],
      },
      transforms: [],
      shape: null,
    },
    {
      type: 'source',
      alias: 'o',
      value: {
        type: 'alphachain',
        root: 'orders',
        parts: [],
      },
      transforms: [],
      shape: null,
    },
  ]);
});

test('dest should match a simple model, transform, and shape', () => {
  let out = run('u: users | filter() {name}', 'dest');
  expect(out).toEqual({
    type: 'dest',
    alias: 'u',
    value: 'users',
    transforms: [
      {
        type: 'transform',
        description: {
          type: 'alphachain',
          root: 'filter',
          parts: [],
        },
        args: [],
      },
    ],
    shape: {
      type: 'shape',
      fields: [
        {
          type: 'field',
          alias: 'name',
          value: {
            parts: [],
            root: 'name',
            type: 'alphachain',
          },
        },
      ],
    },
  });
});

test('shape should match a simple field in curly braces', () => {
  let out = run('{name}', 'shape');
  expect(out).toEqual({
    type: 'shape',
    fields: [
      {
        type: 'field',
        alias: 'name',
        value: {
          type: 'alphachain',
          root: 'name',
          parts: [],
        },
      },
    ],
  });
});

test('complex query', () => {
  let out = run(
    `
  (
    u: users,
    o: orders,
  ) | join(o.userId = u.id) {
    username: u.name,
    ordername: o.name,
  }
`,
    'query'
  );
  expect(out).toEqual({
    type: 'query',
    source: {
      type: 'source',
      alias: undefined,
      value: [
        {
          type: 'source',
          alias: 'u',
          value: {
            type: 'alphachain',
            root: 'users',
            parts: [],
          },
          transforms: [],
          shape: null,
        },
        {
          type: 'source',
          alias: 'o',
          value: {
            type: 'alphachain',
            root: 'orders',
            parts: [],
          },
          transforms: [],
          shape: null,
        },
      ],
      transforms: [
        {
          type: 'transform',
          description: {
            type: 'alphachain',
            root: 'join',
            parts: [],
          },
          args: [
            {
              type: 'exprtree',
              op: '',
              args: [
                {
                  type: 'alphachain',
                  root: 'o',
                  parts: ['userId'],
                },
                {
                  type: 'op',
                  symbol: '=',
                },
                {
                  type: 'alphachain',
                  root: 'u',
                  parts: ['id'],
                },
              ],
            },
          ],
        },
      ],
      shape: {
        type: 'shape',
        fields: [
          {
            type: 'field',
            alias: 'username',
            value: {
              type: 'alphachain',
              root: 'u',
              parts: ['name'],
            },
          },
          {
            type: 'field',
            alias: 'ordername',
            value: {
              type: 'alphachain',
              root: 'o',
              parts: ['name'],
            },
          },
        ],
      },
    },
    modifier: undefined,
    dest: undefined,
  });
});

test('sourceWithShape should match a simple field in curly braces', () => {
  let out = run('{name: $1}', 'sourceWithShape');
  expect(out).toEqual({
    type: 'source',
    alias: undefined,
    transforms: [],
    value: null,
    shape: {
      type: 'shape',
      fields: [
        {
          type: 'field',
          alias: 'name',
          value: {
            type: 'param',
            index: 1,
          },
        },
      ],
    }
  });
});