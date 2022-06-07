# ARQL

ARQL (Abstract Relational Query Language) is a query language and data access framework.

It provides a uniform interface to a complex data layer, decoupling the data logic from business logic.

Think GraphQL but with proper relational support, more straightforward syntax, and less development work to adopt.

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

- it must be expressive enough to replace sql queries in existing coupled code
- it must have an outstanding developer UX to differentiate it from the myriad of other solutions
- it must conform primarily to the relational worldview of domain data

Additionally, several other desirable features have been identified:

- language-specific keywords can be distracting: Cypher has done a great job of demonstrating how ascii art can make queries readable
- the ability to describe the shape and fields of the data retrieved is critical
- syntax should be familiar: prefer JavaScript-like
- the tooling should be very modular: the base software should purely be a text-to-AST (abstract syntax tree) parser. Separately, the client query building library, the server-side AST interpreter and the server side data resolution libraries should share model and type definitions and have ways of constructing compound type definitions in the language of the program that uses them. The query building and data resolution libraries are outside the scope of this specification.
- the interface should be deliberately resilient to injection, and therefore should not support data that could be influenced by the user (e.g. strings or numbers) directly in the query string, forcing all values to be parameterised. This should also enable easy monitoring of queries without leaking sensitive values, aggregate metrics and caching.

## Core Concepts

A _Shape_ is a collection of keys and values. Each key-value pair is called a _Field_.

The most basic building block of any query is a _Model_, which presents the shape of some data that's accessible outside ARQL.
The database, api, or wherever else the data is accessible outside ARQL is its _Source_.
Several models can belong to one source.

Models are the most simple forms of a _Collection_, which is an intermediate structure of the data.
Collections consist of an inner collection (which could be a model or another intermediate collection) and several _Transforms_,
which are used to transform the data from one collection into another e.g. filter, sort.
A special kind of transform is the _Reshape_, which can be used to declare the output shape in terms of the input shape.

## Definitions

### reshape

A reshape is written as a graphql-like/javascript-like nested list of fields, surrounded by `{}` and separated by commas. For example:

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

### transform

A transform is written as function that forms a new collection from another collection. The transforms are applied with a unix-style pipe symbol `|`, e.g. `users | filter(users.id = $1)`.

### expression

A logical combination of fields and/or static values. Expressions can be used as transform arguments and as field values in reshapes. The syntax is entirely configurable, but the standard libraries provide a set of javascript-like operators.

### collections

Collections can be aliased like `u: users`, and the aliases can be used to prefix fields to reference relationships or fields in other sections.

It may be necessary to combine multiple collections together, via a join, union or similar.
This is done by separating the collections with commas, wrapping them in parentheses, and applying the combining filter.
It may look like this:

```
(
  users | filter(name = $1) { id, name },
  o: orders
) | join(users.id = o.userId)
```

### query

A query is expressed as an instruction or set of instructions composed of collections.
Data modification is indicated by `->`, data addition is indicated by `-+`, and data deletion is indicated by `-x`.
Visually, these tokens represent arrows indicating data from the left flowing to the right.

The most complicated query is composed like:

```
collection -> collection
```

If both collections are reshaped, this is this equivalent to the SQL `UPDATE ... SET ... FROM ... RETURNING ...`.

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
query: 'users | sort(id) | limit($1) { name }',
params: [10]
```

### Delete

Delete user 10

```
query: '-x users | filter(id = $1)',
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
