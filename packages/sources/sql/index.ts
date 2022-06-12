import {
  DataSource,
  transformFn,
  operatorOp,
  AnyObj,
  DataSourceOpts,
  DelegatedQuery,
  DelegatedSource,
  isSource,
  DataModel,
  isDataModel,
  isDataField,
} from 'arql';
import { ContextualisedExpr, DelegatedField } from 'arql/types';

import { Query, Sql, TableWithColumns } from 'sql-ts';

interface SQLSourceOpts extends DataSourceOpts {
  db: any;
  models: any;
  sql: Sql;
}

type BaseIntermediate = Query<any> | TableWithColumns<any> | undefined;
type Intermediate = BaseIntermediate | BaseIntermediate[];

export default class SQL extends DataSource<any, any> {
  transforms: Map<string, transformFn> = new Map();
  operators: Map<string, operatorOp> = new Map();
  params: any[] = [];
  sql: Sql;
  db: any; // instantiated database client to run the queries
  models: Map<string, DataModel>;
  baseModels: Map<string, TableWithColumns<any>>;

  supportsExpressions: boolean = true;
  supportsSubExpressions: boolean = false;
  supportsSubSources: boolean = false;
  supportsShaping: boolean = true;
  supportsFieldAliasing: boolean = false;
  supportsExpressionFields: boolean = false;
  supportsGraphFields: boolean = false; // like users {orders {name}}
  supportsRecursiveJoins: boolean = false;
  supportsInsert: boolean = false;
  supportsUpdate: boolean = false;
  supportsDelete: boolean = false;
  supportsStaticDataInjection: boolean = false; // like VALUES
  supportsQueryNarrowing: boolean = false; // id IN (...) type operations
  supportsSubscriptions: boolean = false;

  constructor(opts: SQLSourceOpts) {
    super();
    this.sql = opts.sql;
    this.operators = opts.operators;
    this.transforms = opts.transforms;
    this.models = new Map();
    this.baseModels = new Map();
  }

  async resolve(
    ast: DelegatedQuery | DelegatedSource,
    data: AnyObj[] | null,
    results: AnyObj[][],
    params: any[]
  ) {
    const query = await this.resolveQueryObject(ast, data, results, params);
    // TODO: overrides to return db execute
    return query ? {query: query.toString()} : {};
  }

  async resolveQueryObject(
    ast: DelegatedQuery | DelegatedSource,
    data: AnyObj[] | null,
    results: AnyObj[][],
    params: any[]
  ) {
    let sourceQuery: Intermediate, destQuery: AnyObj | AnyObj[] | undefined;
    if (ast.type === 'query') {
      if (ast.source) {
        if (ast.source.type === 'delegatedQueryResult')
          throw new Error('Not supported');
        else
          sourceQuery = this.resolveSources(
            ast.source,
            data,
            results,
            params
          );
      }
      if (ast.dest) {
        if (ast.dest.type === 'delegatedQueryResult') {
          throw new Error('Not implemented yet');
        }
        destQuery = await this.resolveDest(ast.dest);
      }
    } else if (ast.type === 'source') {
      sourceQuery = this.resolveSources(ast, data, results, params);
    } else throw new Error('Not implemented yet');

    return sourceQuery;
  }

  resolveSourceValue(
    value: DelegatedSource["value"],
    data: any,
    results: any[],
    params: any[],
    baseQuery?: Intermediate,
  ): Intermediate {
    let query: Intermediate = baseQuery;
    if (isSource(value)) {
      query = this.resolveSources(value, data, results, params, query);
    } else if (isDataModel(value)) {
      const model = this.baseModels.get(value.name);
      if (!model) {
        throw new Error(`Could not find model ${value.name}`);
      }
      if (query) {
        if (Array.isArray(query)) {
          throw new Error('Multi sources are not supported for subselects');
        }
        query = query.from(model);
      } else {
        query = model;
      }
    }
    return query;
  }

  resolveSources(
    source: DelegatedSource,
    data: any,
    results: any[],
    params: any[],
    baseQuery?: Intermediate,
  ): Intermediate {
    let query: Intermediate = baseQuery;
    if (Array.isArray(source.value)) {
      query = source.value.map(v => {
        const resolved = this.resolveSourceValue(v, data, results, params, baseQuery);
        if (Array.isArray(resolved)) {
          throw new Error('Nested array source values are unsupported');
        }
        return resolved;
      });
    } else {
      query = this.resolveSourceValue(source.value, data, results, params, baseQuery);
    }
    if (source.transform) {
      const transform = this.transforms.get(source.transform.name);
      if (!transform) {
        throw new Error(
          `Couldn't resolve transform "${source.transform.name}"`
        );
      }
      query = transform(
        source.transform.modifier,
        params,
        query,
        ...source.transform.args
      );
    }
    if (source.shape) {
      if (Array.isArray(query)) {
        throw new Error('Multi sources must be transformed before shaping');
      }
      const fields = [];
      for (let field of source.shape) {
        if (Array.isArray(field)) {
          throw new Error('Array shapes are not supported');
        }
        fields.push(this.resolveField(query, field, params));
      }
      query = (query || this.sql).select(fields);
    }
    return query;
  }

  resolveField(query: Intermediate, field: DelegatedField, params: any[]) {
    let out: any;
    if (field.type === 'source') {
      if (!query) {
        throw new Error('Subsources without query not supported');
      }
      if (Array.isArray(query)) {
        throw new Error('Subsources from multi source are not supported');
      }
      return this.resolveSources(field, [], [], params, query.table.subQuery(field.alias));
    } else if (field.type === 'exprtree') {
      out = this.resolveExpression(query, field, params);
    } else if (isDataField(field)) {
      if (Array.isArray(query)) {
        let i = 0;
        while (!out && i < query.length) {
          const val = query[i++] as any;
          out = val[field.name] || val.table?.[field.name];
        }
      } else {
        out = (query as any)[field.name] || (query as any).table?.[field.name];
      }
      if (!out) {
        console.log(query, field.name);
        throw new Error('MISSING');
      }
    } else {
      throw new Error(`${field.type} not supported`);
    }
    if (field.alias && field.alias !== field.name)
      out = out.as(field.alias);
    return out;
  }

  resolveExpression(
    query: Intermediate,
    expression: ContextualisedExpr,
    params: any[]
  ) {
    let resolvedArgs: any[] = [];
    for (let arg of expression.args) {
      if (arg.type === 'source') {
        resolvedArgs.push(this.resolveSources(arg, [], [], params));
      } else if (arg.type === 'exprtree') {
        resolvedArgs.push(this.resolveExpression(query, arg, params));
      } else if (arg.type === 'datamodel') {
        throw new Error('Datamodels not supported in expressions');
      } else if (arg.type === 'param') {
        resolvedArgs.push(params[arg.index - 1]);
      } else if (isDataField(arg)) {
        resolvedArgs.push(this.resolveField(query, arg, params));
      } else {
        throw new Error(`Expression type ${arg.type} is not supported`);
      }
    }

    const op = this.operators.get(expression.op);
    if (!op) {
      throw new Error(`Could not find operator ${expression.op}`);
    }
    return op(...resolvedArgs);
  }

  resolveDest(dest: DelegatedSource): any {
    throw new Error('Not implemented');
  }
}
