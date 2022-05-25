# TODO

## Native source / collector

- update from multiple objects
- plug-in permissioning layer

## Contextualiser

## Delegator

- feedback optimisations in delegator (delegated queries can recieve results of other delegated queries)

## Standard transform lib

- sorting to handle expressions
- add union

## Client query builder lib

- start writing

## Other sources

- basic postgresql source
- basic redis source
- add framework for sources to indicate what support the have for:
  - expressions
  - individual operations
  - individual transforms
  - sub-expressions
  - sub-sources
  - shaping
  - aliasing in shapes
  - expressions as shape field values
  - graph-style fetches (e.g. users {orders {name}})
  - arbitrary graph walking / recursive joins ?
  - modifications of each type
  - use of external static data
  - id IN (...) type optimisations
  - subscriptions ?

## Playground

## ?

- Multi-request transactional atomicity layer (token in http header? request body key?)
- subscriptions?
