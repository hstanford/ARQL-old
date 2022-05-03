# TODO

## Native source / collector

- insert from multiple objects
- delete based on selection
- update from multiple objects
- plug-in permissioning layer
- use internal hidden ids for modifications native data

## Parser

- express a static collection

## Delegator

- feedback optimisations in delegator (delegated queries can recieve results of other delegated queries)

## Standard transform lib

- separate standard transform lib
- sorting to handle expressions
- add union

## Client query builder lib

- start writing

## Other sources

- basic postgresql source
- basic redis source

## Playground

- better interface

## ?

- Multi-request transactional atomicity layer (token in http header? request body key?)
- subscriptions?
- Thoroughly comment codebase to make it nice enough for other people to work on
- Add support for relationships e.g. users.orders