# Example Single-database Postgres Abstraction

To run:
- install dependencies
- edit models.ts to fill in your models definition. Format should be e.g.
```
{
  users: {
    id: {
      type: 'datafield',
      datatype: 'string',
    },
  },
}
```
- edit the call to arql in index.ts to make the query you want
- call `CONNECTION_STRING="<my connection string>" node --loader ts-node/esm index.ts`