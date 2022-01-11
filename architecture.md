# Architecture

```
+-----------------------------------------------------+
| Client                                              |
|                  typed interface                    |
|                        |          RESULTS           |
|   Query Builder <------+             ^              |
|         |                            |              |
+---------|----------------------------|--------------+
          |                            |
       ARQL/JSON                     JSON
          |                            |
----------|----------------------------|--------------+
| Server  |                            |              |
|         v                            |              |
|       Parser                         |              |
|         |         typed interface    |              |
|         v           ^       ^        |              |
|        AST          |       |        |              |
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
