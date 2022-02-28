// async resolve(ast, queries): Promise<any> (data)
// 1. run all the queries in parallel to get the data
// 2. feed the ast through the native resolver, replacing the delegated queries with data
//    also support in-memory data access for fields whose source is the native resolver
import { ContextualisedSource } from 'arql-contextualiser';
import {
  DelegatedField,
  DelegatedQuery,
  DelegatedSource,
  DelegatedQueryResult,
  ResolutionTree,
} from 'arql-delegator';

type Transform = (modifiers: string[], ...args: any[]) => Promise<any>;

class Resolver {
  transforms: Map<string, Transform>;
  constructor(transforms: Map<string, Transform>) {
    this.transforms = transforms;
  }
  async resolve(ast: ResolutionTree) {
    const results = await Promise.all(
      ast.queries.map((subtree) => subtree.sources[0]?.resolve?.(subtree))
    );

    if (ast.tree.type === 'query') {
      return await this.resolveQuery(ast.tree, results);
    } else if (ast.tree.type === 'delegatedQueryResult') {
      return results[ast.tree.index];
    }
  }

  async resolveQuery(query: DelegatedQuery, results: any[]) {
    if (query.source && !query.dest) {
      if (query.source.type === 'source') {
        return this.resolveSource(query.source, null, results);
      } else if (query.source.type === 'delegatedQueryResult') {
        return results[query.source.index];
      }
    } else {
      throw new Error('Not yet implemented');
    }
  }

  async resolveSource(source: DelegatedSource, data: any, results: any[]): Promise<any> {
    let arraySource = Array.isArray(source.value)
      ? source.value
      : [source.value];
    let values = new Map();
    let i = 0;
    for (const sourceValue of arraySource) {
      if (!sourceValue) continue;
      if (sourceValue.type === 'source') {
        const subVals = await this.resolveSource(sourceValue, data, results);
        if (subVals instanceof Map) {
          for (let [key, value] of subVals.entries()) {
            values.set(typeof key === 'number' ? key + i : key, value);
          }
          i += [...subVals.keys()].filter(i => typeof i === 'number').length;
        } else {
          values.set(i++, subVals);
        }
      }
      else if (sourceValue.type === 'delegatedQueryResult') {
        if (sourceValue.alias)
          values.set(sourceValue.alias, results[sourceValue.index]);
      } else if (sourceValue.type === 'datafield') {
        if (!data) throw new Error('Not yet implemented...');
        values.set(i++, data[sourceValue.name]);
      }
      // ... handle more source val types
      else {
        throw new Error(`Not yet implemented: ${sourceValue.type}`);
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
        values,
        ...source.transform.args,
      );
    }
    let value = values.get(0);
    if (values.size === 1 && source.shape?.length && value) {
      if (typeof value !== 'object') {
        throw new Error(
          `Unsupported type "${typeof value}" for shape manipulation`
        );
      }
      value = await this.resolveShape(source.shape, value, results);
    }
    return values.size > 1 ? values : value;
  }

  async resolveShape(shape: DelegatedField[], source: any[], results: any[]) {
    const out: { [key: string]: any }[] = [];
    for (let item of source) {
      const shaped: { [key: string]: any } = {};
      for (let field of shape) {
        if (field.type === 'datafield') {
          shaped[field.name] = item[field.name];
        } else if (field.type === 'source') {
          const key = field.name
            ? typeof field.name === 'string'
              ? field.name
              : field.name.parts.length
              ? field.name.parts[field.name.parts.length - 1]
              : field.name.root
            : '?';

          let data = item;
          if (!Array.isArray(field.value) && field.value.type === 'datafield' && typeof field.value.from?.name === 'string') {
            data = data[field.value.from?.name];
          }
          shaped[key] = await this.resolveSource(field, data, results);
        }
        // ... handle more field types
        else {
          throw new Error(`Not yet implemented: ${field.type}`);
        }
      }
      out.push(shaped);
    }
    return out;
  }
}

export default Resolver;
