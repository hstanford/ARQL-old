import type {
  ContextualisedQuery,
  ContextualisedSource,
  DataModel,
  ContextualisedExpr,
  ContextualisedField,
  DataField,
  DataSourceOpts,
  operatorOp,
  transformFn,
} from './types';
import { DataSource } from './types';

export default class Native extends DataSource<any, any> {
  transforms: Map<string, transformFn> = new Map();
  operators: Map<string, operatorOp> = new Map();
  data: any;
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
        const row = values.get(arg.from?.name) || [...values.values()][0];
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
    source: ContextualisedSource | DataModel | DataField,
    data: any,
    valueMap: Map<any, any>,
    index: number,
    results: any[],
    params: any[]
  ): Promise<number> {
    let i = index;
    if (source.type === 'source') {
      const subVals = await this.resolveSources(source, data, results, params);
      if (subVals instanceof Map) {
        for (let [key, value] of subVals.entries()) {
          valueMap.set(typeof key === 'number' ? key + index : key, value);
        }
        i += [...subVals.keys()].filter((i) => typeof i === 'number').length;
      } else {
        valueMap.set(i++, subVals);
      }
    } else if (source.type === 'datafield') {
      if (!data) throw new Error('Not yet implemented...');
      valueMap.set(i++, data[source.name]);
    } else if (source.type === 'datamodel') {
      valueMap.set(source.name, this.data[source.name]);
    }
    return i;
  }

  async resolveSources(
    source: ContextualisedSource,
    data: any,
    results: any[],
    params: any[]
  ): Promise<any> {
    let arraySource = Array.isArray(source.value)
      ? source.value
      : [source.value];
    let values = new Map();
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
        ...source.transform.args,
      );
    }
    let value = [...values.entries()][0]?.[1];
    if (values.size === 1 && source.shape?.length && value) {
      if (typeof value !== 'object') {
        throw new Error(
          `Unsupported type "${typeof value}" for shape manipulation`
        );
      }
      value = await this.resolveShape(source.shape, value, results, params);
    }
    return values.size > 1 ? values : value;
  }

  async resolveShape(
    shape: ContextualisedField[],
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
          params
        );
        shaped[key] = resolved;
      }
      out.push(shaped);
    }
    return out;
  }

  async resolveField(
    field: ContextualisedField,
    item: any,
    results: any[],
    params: any[]
  ): Promise<[string, any]> {
    if (field.type === 'datafield') {
      return [field.name, item[field.name]];
    } else if (field.type === 'source') {
      const key = field.name
        ? typeof field.name === 'string'
          ? field.name
          : field.name.parts.length
          ? field.name.parts[field.name.parts.length - 1]
          : field.name.root
        : '?';

      let data = item;
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
      return [key, await this.resolveSources(field, data, results, params)];
    } else if (field.type === 'param') {
      return [field.name || '', params[field.index]];
    }
    // ... TODO handle more field types
    else {
      throw new Error(`Not yet implemented: ${field.type}`);
    }
  }

  async resolve(
    ast: ContextualisedQuery | ContextualisedSource,
    params: any[]
  ) {
    if (ast.type === 'query' && ast.source) {
      return this.resolveSources(ast.source, null, [], params);
    } else if (ast.type === 'source') {
      return this.resolveSources(ast, null, [], params);
    } else throw new Error('Not implemented yet');
  }
}