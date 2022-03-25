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
        subtree.sources[0]?.resolve?.(subtree, params)
      )
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
          query.source, // superclass doesn't accept delegatedQueryResult
          null,
          results,
          params
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
    source: DelegatedQueryResult | DelegatedSource | ContextualisedSource | DataModel | DataField,
    data: any,
    valueMap: Map<any, any>,
    index: number,
    results: any[],
    params: any[]
  ): Promise<any> {
    if (source.type === 'delegatedQueryResult') {
      if (source.alias) valueMap.set(source.alias, results[source.index]);
      return index;
    }
    if (source.type === 'source' && source.sources.length > 1) {
      return await this.resolveSources(source, data, results, params, valueMap);
    }
    return await super.resolveSource(
      source as ContextualisedSource,
      data,
      valueMap,
      index,
      results,
      params
    );
  }

  async resolveSources(
    source: DelegatedSource,
    data: any,
    results: any[],
    params: any[],
    values: Map<any, any> = new Map()
  ): Promise<any> {
    if (source.value && (!Array.isArray(source.value) || source.value.length)) {
      let arraySource = Array.isArray(source.value)
        ? source.value
        : [source.value];
      let i = 0;
      for (const sourceValue of arraySource) {
        if (!sourceValue) continue;
        i = await this.resolveSource(
          sourceValue,
          data,
          values,
          i,
          results,
          params
        );
      }
    }
    if (source.transform) {
      const transform = this.transforms.get(source.transform.name);
      if (!transform) {
        throw new Error(
          `Couldn't resolve transform "${source.transform.name}"`
        );
      }
      values = await transform(
        source.transform.modifier,
        params,
        values,
        ...source.transform.args
      );
    }
    let value = [...values.entries()][0]?.[1];
    if (values.size <= 1 && source.shape?.length) {
      let takeFirst = false;
      if (!value) {
        value = [{}];
        takeFirst = true;
      }
      if (typeof value !== 'object') {
        throw new Error(
          `Unsupported type "${typeof value}" for shape manipulation`
        );
      }
      value = await this.resolveShape(source.shape, value, results, params);
      if (takeFirst)
        value = value[0];
    }
    return values.size > 1 ? values : value;
  }

  async resolveShape(
    shape: DelegatedField[],
    source: any[],
    results: any[],
    params: any[]
  ) {
    const out: { [key: string]: any }[] = [];
    for (let item of source) {
      const shaped: { [key: string]: any } = {};
      for (let field of shape) {
        const [key, resolved] = await this.resolveField(
          field,
          item,
          results,
          params,
        );
        shaped[key] = resolved;
      }
      out.push(shaped);
    }
    return out;
  }

  async resolveField(
    field: DelegatedField,
    item: any,
    results: any[],
    params: any[]
  ): Promise<[string, any]> {
    if (field.type === 'delegatedQueryResult') {
      return [field.alias || '', results[field.index]] as [string, any];
    } else if (field.type === 'source' && field.sources.length > 1) {
      let data;
      if (
        Array.isArray(field.value) &&
        field.value[0].type === 'delegatedQueryResult'
      ) {
        data = results[field.value[0].index];
      } else {
        data = item;
      }

      const key =
        field.alias ||
        (field.name
          ? typeof field.name === 'string'
            ? field.name
            : field.name.parts.length
            ? field.name.parts[field.name.parts.length - 1]
            : field.name.root
          : '?');

      // handle potential field overlap by grabbing data from
      // aliased fields
      if (
        !Array.isArray(field.value) &&
        field.value.type === 'datafield' &&
        typeof field.value.from?.name === 'string' &&
        field.value.from.name in data
      ) {
        data = data[field.value.from?.name];
      }
      return [key, await this.resolveSources(field, {...item, ...data}, results, params)];
    } else {
      return super.resolveField(
        field as ContextualisedField,
        item,
        results,
        params
      );
    }
  }
}
