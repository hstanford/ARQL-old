/**
 * NATIVE RESOLVER / DATA SOURCE
 *
 * The native resolver is a data source that stores data in memory
 * in js and facilitates querying it via a contextualised or delegated
 * query tree.
 */

import {
  ContextualisedCollection,
  ContextualisedExpr,
  ContextualisedField,
  DataField,
  DataModel,
  DataSource,
  DataSourceOpts,
  DelegatedQuery,
  DelegatedQueryResult,
  Dictionary,
  isCollection,
  isDataModel,
  isDataReference,
  isParam,
  isTransform,
  operatorOp,
  transformFn,
} from '@arql/types';
import { v4 as uuid } from 'uuid';
import { getAlias } from './util.js';

export default class Native extends DataSource<any, any> {
  transforms: Map<string, transformFn> = new Map();
  operators: Map<string, operatorOp> = new Map();
  data: Dictionary;
  params: any[] = [];

  supportsExpressions: boolean = true;
  supportsSubExpressions: boolean = true;
  supportsSubCollections: boolean = true;
  supportsShaping: boolean = true;
  supportsFieldAliasing: boolean = true;
  supportsExpressionFields: boolean = true;
  supportsGraphFields: boolean = true; // like users {orders {name}}
  supportsRecursiveJoins: boolean = false;
  supportsInsert: boolean = true;
  supportsUpdate: boolean = true;
  supportsDelete: boolean = true;
  supportsStaticDataInjection: boolean = true; // like VALUES
  supportsQueryNarrowing: boolean = false; // id IN (...) type operations
  supportsSubscriptions: boolean = false;

  constructor(data: any, opts?: DataSourceOpts) {
    super();
    this.data = data;
  }

  add(def: DataModel) {
    this.models.set(def.name, def);
  }

  resolveExpr(expr: ContextualisedExpr, values: Map<any, any>, params: any[]) {
    const resolvedArgs: any[] = expr.args.map((arg) => {
      if (arg.type === 'exprtree') return this.resolveExpr(arg, values, params);
      else if (arg.type === 'datafield') {
        // TODO: make this more robust
        let row = values.get(arg.from?.name) || [...values.values()][0];
        if (
          typeof arg.from?.name === 'string' &&
          typeof row === 'object' &&
          arg.from.name in row
        ) {
          row = row[arg.from.name];
        }
        return row?.[arg.name];
      } else if (arg.type === 'param') {
        return params[arg.index - 1];
      } else throw new Error('Not implemented');
      // TODO: handle DataModel and ContextualisedCollection
    });
    const opFn = this.operators.get(expr.op);
    if (!opFn) throw new Error(`Couldn't find operator ${expr.op}`);
    return opFn.apply(this, resolvedArgs);
  }

  getField(modelName: string, fieldName: string, ...parts: any[]): any {
    let field = this.models.get(modelName)?.[fieldName];
    for (const part of parts) {
      field = field?.[part];
    }
    return field;
  }

  async resolveCollection(
    collection:
      | ContextualisedCollection
      | DataModel
      | DataField
      | DelegatedQueryResult,
    data: Dictionary,
    results: any[],
    params: any[]
  ): Promise<[string, any]> {
    if (isCollection(collection)) {
      if (typeof collection.name !== 'string')
        throw new Error(
          `No support for ${JSON.stringify(
            collection.name
          )} as a collection name yet`
        );
      const subVals = await this.resolveCollections(
        collection,
        data,
        results,
        params,
        false
      );
      return [collection.name, subVals];
    } else if (collection.type === 'datafield') {
      if (!data) throw new Error('Not yet implemented...');
      return [collection.name, data[collection.name]];
    } else if (collection.type === 'datamodel') {
      return [
        collection.name,
        this.data[collection.name].map((item: Dictionary) => {
          const merged = { ...data, ...item };
          merged[collection.name] = merged;
          return merged;
        }),
      ];
    } else if (collection.type === 'delegatedQueryResult') {
      return [
        collection.alias || '',
        results[collection.index].map((item: Dictionary) => {
          const merged = { ...data, ...item };
          merged[collection.alias || ''] = merged;
          return merged;
        }),
      ];
    }
    throw new Error(`Unsupported collection type ${(collection as any)?.type}`);
  }

  async resolveCollections(
    collection: ContextualisedCollection,
    data: any,
    results: any[],
    params: any[],
    exposeAlias: boolean
  ): Promise<Dictionary[] | Dictionary> {
    const intermediate = await this.resolveIntermediate(
      collection,
      data,
      results,
      params
    );
    return await this.applyTransformsAndShape(
      collection,
      intermediate || data,
      results,
      params,
      exposeAlias
    );
  }

  async applyTransformsAndShape(
    collection: ContextualisedCollection,
    intermediate: Map<string, Dictionary[]> | Dictionary[] | Dictionary | undefined,
    results: any[],
    params: any[],
    exposeAlias: boolean
  ): Promise<Dictionary[] | Dictionary> {
    let single =
      intermediate &&
      !(intermediate instanceof Map) &&
      !Array.isArray(intermediate);
    if (single) {
      intermediate = [intermediate];
    }
    let resolved: Dictionary[] | Dictionary | undefined;

    if (collection.transform) {
      const transform = this.transforms.get(collection.transform.name);
      if (!transform) {
        throw new Error(
          `Couldn't resolve transform "${collection.transform.name}"`
        );
      }
      resolved = await transform(
        collection.transform.modifier,
        params,
        intermediate,
        ...collection.transform.args
      );
    } else if (Array.isArray(intermediate)) {
      resolved = intermediate;
    }

    if (collection.shape?.length) {
      resolved = await this.resolveShape(
        collection.shape,
        resolved,
        results,
        params
      );
    }
    if (!resolved) {
      throw new Error(`Couldn't resolve collection`);
    }
    if (exposeAlias) {
      const alias = getAlias(collection.alias || collection.name);
      if (Array.isArray(resolved)) {
        for (let item of resolved) {
          item[alias] = item;
        }
      } else {
        resolved[alias] = resolved;
      }
    }
    return single && Array.isArray(resolved) ? resolved[0] : resolved;
  }

  async resolveIntermediate(
    collection: ContextualisedCollection,
    data: any,
    results: any[],
    params: any[]
  ): Promise<Map<string, Dictionary[]> | Dictionary[] | undefined> {
    // resolveCollections should only ever produce an Dictionary array
    // there's an intermediate point that for value type ContextualisedCollection[]
    // you'll have a Map<string, Dictionary[]>, that will be passed into some kind of join
    let intermediate: Map<string, Dictionary[]> | Dictionary[] | undefined;
    if (Array.isArray(collection.value)) {
      if (collection.value.length) {
        // ContextualisedCollectionArray, instanceof doesn't narrow here
        intermediate = new Map<string, Dictionary[]>();
        for (const collectionValue of collection.value) {
          const [key, value] = await this.resolveCollection(
            collectionValue,
            data,
            results,
            params
          );
          intermediate.set(key, value);
        }
      }
    } else if (collection.value) {
      [, intermediate] = await this.resolveCollection(
        collection.value,
        data,
        results,
        params
      );
      if (typeof collection.name === 'string' && Array.isArray(intermediate)) {
        for (const obj of intermediate) {
          if (typeof obj === 'object') {
            obj[collection.name] = obj;
          }
        }
      }
      // attempt to only hold onto the required fields
      if (Array.isArray(intermediate)) {
        const filtered = await this.resolveShape(
          collection.requiredFields,
          intermediate,
          results,
          params
        );
        if (!Array.isArray(filtered)) {
          throw new Error('Unexpected non-array filtering keys');
        }
        // keep all nested objects. TODO: don't keep them except
        // - collections selected on their own in a shape
        // - filter the keys of other collections to only what's required
        for (let key in intermediate) {
          if (typeof intermediate[key] === 'object') {
            filtered[key] = intermediate[key];
          }
        }
        intermediate = filtered;
      }
    }
    return intermediate;
  }

  async resolveShape(
    shape: ContextualisedField[] | ContextualisedField[][],
    collection: Dictionary[] | Dictionary | undefined,
    results: any[],
    params: any[]
  ): Promise<Dictionary | Dictionary[]> {
    if (Array.isArray(shape[0])) {
      const multi = [];
      for (const subShape of shape as ContextualisedField[][]) {
        multi.push(
          await this.resolveShape(subShape, collection, results, params)
        );
      }
      return multi;
    }
    if (!collection) {
      const shaped: Dictionary = {};
      for (let field of shape as ContextualisedField[]) {
        if (isDataReference(field)) continue;
        const [key, resolved] = await this.resolveField(
          field,
          {},
          results,
          params
        );
        shaped[key] = resolved;
      }
      return shaped;
    }
    const reShape = async (item: Dictionary) => {
      const shaped: Dictionary = {};
      for (let field of shape as ContextualisedField[]) {
        if (isDataReference(field)) continue;
        const [key, resolved] = await this.resolveField(
          field,
          item,
          results,
          params
        );
        shaped[key] = resolved;
      }
      return shaped;
    };
    if (Array.isArray(collection)) {
      const out: Dictionary[] = [];
      for (let item of collection) {
        out.push(await reShape(item));
      }
      return out;
    } else {
      return await reShape(collection);
    }
  }

  async resolveField(
    field: ContextualisedField,
    item: Dictionary,
    results: any[],
    params: any[]
  ): Promise<[string, any]> {
    if (field.type === 'delegatedQueryResult') {
      return [field.alias || '', results[field.index]] as [string, any];
    } else if (field.type === 'datafield') {
      let path: string[] = [];
      if (field.from) {
        const name = field.from.name || field.from.alias;
        if (typeof name === 'string') {
          path = [name];
        } else if (name) {
          path = [name.root, ...name.parts];
        }
      }
      let value = item;
      for (let key of path) {
        if (key in value) value = value[key];
      }
      return [field.alias || field.name, value[field.name]];
    } else if (isCollection(field)) {
      // TODO: review this section
      let data;
      if (
        Array.isArray(field.value) &&
        field.value.length &&
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
      let collection = await this.resolveCollections(
        field,
        { ...item, ...data },
        results,
        params,
        false
      );

      // fields of type collection need to have a
      // definitive output shape
      if (!field.shape) {
        collection = await this.resolveShape(
          field.availableFields,
          collection,
          results,
          params
        );
      }
      return [key, collection];
    } else if (isParam(field)) {
      return [field.alias || field.name || '', params[field.index - 1]];
    } else if (field.type === 'exprtree') {
      const op = this.operators.get(field.op);
      if (!op) throw new Error(`Operator not implemented: ${field.op}`);
      let args = [];
      for (const arg of field.args) {
        const [, resolved] = await this.resolveField(
          arg,
          item,
          results,
          params
        );
        args.push(resolved);
      }
      return [field.alias || '', op(...args)];
    } else if (isDataModel(field)) {
      const [key, out] = await this.resolveCollection(
        field,
        item,
        results,
        params
      );
      return [
        key,
        out.map((obj: Dictionary) => {
          const picked: Dictionary = {};
          for (let datafield of field.fields) {
            if (datafield.type === 'datafield') {
              picked[datafield.name] = obj[datafield.name];
            }
          }
          return picked;
        }),
      ];
    } else if (isTransform(field)) {
      const transform = this.transforms.get(field.name);
      if (!transform) {
        throw new Error(`Couldn't resolve transform "${field.name}"`);
      }
      return [
        field.alias || field.name,
        await transform(field.modifier, params, item, ...field.args),
      ];
    } else {
      throw new Error('Missing field type');
    }
  }

  async resolveDest(
    dest: ContextualisedCollection,
    modifier: string | undefined,
    sourceCollection: Dictionary | Dictionary[] | undefined,
    data: any,
    results: any[],
    params: any[]
  ): Promise<Dictionary | Dictionary[] | undefined> {
    if (modifier === '-+') {
      if (Array.isArray(dest.value) || dest.value.type !== 'datamodel') {
        throw new Error('Not supported');
      }
      if (sourceCollection === undefined) {
        throw new Error('Cannot insert undefined');
      }
      this.data[dest.value.name].push(
        ...(Array.isArray(sourceCollection)
          ? sourceCollection
          : [sourceCollection]
        ).map((item) => ({
          ...item,
          _id: uuid(),
        }))
      );
      return await this.applyTransformsAndShape(
        dest,
        sourceCollection,
        results,
        params,
        false
      );
    } else if (modifier === '-x') {
      let intermediate = await this.resolveIntermediate(
        dest,
        data,
        results,
        params
      );

      if (sourceCollection !== undefined) {
        const sourceArr = Array.isArray(sourceCollection)
          ? sourceCollection
          : [sourceCollection];
        if (Array.isArray(intermediate)) {
          const out = [];
          for (let item of intermediate) {
            for (let s of sourceArr) {
              out.push({ ...s, ...item });
            }
          }
          intermediate = out;
        } else {
          throw new Error('Unsupported');
        }
        //throw new Error('Deletion based on source data is not supported yet');
      }

      // apply transforms (e.g. a filter) but not shape to items requiring deletion
      const tmpShape = dest.shape;
      delete dest.shape;
      let toDelete = await this.applyTransformsAndShape(
        dest,
        intermediate,
        results,
        params,
        false
      );
      if (typeof dest.name !== 'string') {
        throw new Error('Unsupported destination model');
      }
      const arrToDelete = Array.isArray(toDelete) ? toDelete : [toDelete];
      // TODO: do this comparison for hidden internal UUIDs for native
      this.data[dest.name] = this.data[dest.name].filter(
        (item: Dictionary) =>
          !arrToDelete.find((other: Dictionary) => item._id === other._id)
      );

      // apply shape to data output
      delete dest.transform;
      dest.shape = tmpShape;
      return await this.applyTransformsAndShape(
        dest,
        arrToDelete,
        results,
        params,
        false
      );
    } else if (modifier === '->') {
      if (Array.isArray(sourceCollection) || !sourceCollection) {
        throw new Error(
          'Collection or absent collections are not yet supported for updates'
        );
      }
      const intermediate = await this.resolveIntermediate(
        dest,
        data,
        results,
        params
      );
      const tmpShape = dest.shape;
      delete dest.shape;
      let toUpdate = await this.applyTransformsAndShape(
        dest,
        intermediate,
        results,
        params,
        false
      );
      if (typeof dest.name !== 'string') {
        throw new Error('Unsupported destination model');
      }
      const arrToUpdate = Array.isArray(toUpdate) ? toUpdate : [toUpdate];
      arrToUpdate.forEach((item: Dictionary) =>
        Object.assign(item, sourceCollection)
      );
      // TODO: do this comparison for hidden internal UUIDs for native
      this.data[dest.name].forEach((item: Dictionary) => {
        const matching = arrToUpdate.find(
          (other: Dictionary) => item._id === other._id
        );
        Object.assign(item, matching);
      });
      // apply shape to data output
      delete dest.transform;
      dest.shape = tmpShape;
      return await this.applyTransformsAndShape(
        dest,
        arrToUpdate,
        results,
        params,
        false
      );
    } else {
      throw new Error(`Modifier ${modifier} not supported yet`);
    }
  }

  async resolve(
    ast: DelegatedQuery | ContextualisedCollection,
    data: Dictionary[] | null,
    results: Dictionary[][],
    params: any[]
  ) {
    if (ast.type === 'query') {
      let collection: Dictionary | Dictionary[] | undefined,
        dest: Dictionary | Dictionary[] | undefined;
      if (ast.sourceCollection) {
        if (ast.sourceCollection.type === 'delegatedQueryResult')
          collection = results[ast.sourceCollection.index];
        else {
          collection = await this.resolveCollections(
            ast.sourceCollection,
            data,
            results,
            params,
            !!ast.dest
          );
          // when queries without a top-level shape
          // only return whitelisted fields
          if (!ast.sourceCollection.shape) {
            collection = await this.resolveShape(
              ast.sourceCollection.availableFields,
              collection,
              results,
              params
            );
          }
        }
      }
      if (ast.dest) {
        if (ast.dest.type === 'delegatedQueryResult') {
          throw new Error('Not implemented yet');
        }
        dest = await this.resolveDest(
          ast.dest,
          ast.modifier,
          collection,
          data,
          results,
          params
        );
      }
      return dest || collection || [];
    } else if (ast.type === 'collection') {
      let collection = await this.resolveCollections(
        ast,
        data,
        results,
        params,
        false
      );
      // only return whitelisted fields from delegated
      // queries. Perhaps this should be requiredFields?
      if (!ast.shape) {
        collection = await this.resolveShape(
          ast.availableFields,
          collection,
          results,
          params
        );
      }
      return collection;
    } else throw new Error('Not implemented yet');
  }
}
