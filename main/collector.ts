// async resolve(ast, queries): Promise<any> (data)
// 1. run all the queries in parallel to get the data
// 2. feed the ast through the native resolver, replacing the delegated queries with data
//    also support in-memory data access for fields whose source is the native resolver
import {
  ContextualisedSource,
  DataField,
  DataModel,
  DataSourceOpts,
  DelegatedField,
  DelegatedQuery,
  DelegatedSource,
  DelegatedQueryResult,
  ResolutionTree,
} from './types.js';

import Native from './native';

type Transform = (modifiers: string[], ...args: any[]) => Promise<any>;

export default class Collector extends Native {
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
      console.log(query, results, params);
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
    if (field.type === 'delegatedQueryResult') {
      return [field.alias || '', results[field.index]] as [string, any];
    } else {
      return super.resolveField(field, item, results, params);
    }
  }
}