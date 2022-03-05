# ARQL

Abstract Relational Query Language

## Development

To install dependencies and build ARQL:
```
npm run install
```

To run the tests:
```
npm run test
```

To reinstall arql to the test dir after changes:
```
npm run rebuild
```

## Why not [existing solution]

REST is too prescriptive of what data is returned, most other http query languages rely too much on query string filtering which is awkward. GraphQL forces a switch to a graphical worldview of your domain data while you may want to consider data access across models to be relational. Additionally, graphql is very prescriptive with its application-driven resolvers and lack of native support for database-level join operations.

## What is ARQL?

ARQL is a highly expressive but syntactically simple declarative query language intended to provide a uniform interface to a complex data layer,
decoupling the data or domain logic from business logic.

The requirements on the interface language this creates are:

- it must be expressive enough to replace arbitrary sql queries in existing coupled code
- it must have an outstanding developer UX to differentiate it from the myriad of other solutions
- it must conform primarily to the relational worldview of domain data

Additionally, several other desirable features have been identified:

- language-specific keywords can be distracting: Cypher has done a great job of demonstrating how ascii art can make queries readable
- the ability to describe the shape and fields of the data retrieved is critical
- syntax should be familiar: prefer JavaScript-like
- the tooling should be very modular: the base software should purely be a text-to-AST (abstract syntax tree) parser. Separately, the client query building library, the server-side AST interpreter and the server side data resolution libraries should share model and type definitions and have ways of constructing compound type definitions in the language of the program that uses them. The query building and data resolution libraries are outside the scope of this specification.
- the interface should be deliberately resilient to injection, and therefore should not support data that could be influenced by the user (e.g. strings or numbers) directly in the query string, forcing all values to be parameterised. This should also enable easy monitoring of queries without leaking sensitive values, aggregate metrics and caching.

## Definitions

### object

An object is a collection of values corresponding to particular fields

### base object

A base object is the equivalent of a row in a relational database or an entity in a graphical database: an object that represents a tangible thing

### model

A model is a collection of homogeneous base objects

### shape

A shape is a graphql-like/javascript-like nested list of fields, surrounded by `{}` and separated by commas. For example:

```
users {
  id,
  name: firstName + lastName,
  accounts { id }
}
```

would obtain data that looks like:

```
[{
  id: 3,
  name: 'HenryStanford',
  accounts: [
    { id: 1 },
    ...
  ]
}, ...]
```

### source

A collection of objects, which often contain fields from multiple base objects. A model is the most basic type of source.

### transform

A function that forms a new source from another source. The sources are applied with a unix-style pipe symbol `|`.

Sources can be aliased like `u: users`, and the aliases can be used to prefix fields to reference relationships or fields in other sections.

If "users" has an "emails" relationship which specifies join conditions under the hood (assumedly in the models layer), you could form a join using `(u: users, em: u.emails) | join()`, whereas `(u: users, em: emails) | join()` would be a join to all emails. You could manually specify a join condition like: `(u: users, em: emails) | join(em.userId = u.id)`.

### expression

A logical combination of fields and/or static values used for filtering sources and producing custom fields in shapes. Full expression syntax still TBC.

### query

An instruction or set of instructions composed of sources and shapes. Data modification is indicated by `->`, data addition is indicated by `-+`.

The most complicated query is composed like:

```
source shape -> model shape
```

Which is this equivalent to the SQL `UPDATE ... SET ... FROM ... RETURNING ...`.

## Request format

A typical request should be sent over HTTP to `POST /arql` and send JSON with the following format:

```
{
  query: <string: the ARQL query>,
  params: <array: the variable parameters referenced in the ARQL query>
}
```

## Example Queries

### Basic read and transform

Get the name of all users:

```
query: 'users { name }',
params: []
```

Get the name of the first 10 users:

```
query: 'users | order(id) | limit($1) { name }',
params: [10]
```

### Delete

Delete user 10

```
query: '-> users | filter(id = $1)',
params: [10]
```

### Basic Update

Update user 10's name to "TEST"

```
query: '{name: $1} -> users | filter(id = $2)',
params: ['TEST', 10]
```

### Update All vs Insert

Update all users' names to "TEST"

```
query: '{name: $1} -> users',
params: ['TEST']
```

Insert a user with name "TEST"

```
query: '{name: $1} -+ users',
params: ['TEST']
```

### A more complex real-world example

```
query: '
  (
    (
      (
        c: conversations,
        cp: c.participants | filter(cp.conversationRoleId = $1),
        usr: c.participants | filter(!cp.conversationRoleId),
      ) | join(),
      cm: c.messages,
    )
      | join.left()
      | unique(c.id)
      | order.desc.nullsLast(cm.createdAt)
    {
      c.id,
      read: !cm.createdAt ? 1=1 : !cp.lastReadAt ? 1!=1 : cp.lastReadAt >= cm.createdAt,
      cm.content,
      cm.createdAt,
      usr.userId,
    }
  )
    | filter(id = $2)
    | order.desc.nullsLast(createdAt)
    | limit($3)
    | offset($4)
  {
    id,
    userId,
    read,
    content,
  }
',
params: [1, 5, 20, 0],

