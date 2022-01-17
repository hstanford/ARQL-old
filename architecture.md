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
|   Query Delegator <-+-- operators    |              |
|     |   |  |        |                |              |
|     v   v  v        |       Native Query Collector  |
|   Query Resolvers <-+                ^              |
|     |   |  |                         |              |
|     +---+--+-------------------------+              |
|                                                     |
+-----------------------------------------------------+
```

| Component | Stage |
|-----------|-------|
| Language Design | 0.0.1 |
| Query Builder | - |
| Parser | 0.0.1 |
| Query Delegator | - |
| Query Resolver (JSON) | - |
| Query Resolver (PG) | - |
| Native Query Collector | - |
| models | - |
| operators | 0.0.1 |
| typed interface | - |
