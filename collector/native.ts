// async resolve(ast, queries): Promise<any> (data)
// 1. run all the queries in parallel to get the data
// 2. feed the ast through the native resolver, replacing the delegated queries with data
//    also support in-memory data access for fields whose source is the native resolver
import {
  ContextualisedField,
  ContextualisedSource,
  DataField,
  DataModel,
  DataSourceOpts,
} from 'arql-contextualiser';
import {
  DelegatedField,
  DelegatedQuery,
  DelegatedSource,
  DelegatedQueryResult,
  ResolutionTree,
} from 'arql-delegator';

import Native from 'arql-resolver-native';

type Transform = (modifiers: string[], ...args: any[]) => Promise<any>;

class Resolver extends Native {
  constructor(opts?: DataSourceOpts) {
    super([], opts);
  }
  async run(ast: ResolutionTree, params: any[]) {
    const results = await Promise.all(
      ast.queries.map((subtree) => subtree.sources[0]?.resolve?.(subtree, params))
    );

    if (ast.tree.type === 'query') {
      return await this.resolveQuery(ast.tree, results, params);
    } else if (ast.tree.type === 'delegatedQueryResult') {
      return results[ast.tree.index];
    }
  }

  async resolveQuery(query: DelegatedQuery, results: any[], params: any[]) {
    if (query.source && !query.dest) {
      if (query.source.type === 'source' && query.source.value) {
        return await this.resolveSources(
          query.source as ContextualisedSource, // superclass doesn't accept delegatedQueryResult
          null,
          results,
          params,
        );
      } else if (query.source.type === 'delegatedQueryResult') {
        return results[query.source.index];
      }
    } else {
      throw new Error('Not yet implemented');
    }
  }

  async resolveSource(
    source: DelegatedQueryResult | ContextualisedSource | DataModel | DataField,
    data: any,
    valueMap: Map<any, any>,
    index: number,
    results: any[],
    params: any[],
  ): Promise<any> {
    if (source.type === 'delegatedQueryResult') {
      if (source.alias) valueMap.set(source.alias, results[source.index]);
      return index;
    }
    return await super.resolveSource(source, data, valueMap, index, results, params);
  }

  async resolveField(field: DelegatedField, item: any, results: any[], params: any[]) {
    // TODO: handle delegatedQueryResults
    return super.resolveField(field as ContextualisedField, item, results, params);
  }
}

export default Resolver;
