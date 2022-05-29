import {
  DataSource,
  transformFn,
  operatorOp,
  AnyObj,
  DataSourceOpts,
  DelegatedQuery,
  DelegatedSource,
  isSource,
} from 'arql';
import { ContextualisedExpr, DelegatedField } from 'arql/types';

interface PicoSourceOpts extends DataSourceOpts {
  db: any;
}

export default class Pico extends DataSource<any, any> {
  transforms: Map<string, transformFn> = new Map();
  operators: Map<string, operatorOp> = new Map();
  params: any[] = [];
  db: any; // PicoDB instance, don't think it has types yet

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

  constructor(opts: PicoSourceOpts) {
    super();
    this.operators = opts.operators;
    this.transforms = opts.transforms;
    this.db = opts.db;
  }

  async resolve(
    ast: DelegatedQuery | DelegatedSource,
    data: AnyObj[] | null,
    results: AnyObj[][],
    params: any[]
  ) {
    let sourceQuery: any,
      sourceShape: any,
      destQuery: AnyObj | AnyObj[] | undefined;
    if (ast.type === 'query') {
      if (ast.source) {
        if (ast.source.type === 'delegatedQueryResult')
          sourceQuery = results[ast.source.index];
        else
          [sourceQuery, sourceShape] = await this.resolveSources(
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
      [sourceQuery, sourceShape] = await this.resolveSources(
        ast,
        data,
        results,
        params
      );
    } else throw new Error('Not implemented yet');

    return (
      destQuery ||
      (await this.db.find(sourceQuery, sourceShape).toArray()).map((i: any) => {
        delete i._id;
        return i;
      }) ||
      []
    );
  }

  async resolveSources(
    source: DelegatedSource,
    data: any,
    results: any[],
    params: any[]
  ): Promise<any> {
    let shape: any = {};
    let query: any = {};
    if (isSource(source.value)) {
      [query, shape] = await this.resolveSources(
        source.value,
        data,
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
      query = transform(
        source.transform.modifier,
        params,
        query,
        ...source.transform.args
      );
    }
    if (source.shape) {
      for (let field of source.shape) {
        if (Array.isArray(field)) {
          throw new Error('Array shapes are not supported');
        }
        shape = { shape, ...this.resolveField(field, params) };
      }
    }
    return [query, shape];
  }

  resolveField(field: DelegatedField, params: any[]) {
    if (field.type === 'source') {
      throw new Error('Subsources not supported');
    } else if (field.type === 'exprtree') {
      return this.resolveExpression(field, params);
    } else if (field.type === 'datafield') {
      return { [field.name]: 1 };
    } else {
      throw new Error(`${field.type} not supported`);
    }
  }

  resolveExpression(expression: ContextualisedExpr, params: any[]) {
    let field: string = '';
    let value: any;
    for (let arg of expression.args) {
      if (arg.type === 'source') {
        throw new Error('Subsources not supported');
      } else if (arg.type === 'exprtree') {
        throw new Error('Subexpressions not supported');
      } else if (arg.type === 'datamodel') {
        throw new Error('Datamodels not supported in expressions');
      } else if (arg.type === 'param') {
        value = params[arg.index - 1];
      } else {
        field = arg.name;
      }
    }
    if (value === undefined || !field) {
      throw new Error('Can only compare a datafield and a param');
    }
    const op = this.operators.get(expression.op);
    if (!op) {
      throw new Error(`Could not find operator ${expression.op}`);
    }
    return op(field, value);
  }

  resolveDest(dest: DelegatedSource): any {
    throw new Error('Not implemented');
  }
}
