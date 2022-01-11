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
       ARQL/JSON                     JSON
          |                            |
----------|----------------------------|--------------+
| Server  |                            |              |
|         v                            |              |
|       Parser                         |              |
|         |         typed interface    |              |
|         |           ^       ^        |              |
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
