import {
  DataSource,
  transformFn,
  operatorOp,
  AnyObj,
  DataSourceOpts,
  DelegatedQuery,
  DelegatedCollection,
  isCollection,
  DataModel,
  isDataModel,
  isDataField,
  BaseModel,
  ContextualisedExpr,
  DelegatedField,
  isParam,
  isDataReference,
  DataField,
  getAlias,
  isTransform,
} from '@arql/core';

import {
  FromNode,
  Query,
  Sql,
  TableWithColumns,
  Node,
  ColumnNode,
  Table,
} from 'sql-ts';

interface SQLSourceOpts extends DataSourceOpts {
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
  supportsSubCollections: boolean = false;
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
    this.models = new Map();
    this.baseModels = new Map();
  }

  getModel<T extends string, U extends {}>(key: T): TableWithColumns<U> {
    const out = this.baseModels.get(key);
    if (!out) throw new Error('Could not find model');
    return out as any;
  }
  setModel<T extends string, U extends BaseModel, V extends {}>(
    key: T,
    definition: U
  ) {
    type FieldKey = keyof U & string;
    const columnKeys = Object.keys(definition).filter(function (
      k
    ): k is FieldKey {
      return typeof k === 'string';
    }) as FieldKey[];
    const subDef = definition;
    this.baseModels.set(
      key,
      this.sql.define<V>({
        name: key,
        columns: columnKeys.filter(function (k) {
          const val = subDef[k] as any;
          return val.type === 'datafield';
        }),
      })
    );
  }

  async resolve(
    ast: DelegatedQuery | DelegatedCollection,
    data: AnyObj[] | null,
    results: AnyObj[][],
    params: any[]
  ): Promise<any> {
    const query = await this.resolveQueryObject(ast, data, results, params);
    // TODO: overrides to return db execute
    return query ? { query: query.toString() } : {};
  }

  async resolveQueryObject(
    ast: DelegatedQuery | DelegatedCollection,
    data: AnyObj[] | null,
    results: AnyObj[][],
    params: any[]
  ) {
    let sourceQuery: Intermediate, destQuery: AnyObj | AnyObj[] | undefined;
    if (ast.type === 'query') {
      if (ast.sourceCollection) {
        if (ast.sourceCollection.type === 'delegatedQueryResult')
          throw new Error('Not supported');
        else
          sourceQuery = this.resolveCollections(
            ast.sourceCollection,
            data,
            results,
            params,
            []
          );
      }
      if (ast.dest) {
        if (ast.dest.type === 'delegatedQueryResult') {
          throw new Error('Not implemented yet');
        }
        destQuery = await this.resolveDest(ast.dest);
      }
    } else if (isCollection(ast)) {
      sourceQuery = this.resolveCollections(ast, data, results, params, []);
    } else throw new Error('Not implemented yet');

    return sourceQuery;
  }

  resolveCollectionValue(
    value: DelegatedCollection['value'],
    data: any,
    results: any[],
    params: any[],
    contextQueries: Intermediate[],
    baseQuery: Intermediate = undefined,
    isSubQuery: boolean = false
  ): Intermediate {
    let query: Intermediate = baseQuery;
    if (isCollection(value)) {
      query = this.resolveCollections(
        value,
        data,
        results,
        params,
        contextQueries,
        query,
        isSubQuery
      );
    } else if (isDataModel(value)) {
      const model = this.baseModels.get(value.name);
      if (!model) {
        throw new Error(`Could not find model ${value.name}`);
      }
      if (query) {
        if (Array.isArray(query)) {
          throw new Error('Multi collections are not supported for subselects');
        }
        query = query.from(model);
      } else {
        query = isSubQuery ? model.subQuery(value.alias || value.name) : model;
      }
    }
    return query;
  }

  resolveCollections(
    collection: DelegatedCollection,
    data: any,
    results: any[],
    params: any[],
    contextQueries: Intermediate[],
    baseQuery: Intermediate = undefined,
    isSubQuery: boolean = false
  ): Intermediate {
    let query: Intermediate = baseQuery;
    if (Array.isArray(collection.value)) {
      if (collection.value.length) {
        query = collection.value.map((v) => {
          const resolved = this.resolveCollectionValue(
            v,
            data,
            results,
            params,
            contextQueries,
            baseQuery,
            true
          );
          if (Array.isArray(resolved)) {
            throw new Error('Nested array source values are unsupported');
          }
          return resolved;
        });
      } else {
        query = undefined;
      }
    } else {
      query = this.resolveCollectionValue(
        collection.value,
        data,
        results,
        params,
        contextQueries,
        baseQuery,
        isSubQuery ||
          !!(isCollection(collection.value) && collection.value.shape)
      );
      // if the inner collection is shaped, select from that
      // so we have access to any renamed or new fields
      if (
        query &&
        'type' in query &&
        query.type === 'SUBQUERY' &&
        isCollection(collection.value) &&
        collection.value.shape
      ) {
        query = this.sql.select().from(query);
      }
    }
    if (collection.transform) {
      const transform = this.transforms.get(collection.transform.name);
      if (!transform) {
        throw new Error(
          `Couldn't resolve transform "${collection.transform.name}"`
        );
      }
      query = transform(
        collection.transform.modifier,
        params,
        [query].concat(contextQueries),
        ...collection.transform.args
      );
    }
    if (collection.shape) {
      // if query already shaped (through join etc), remove existing shape
      // but preserve any transformation
      if (query && '_select' in query) {
        (query as any)._select.nodes = (query as any)._select.nodes.filter(
          (node: Node) => node.type === 'DISTINCT ON'
        );
      }
      if (Array.isArray(query)) {
        throw new Error('Multi collections must be transformed before shaping');
      }
      const fields = [];
      const queries = query
        ? [query as Intermediate].concat(contextQueries)
        : contextQueries;
      for (let field of collection.shape) {
        if (Array.isArray(field)) {
          throw new Error('Array shapes are not supported');
        }
        fields.push(this.resolveField(queries, field, params));
      }
      if (baseQuery) {
        const fieldsAsJson = this.sql.function('JSON_BUILD_OBJECT')(
          ...fields.map((f) => [f.alias || f.name, f]).flat(1)
        );
        if (
          !query ||
          (query as any)._select?.nodes.filter(
            (node: Node) => node.type === 'DISTINCT ON'
          ).length
        ) {
          query = (query || this.sql).select(fieldsAsJson);
        } else {
          query = (query || this.sql).select(
            this.sql.function('JSON_AGG')(fieldsAsJson)
          );
        }
      } else {
        query = (query || this.sql).select(fields);
      }
    } else {
      if (!Array.isArray(query)) {
        if (query && '_select' in query) {
          (query as any)._select.nodes = (query as any)._select.nodes.filter(
            (node: Node) => node.type === 'DISTINCT ON'
          );
        }
        const fields = [];
        for (let field of collection.availableFields) {
          if (Array.isArray(field)) {
            throw new Error('Array shapes are not supported');
          }
          if (isDataReference(field)) {
            continue; // only datafields
          }
          fields.push(
            this.resolveField(
              [query as Intermediate].concat(contextQueries),
              field,
              params
            )
          );
        }
        if (baseQuery) {
          const fieldsAsJson = this.sql.function('JSON_BUILD_OBJECT')(
            ...fields.map((f) => [f.alias || f.name, f]).flat(1)
          );
          // if the data is just reshaped nested, or distincted internally
          // then we select the object itself. Otherwise, it's from
          // another collection and we need to aggregate
          if (
            !query ||
            (query as any)._select?.nodes.filter(
              (node: Node) => node.type === 'DISTINCT ON'
            ).length
          ) {
            query = (query || this.sql).select(fieldsAsJson);
          } else {
            query = (query || this.sql).select(
              this.sql.function('JSON_AGG')(fieldsAsJson)
            );
          }
        } else {
          query = (query || this.sql).select(fields);
        }
      } else {
        // ?
      }
    }
    return query;
  }

  findColumn(contextQueries: Intermediate[], field: DataField) {
    let out: any;
    let backupOut: any;
    // TODO: can this be typed better?
    function isFrom(node: any): node is FromNode {
      return node.type === 'FROM';
    }
    for (let val of contextQueries.flat(1)) {
      // try looking at the constituent tables
      // TODO: make this more robust
      const fromNodes =
        val?.nodes?.filter(isFrom).map((node) => node.nodes)[0] || [];
      for (const node of fromNodes) {
        const anyNode = node as any;
        const collectionName = field?.from?.name || field?.model?.name;
        const table = anyNode?.table;
        if (anyNode?.type === 'JOIN') {
          const subCollection = [anyNode.from?.table, anyNode.to?.table].find(
            (node) => node?.tableName === collectionName
          );
          out = subCollection.columns.find(
            (col: ColumnNode) => col.name === field.name
          );
        } else if (collectionName === anyNode?.table?.tableName) {
          out = anyNode[field.name] || anyNode.table[field.name];
        }
        if (out) {
          break;
        }
      }
      if (!out && (val as any).table?.tableName === field.from?.name) {
        out = (val as any).table?.[field.name];
      }
      // if not found try looking at the query itself
      if (!out && !backupOut) {
        backupOut =
          (val as any)[field.name] || (val as any).table?.[field.name];
      }
      if (out) {
        break;
      }
    }
    if (!out) {
      out = backupOut;
    }
    if (!out) {
      throw new Error(`Could not find ${field.name}`);
    }
    return out;
  }

  resolveField(
    contextQueries: Intermediate[],
    field: DelegatedField,
    params: any[]
  ) {
    let out: any;
    if (isCollection(field)) {
      if (!contextQueries?.length) {
        throw new Error('Subcollections without query not supported');
      }
      if (Array.isArray(contextQueries[0])) {
        throw new Error(
          'Subcollections from multi collection are not supported'
        );
      }
      const baseTable = contextQueries[0]?.table;
      return this.resolveCollections(
        field,
        [],
        [],
        params,
        contextQueries,
        Table.prototype.subQuery.apply(baseTable || this.sql, [field.alias])
      );
    } else if (field.type === 'exprtree') {
      out = this.resolveExpression(contextQueries, field, params);
    } else if (isDataField(field)) {
      out = this.findColumn(contextQueries, field);
    } else if (isParam(field)) {
      out = this.sql.constant(params[field.index - 1]);
    } else if (isDataModel(field)) {
      const model = this.baseModels.get(field.name);
      out = model
        ?.subQuery(field.alias || field.name)
        .select(this.sql.function('ROW_TO_JSON')(model))
        .from(model);
    } else if (isTransform(field)) {
      const transform = this.transforms.get(field.name);
      if (!transform) {
        throw new Error(
          `Couldn't resolve transform "${field.name}"`
        );
      }
      out = transform(
        field.modifier,
        params,
        contextQueries,
        ...field.args
      );
    } else {
      throw new Error(`${field.type} not supported`);
    }
    if (field.alias && field.alias !== field.name && !isDataModel(field))
      out = out.as(field.alias);
    return out;
  }

  resolveExpression(
    contextQueries: Intermediate[],
    expression: ContextualisedExpr,
    params: any[]
  ) {
    let resolvedArgs: any[] = [];
    for (let arg of expression.args) {
      if (isCollection(arg)) {
        resolvedArgs.push(
          this.resolveCollections(arg, [], [], params, contextQueries)
        );
      } else if (arg.type === 'exprtree') {
        resolvedArgs.push(this.resolveExpression(contextQueries, arg, params));
      } else if (arg.type === 'datamodel') {
        throw new Error('Datamodels not supported in expressions');
      } else if (arg.type === 'param') {
        resolvedArgs.push(params[arg.index - 1]);
      } else if (isDataField(arg)) {
        resolvedArgs.push(this.resolveField(contextQueries, arg, params));
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

  resolveDest(dest: DelegatedCollection): any {
    throw new Error('Not implemented');
  }
}
