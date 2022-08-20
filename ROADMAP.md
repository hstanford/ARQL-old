# Roadmap

## Project Mission and Summary

ARQL is a query language and data access framework. It's designed to address problems with REST and GraphQL.

The goal is to make ARQL a stable, extensible and developer-friendly framework with enough inbuilt functionality that it can satisfy the data access requirements of most web applications on its own.

### Core principles

- it must be expressive enough to replace sql queries in existing coupled code
- it must have an outstanding developer UX to differentiate it from the myriad of other solutions
- it must conform primarily to the relational worldview of domain data

### Secondary principles

- language-specific keywords can be distracting: use symbols or ascii art to make queries readable
- the ability to describe the shape and fields of the data retrieved is critical
- syntax should be familiar: prefer JavaScript-like
- the tooling should be very modular: the base software should purely be a text-to-AST (abstract syntax tree) parser. Separately, the client query building library, the server-side AST interpreter and the server side data resolution libraries should share model and type definitions and have ways of constructing compound type definitions in the language of the program that uses them. The query building and data resolution libraries should also be separate.
- the interface should be deliberately resilient to injection, and therefore should not support data that could be influenced by the user (e.g. strings or numbers) directly in the query string, forcing all values to be parameterised. This should also enable easy monitoring of queries without leaking sensitive values, aggregate metrics and caching.


## Contributing

Grab a feature from the roadmap that interests you.

To install dependencies and build ARQL:

```
npm install && npm run install && npm run build
```

To run the tests:

```
npm run test
```

To reinstall dependencies after changes:

```
npm run build && npm run install
```

To start the playground:

```
npm run playground
```

## Milestones

### Aug 2022

- Properly respected source capabilities

### Sept 2022

- Pull part of native stdlib (= or !=, in or notIn, filter) into core
- Delegator feedback optimisations

### Oct 2022

- Models-level permissioning layer

### Nov 2022

- Transactions and atomicity

### Dec 2022

- Full sample application using ARQL
- Public beta release

### Dec 2023

- Full 1.0.0 release