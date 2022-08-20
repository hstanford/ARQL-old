/**
 * COLLECTOR
 *
 * The Collector's role is to take a tree and delegated queries from the delegator,
 * execute the delegated queries and recombine them into the final data form.
 *
 * It is a special case of the native (js) resolver, as it shares the same methods
 * of applying transforms and shapes to source data.
 */

// async resolve(ast, queries): Promise<any> (data)
// 1. run all the queries in parallel to get the data
// 2. feed the ast through the native resolver, replacing the delegated queries with data
//    also support in-memory data access for fields whose source is the native resolver
import { DataSourceOpts, ResolutionTree } from '@arql/types';

import Native from './native.js';

export default class Collector extends Native {
  constructor(opts?: DataSourceOpts) {
    super([], opts);
  }
  async run(ast: ResolutionTree, params: any[]) {
    const results = await Promise.all(
      ast.queries.map((subtree) =>
        subtree.sources[0]?.resolve?.(subtree, null, [], params)
      )
    );

    if (ast.tree.type === 'query') {
      // TODO: handle non-array results better
      return await this.resolve(
        ast.tree,
        null,
        results.map((r) => (Array.isArray(r) ? r : [r])),
        params
      );
    } else if (ast.tree.type === 'delegatedQueryResult') {
      return results[ast.tree.index];
    }
    throw new Error('Unsupported query type');
  }
}
