// async resolve(ast, queries): Promise<any> (data)
// 1. run all the queries in parallel to get the data
// 2. feed the ast through the native resolver, replacing the delegated queries with data
//    also support in-memory data access for fields whose source is the native resolver
import {
  AnyObj,
  ContextualisedSource,
  DataField,
  DataModel,
  DataSourceOpts,
  DelegatedField,
  DelegatedQuery,
  DelegatedSource,
  DelegatedQueryResult,
  ResolutionTree,
  ContextualisedField,
} from './types.js';

import Native from './native';

type Transform = (modifiers: string[], ...args: any[]) => Promise<any>;

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
