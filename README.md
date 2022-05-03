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

## Motivation

- When writing webapps, I want to be able to retrieve my data on both the client side and the server side in whatever format I need
- I want the development time to add a new data model or field to be extremely low
- I want the API I'm interfacing with to be clear and powerful

## Why not [existing solution]

- REST doesn't support formatting of data, and you have to add endpoint boilerplate each time you add a new model
- http query languages using query params are either not clear or not powerful
- GraphQL forces a switch to a graphical worldview of your domain data while you may want to consider data access across models to be relational. This sacrifices clarity and puts cognitive load on the developer writing the resolvers, and also reduces its power: it doesn't natively support performant joins, and how to write queries that e.g. "fetch users that have orders created in May" while still maintaining full control over your output format is very unclear.

REST and GraphQL have both done a lot right. But neither are perfect, and there are areas where there is room to improve on them both.

## What is ARQL?

ARQL is a highly expressive but syntactically simple query language intended to provide a uniform interface to a complex data layer,
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

An object is a key-value representation of data: e.g. {id: 1, name: 'hello'}.
A base object is an object that is persisted somewhere (the equivalent of a row in a relational database or an entity in a graphical database).

### model

A model is a collection of homogeneous base objects.

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

A collection of objects. A model is the most basic type of source.

### transform

A function that forms a new source from another source. The sources are applied with a unix-style pipe symbol `|`.

Sources can be aliased like `u: users`, and the aliases can be used to prefix fields to reference relationships or fields in other sections.

If "users" has an "emails" relationship which specifies join conditions under the hood (assumedly in the models layer), you could form a join using `(u: users, em: u.emails) | join()`, whereas `(u: users, em: emails) | join()` would be a join to all emails. You could manually specify a join condition like: `(u: users, em: emails) | join(em.userId = u.id)`.

### expression

A logical combination of fields and/or static values used for filtering sources and producing custom fields in shapes. Full expression syntax still TBC.

### query

An instruction or set of instructions composed of sources and shapes. Data modification is indicated by `->`, data addition is indicated by `-+`, and data deletion is indicated by `-x`.
These are all meant to look like arrows indicating data from the left flowing to the right.

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
