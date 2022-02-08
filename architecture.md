# Architecture

The intention is for every part of this to be separate software components
that adhere to stable interfaces.

```
+-----------------------------------------------------+
| Client                                              |
|                  typed interface                    |
|                        |          RESULTS           |
|   Query Builder <------+             ^              |
|         |                            |              |
+---------|----------------------------|--------------+
          |                            |
      [ARQL/JSON]                   [JSON]
          |                            |
----------|----------------------------|--------------+
| Server  |                            |              |
|         v                            |              |
|       Parser                         |              |
|         |         typed interface    |              |
|         |           ^       ^        |              |
|       [AST]         |       |        |              |
|         |         models    |        |              |
|         v           |       |        |              |
|   Contextualiser  <-+-- operators    |              |
|         |           |                |              |
|         v           |                |              |
|   Query Delegator   |                |              |
|     |   |  |        |                |              |
|     v   v  v        |       Native Query Collector  |
|   Query Resolvers <-+                ^              |
|     |   |  |                         |              |
|     +---+--+-------------------------+              |
|                                                     |
+-----------------------------------------------------+
```

| Component              | Stage | Description                                                                                                  |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| Language Design        | 0.0.1 | ABNF language specification                                                                                  |
| Query Builder          | -     | client framework to create queries by combining models                                                       |
| Parser                 | 0.0.1 | parse an ARQL string into a structured AST                                                                   |
| Contextualiser         | 0.0.1 | apply custom models and transformation details to the AST                                                    |
| Query Delegator        | -     | decompose the AST into sections that can be ultimately resolved in a single query by the underlying resolver |
| Query Resolver (JSON)  | -     | consume a section of an AST and combine results from in-memory data                                          |
| Query Resolver (PG)    | -     | consume a section of an AST, build a SQL query, and fetch the results                                        |
| Native Query Collector | -     | combine data from different sources any way the operators specify                                            |
| models                 | 0.0.1 | model definitions framework                                                                                  |
| operators              | 0.0.1 | interpret expressions in the AST with custom operators                                                       |
| typed interface        | -     | type definitions to aid client framework                                                                     |
