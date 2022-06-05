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
  isModel,
  isDataModel,
  isDataField,
} from 'arql';
import { ContextualisedExpr, DelegatedField } from 'arql/types';

import type { BaseDataField, DataTypes } from 'arql';
import { ModelsTypes } from './models';
import { Query, Sql, TableWithColumns } from 'sql-ts';

interface SQLSourceOpts extends DataSourceOpts {
  db: any;
  models: any;
  sql: Sql;
}

type Intermediate = Query<any> | TableWithColumns<any> | undefined;

type Table = string;

interface From {
  root: Table | SubQuery;
  joins: [Table | SubQuery, SqlExprTree][]
}

interface SubQuery {

}

interface SqlExprTree {

}

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
    let sourceQuery: Intermediate, destQuery: AnyObj | AnyObj[] | undefined;
    if (ast.type === 'query') {
      if (ast.source) {
        if (ast.source.type === 'delegatedQueryResult')
          throw new Error('Not supported');
        else
          sourceQuery = await this.resolveSources(
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
      sourceQuery = await this.resolveSources(ast, data, results, params);
    } else throw new Error('Not implemented yet');

    // return db execute
    console.log(sourceQuery ? sourceQuery.toString() : []);
    return [];
  }

  async resolveSources(
    source: DelegatedSource,
    data: any,
    results: any[],
    params: any[]
  ): Promise<Intermediate> {
    let query: Intermediate;
    if (isSource(source.value)) {
      query = await this.resolveSources(source.value, data, results, params);
    } else if (isDataModel(source.value)) {
      query = this.baseModels.get(source.value.name);
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
      throw new Error('Subsources not supported');
    } else if (field.type === 'exprtree') {
      out = this.resolveExpression(query, field, params);
    } else if (isDataField(field)) {
      out = (query as any)[field.name] || (query as any).table?.[field.name];
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
