# ARQL
Abstract Relational Query Language

## What is ARQL?

ARQL is a highly expressive but syntactically simple query language intended to provide a uniform interface to a complex data layer, decoupling the data or domain logic from business logic. The requirements on the interface language this creates are:

- it must be expressive enough to replace arbitrary sql queries in existing coupled code
- it must have an outstanding developer UX to differentiate it from the myriad of other solutions
- it must conform primarily to the relational worldview of domain data

Additionally, several other desirable features have been identified:

- language-specific keywords can be distracting: cypher has done a great job of demonstrating how ascii art can make queries readable
- the ability to describe the shape and fields of the data retrieved is critical
- syntax should be familiar: prefer JavaScript-like

## Definitions

### object

An object is a collection of values corresponding to particular fields

### base object

A base object is the equivalent of a row in a relational database or an entity in a graphical database: an object that represents a tangible thing

### model

A model is a collection of homogeneous base objects

### shape

A shape is a graphql-like nested list of fields.

### source

A collection of objects, which often contain fields from multiple base objects. A model is the most basic type of source.

### join

An operation that forms a new source from multiple other sources.

### transform

A function that forms a new source from another source. The sources are applied with a unix-style pipe symbol |

### script

A JavaScript-style expression used for filtering sources and producing custom fields in shapes.

### query

An instruction or set of instructions composed of sources and shapes. Data modification is indicated by ->

## Example Queries

Get the name of all users:

```users { name }```

Get the name of the first 10 users:

```(users | order(id) | limit(10)) { name }```
