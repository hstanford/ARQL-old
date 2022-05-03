import type {
  AnyObj,
  ContextualisedQuery,
  ContextualisedSource,
  DataModel,
  ContextualisedExpr,
  ContextualisedField,
  DataField,
  DataSourceOpts,
  DelegatedSource,
  DelegatedField,
  DelegatedQuery,
  DelegatedQueryResult,
  operatorOp,
  transformFn,
} from './types';
import { DataSource } from './types';

export default class Native extends DataSource<any, any> {
  transforms: Map<string, transformFn> = new Map();
  operators: Map<string, operatorOp> = new Map();
  data: AnyObj;
  params: any[] = [];
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
  ): Promise<[string, AnyObj[]]> {
    if (source.type === 'source') {
      if (typeof source.name !== 'string')
        throw new Error(
          `No support for ${JSON.stringify(source.name)} as a source name yet`
        );
      const subVals = await this.resolveSources(source, data, results, params);
      return [source.name, Array.isArray(subVals) ? subVals : [subVals]];
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
    params: any[]
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
      params
    );
  }

  async applyTransformsAndShape(
    source: DelegatedSource,
    intermediate: Map<string, AnyObj[]> | AnyObj[] | AnyObj | undefined,
    results: any[],
    params: any[]
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
      if (
        resolved &&
        (typeof resolved !== 'object' || !Array.isArray(resolved))
      ) {
        throw new Error(
          `Unsupported type "${typeof resolved}" for shape manipulation`
        );
      }
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
    }
    return intermediate;
  }

  async resolveShape(
    shape: DelegatedField[] | DelegatedField[][],
    source: AnyObj[] | undefined,
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
    const out: AnyObj[] = [];
    for (let item of source) {
      const shaped: AnyObj = {};
      for (let field of shape as DelegatedField[]) {
        const [key, resolved] = await this.resolveField(
          field,
          item,
          results,
          params
        );
        shaped[key] = resolved;
      }
      out.push(shaped);
    }
    return out;
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
        if (typeof field.from.name === 'string') {
          path = [field.from.name];
        } else if (field.from.name) {
          path = [field.from.name.root, ...field.from.name.parts];
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
        await this.resolveSources(field, { ...item, ...data }, results, params),
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
    }
    // ... TODO handle more field types
    else {
      throw new Error(`Not yet implemented: ${field.type}`);
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
        ...(Array.isArray(source) ? source : [source])
      );
      return await this.applyTransformsAndShape(dest, source, results, params);
    } else if (modifier === '-x') {
      if (source !== undefined) {
        throw new Error('Deletion based on source data is not supported yet');
      }

      const intermediate = await this.resolveIntermediate(
        dest,
        data,
        results,
        params
      );

      // apply transforms (e.g. a filter) but not shape to items requiring deletion
      const tmpShape = dest.shape;
      delete dest.shape;
      let toDelete = await this.applyTransformsAndShape(
        dest,
        intermediate,
        results,
        params
      );
      if (typeof dest.name !== 'string') {
        throw new Error('Unsupported destination model');
      }
      const arrToDelete = Array.isArray(toDelete) ? toDelete : [toDelete];
      // TODO: do this comparison for hidden internal UUIDs for native
      this.data[dest.name] = this.data[dest.name].filter(
        (item: AnyObj) =>
          !arrToDelete.find((other: AnyObj) => item.id === other.id)
      );

      // apply shape to data output
      delete dest.transform;
      dest.shape = tmpShape;
      return await this.applyTransformsAndShape(
        dest,
        arrToDelete,
        results,
        params
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
        params
      );
      if (typeof dest.name !== 'string') {
        throw new Error('Unsupported destination model');
      }
      const arrToUpdate = Array.isArray(toUpdate) ? toUpdate : [toUpdate];
      arrToUpdate.forEach((item: AnyObj) => Object.assign(item, source));
      // TODO: do this comparison for hidden internal UUIDs for native
      this.data[dest.name].forEach((item: AnyObj) => {
        const matching = arrToUpdate.find(
          (other: AnyObj) => item.id === other.id
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
        params
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
          source = await this.resolveSources(ast.source, data, results, params);
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
      return await this.resolveSources(ast, data, results, params);
    } else throw new Error('Not implemented yet');
  }
}
