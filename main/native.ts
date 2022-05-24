/**
 * NATIVE RESOLVER / DATA SOURCE
 *
 * The native resolver is a data source that stores data in memory
 * in js and facilitates querying it via a contextualised or delegated
 * query tree.
 */

import {
  AnyObj,
  DataModel,
  ContextualisedExpr,
  DataField,
  DataSourceOpts,
  DelegatedSource,
  DelegatedField,
  DelegatedQuery,
  DelegatedQueryResult,
  operatorOp,
  transformFn,
  isDataReference,
} from './types.js';
import { DataSource } from './types.js';
import { v4 as uuid } from 'uuid';
import { getAlias } from './util.js';

export default class Native extends DataSource<any, any> {
  transforms: Map<string, transformFn> = new Map();
  operators: Map<string, operatorOp> = new Map();
  data: AnyObj;
  params: any[] = [];

  supportsExpressions: boolean = true;
  supportsSubExpressions: boolean = true;
  supportsSubSources: boolean = true;
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
    if (opts) {
      this.operators = opts.operators;
      this.transforms = opts.transforms;
    }
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
      // TODO: handle DataModel and ContextualisedSource
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

  async resolveSource(
    source: DelegatedSource | DataModel | DataField | DelegatedQueryResult,
    data: AnyObj,
    results: any[],
    params: any[]
  ): Promise<[string, any]> {
    if (source.type === 'source') {
      if (typeof source.name !== 'string')
        throw new Error(
          `No support for ${JSON.stringify(source.name)} as a source name yet`
        );
      const subVals = await this.resolveSources(
        source,
        data,
        results,
        params,
        false
      );
      return [source.name, subVals];
    } else if (source.type === 'datafield') {
      if (!data) throw new Error('Not yet implemented...');
      return [source.name, data[source.name]];
    } else if (source.type === 'datamodel') {
      return [
        source.name,
        this.data[source.name].map((item: AnyObj) => {
          const merged = { ...data, ...item };
          merged[source.name] = merged;
          return merged;
        }),
      ];
    } else if (source.type === 'delegatedQueryResult') {
      return [
        source.alias || '',
        results[source.index].map((item: AnyObj) => {
          const merged = { ...data, ...item };
          merged[source.alias || ''] = merged;
          return merged;
        }),
      ];
    }
    throw new Error(`Unsupported source type ${(source as any)?.type}`);
  }

  async resolveSources(
    source: DelegatedSource,
    data: any,
    results: any[],
    params: any[],
    exposeAlias: boolean
  ): Promise<AnyObj[] | AnyObj> {
    const intermediate = await this.resolveIntermediate(
      source,
      data,
      results,
      params
    );
    return await this.applyTransformsAndShape(
      source,
      intermediate || data,
      results,
      params,
      exposeAlias
    );
  }

  async applyTransformsAndShape(
    source: DelegatedSource,
    intermediate: Map<string, AnyObj[]> | AnyObj[] | AnyObj | undefined,
    results: any[],
    params: any[],
    exposeAlias: boolean
  ): Promise<AnyObj[] | AnyObj> {
    let single =
      intermediate &&
      !(intermediate instanceof Map) &&
      !Array.isArray(intermediate);
    if (single) {
      intermediate = [intermediate];
    }
    let resolved: AnyObj[] | AnyObj | undefined;

    if (source.transform) {
      const transform = this.transforms.get(source.transform.name);
      if (!transform) {
        throw new Error(
          `Couldn't resolve transform "${source.transform.name}"`
        );
      }
      resolved = await transform(
        source.transform.modifier,
        params,
        intermediate,
        ...source.transform.args
      );
    } else if (Array.isArray(intermediate)) {
      resolved = intermediate;
    }

    if (source.shape?.length) {
      resolved = await this.resolveShape(
        source.shape,
        resolved,
        results,
        params
      );
    }
    if (!resolved) {
      throw new Error(`Couldn't resolve source`);
    }
    if (exposeAlias) {
      const alias = getAlias(source.alias || source.name);
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
    source: DelegatedSource,
    data: any,
    results: any[],
    params: any[]
  ): Promise<Map<string, AnyObj[]> | AnyObj[] | undefined> {
    // resolveSources should only ever produce an anyobj array
    // there's an intermediate point that for value type ContextualisedSource[]
    // you'll have a Map<string, AnyObj[]>, that will be passed into some kind of join
    let intermediate: Map<string, AnyObj[]> | AnyObj[] | undefined;
    if (Array.isArray(source.value)) {
      if (source.value.length) {
        // ContextualisedSourceArray, instanceof doesn't narrow here
        intermediate = new Map<string, AnyObj[]>();
        for (const sourceValue of source.value) {
          const [key, value] = await this.resolveSource(
            sourceValue,
            data,
            results,
            params
          );
          intermediate.set(key, value);
        }
      }
    } else if (source.value) {
      [, intermediate] = await this.resolveSource(
        source.value,
        data,
        results,
        params
      );
      if (typeof source.name === 'string' && Array.isArray(intermediate)) {
        for (const obj of intermediate) {
          if (typeof obj === 'object') {
            obj[source.name] = obj;
          }
        }
      }
    }
    return intermediate;
  }

  async resolveShape(
    shape: DelegatedField[] | DelegatedField[][],
    source: AnyObj[] | AnyObj | undefined,
    results: any[],
    params: any[]
  ): Promise<AnyObj | AnyObj[]> {
    if (Array.isArray(shape[0])) {
      const multi = [];
      for (const subShape of shape as DelegatedField[][]) {
        multi.push(await this.resolveShape(subShape, source, results, params));
      }
      return multi;
    }
    if (!source) {
      const shaped: AnyObj = {};
      for (let field of shape as DelegatedField[]) {
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
    const reShape = async (item: AnyObj) => {
      const shaped: AnyObj = {};
      for (let field of shape as DelegatedField[]) {
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
    if (Array.isArray(source)) {
      const out: AnyObj[] = [];
      for (let item of source) {
        out.push(await reShape(item));
      }
      return out;
    } else {
      return await reShape(source);
    }
  }

  async resolveField(
    field: DelegatedField,
    item: AnyObj,
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
    } else if (field.type === 'source') {
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
      return [
        key,
        await this.resolveSources(
          field,
          { ...item, ...data },
          results,
          params,
          false
        ),
      ];
    } else if (field.type === 'param') {
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
    } else if (field.type === 'datamodel') {
      const [key, out] = await this.resolveSource(field, item, results, params);
      return [
        key,
        out.map((obj: AnyObj) => {
          const picked: AnyObj = {};
          for (let datafield of field.fields) {
            if (datafield.type === 'datafield') {
              picked[datafield.name] = obj[datafield.name];
            }
          }
          return picked;
        }),
      ];
    } else {
      throw new Error('Missing field type');
    }
  }

  async resolveDest(
    dest: DelegatedSource,
    modifier: string | undefined,
    source: AnyObj | AnyObj[] | undefined,
    data: any,
    results: any[],
    params: any[]
  ): Promise<AnyObj | AnyObj[] | undefined> {
    if (modifier === '-+') {
      if (Array.isArray(dest.value) || dest.value.type !== 'datamodel') {
        throw new Error('Not supported');
      }
      if (source === undefined) {
        throw new Error('Cannot insert undefined');
      }
      this.data[dest.value.name].push(
        ...(Array.isArray(source) ? source : [source]).map((item) => ({
          ...item,
          _id: uuid(),
        }))
      );
      return await this.applyTransformsAndShape(
        dest,
        source,
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

      if (source !== undefined) {
        const sourceArr = Array.isArray(source) ? source : [source];
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
        (item: AnyObj) =>
          !arrToDelete.find((other: AnyObj) => item._id === other._id)
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
      if (Array.isArray(source) || !source) {
        throw new Error(
          'Collection or absent sources are not yet supported for updates'
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
      arrToUpdate.forEach((item: AnyObj) => Object.assign(item, source));
      // TODO: do this comparison for hidden internal UUIDs for native
      this.data[dest.name].forEach((item: AnyObj) => {
        const matching = arrToUpdate.find(
          (other: AnyObj) => item._id === other._id
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
    ast: DelegatedQuery | DelegatedSource,
    data: AnyObj[] | null,
    results: AnyObj[][],
    params: any[]
  ) {
    if (ast.type === 'query') {
      let source: AnyObj | AnyObj[] | undefined,
        dest: AnyObj | AnyObj[] | undefined;
      if (ast.source) {
        if (ast.source.type === 'delegatedQueryResult')
          source = results[ast.source.index];
        else
          source = await this.resolveSources(
            ast.source,
            data,
            results,
            params,
            !!ast.dest
          );
      }
      if (ast.dest) {
        if (ast.dest.type === 'delegatedQueryResult') {
          throw new Error('Not implemented yet');
        }
        dest = await this.resolveDest(
          ast.dest,
          ast.modifier,
          source,
          data,
          results,
          params
        );
      }
      return dest || source || [];
    } else if (ast.type === 'source') {
      return await this.resolveSources(ast, data, results, params, false);
    } else throw new Error('Not implemented yet');
  }
}
