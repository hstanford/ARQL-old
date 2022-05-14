// parser

export type OpChar =
  | '+'
  | '-'
  | '*'
  | '/'
  | '<'
  | '>'
  | '='
  | '~'
  | '!'
  | '@'
  | '#'
  | '%'
  | '^'
  | '&'
  | '`'
  | '?'
  | ':'
  | '|';

export interface Alphachain {
  type: 'alphachain';
  root: string;
  parts: string[];
}

export interface Param {
  type: 'param';
  index: number;
}

export interface Op {
  type: 'op';
  symbol: string;
}

export type Expr = ExprTree | Param | Alphachain | Source;
export type ExprUnary = SubExpr | FunctionCall | Op;

export type SubExpr = Expr | Param | Alphachain;

export interface ExprTree {
  type: 'exprtree';
  op: string;
  args: ExprUnary[];
}

export interface FunctionCall {
  type: 'function';
  expr: Expr;
  args: Expr[];
}

export interface Transform {
  type: 'transform';
  description: Alphachain;
  args: (Expr | Shape | Source)[];
}

export interface Source {
  type: 'source';
  alias: string | undefined;
  value: Alphachain | Source[] | Source | null;
  transforms: Transform[];
  shape: Shape | Shape[] | null;
}

export interface Model {
  type: 'model';
  alias: string | null;
  value: Alphachain;
}

export interface Dest {
  type: 'dest';
  alias: string | null;
  transforms: Transform[];
  shape: Shape | null;
  value: string;
}

export interface Field {
  type: 'field';
  alias: string | null;
  value: Source | Expr;
}

export interface Shape {
  type: 'shape';
  fields: Field[];
}

export interface Query {
  type: 'query';
  source: Source | null;
  modifier: Modifier | undefined;
  dest: Dest | undefined;
}

export type Modifier = '->' | '-+' | '-x';

export class MultiSource extends Map {}

// contextualiser

export type operatorOp = (...args: any[]) => any;
export type transformFn = (...args: any[]) => any;

export interface DataSourceOpts {
  operators: Map<string, (...args: any[]) => any>;
  transforms: Map<string, (...args: any[]) => any>;
}

export abstract class DataSource<ModelType, FieldType> {
  models: Map<string, ModelType> = new Map();
  operators: Map<string, operatorOp> = new Map();
  transforms: Map<string, transformFn> = new Map();

  // these will be used by the contextualiser/delegator to work out if
  // we need to reject the query or where to break the node off the tree
  // as a delegated query we can definitely resolve
  supportsExpressions: boolean = false;
  supportsSubExpressions: boolean = false;
  supportsSubSources: boolean = false;
  supportsShaping: boolean = false;
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

  add(def: DataModel) {}

  getField(
    modelName: string,
    fieldName: string,
    ...parts: string[]
  ): ModelType | FieldType {
    throw new Error('Not implemented');
  }

  async resolve(
    subquery: ContextualisedQuery | ContextualisedSource,
    data: AnyObj[] | null,
    results: AnyObj[][],
    params: any[]
  ): Promise<AnyObj[] | AnyObj> {
    return [];
  }

  implementsOp(opName: string) {
    return this.operators.has(opName);
  }

  implementsTransform(transform: ContextualisedTransform) {
    return this.transforms.has(transform.name); // TODO: make it check modifiers and args
  }
}

export type dataType = 'string' | 'number' | 'boolean' | 'json';
export type ContextualisedField =
  | DataField
  | DataModel
  | ContextualisedSource
  | ContextualisedExpr
  | ContextualisedParam;

export interface DataField {
  type: 'datafield';
  name: string;
  datatype: dataType;
  fields?: DataField[];
  source: DataSource<any, any>;
  model?: DataModel;
  from?: ContextualisedSource;
  alias?: string;
}

export interface DataReference {
  type: 'datareference';
  name: string;
  join: (self: string, other: string) => string;
  other: DataModel;
}

export interface ContextualisedParam {
  index: number;
  type: 'param';
  name?: string | undefined;
  fields?: undefined;
  alias?: string;
}

export interface DataModel {
  type: 'datamodel';
  name: string;
  alias?: string;
  source: DataSource<any, any>;
  fields: (DataField | DataReference)[];
}

export interface TransformDef {
  type: 'transformdef';
  name: string;
  modifiers?: string[];
  nArgs: string | number;
}

export interface ContextualiserState {
  aliases: Map<string, ContextualisedSource | DataModel | DataField>;
}

export interface ContextualisedQuery {
  type: 'query';
  source?: ContextualisedSource;
  dest?: ContextualisedSource;
  modifier?: Modifier;
  sources: DataSource<any, any>[];
}

export type ContextualisedSourceValue =
  | DataField
  | DataModel
  | ContextualisedSource;

export interface ContextualisedSource {
  type: 'source';
  value: ContextualisedSourceValue[] | ContextualisedSourceValue;
  fields: ContextualisedField[];
  name?: Alphachain | string;
  subModels?: ContextualisedSourceValue[];
  shape?: ContextualisedField[] | ContextualisedField[][];
  sources: DataSource<any, any>[];
  transform?: ContextualisedTransform;
  alias?: string;
}

export interface ContextualisedTransform {
  type: 'transform';
  name: string;
  modifier: string[];
  args: (ContextualisedField | ContextualisedExpr | ContextualisedField[])[];
  sources: DataSource<any, any>[];
}

export interface ContextualisedExpr {
  type: 'exprtree';
  op: string;
  name?: Alphachain | string;
  fields?: undefined;
  args: (ContextualisedExpr | ContextualisedField)[];
  sources: DataSource<any, any>[];
  alias?: string;
}

// operators

export interface Operator {
  name: string;
  pattern: (symbol | string)[];
}

export interface RankedOperator extends Operator {
  rank: number;
}

// delegator

export type Modify<T, R> = Omit<T, keyof R> & R;
export interface DelegatedQueryResult {
  type: 'delegatedQueryResult';
  index: number;
  alias?: string;
}

export type DelegatedField =
  | DataField
  | DataModel
  | ContextualisedSource
  | DelegatedSource
  | ContextualisedExpr
  | ContextualisedParam
  | DelegatedQueryResult;

export interface ResolutionTree {
  tree: DelegatedQuery | DelegatedQueryResult;
  queries: (ContextualisedQuery | ContextualisedSource)[];
}

export interface DelegatedSource
  extends Modify<
    ContextualisedSource,
    {
      subModels?: (
        | DelegatedSource
        | ContextualisedSource
        | DataModel
        | DataField
      )[];
      value:
        | DelegatedSource
        | DelegatedQueryResult
        | ContextualisedSource
        | DataModel
        | DataField
        | (
            | DelegatedSource
            | DelegatedQueryResult
            | ContextualisedSource
            | DataModel
            | DataField
          )[];
      shape?: DelegatedField[] | DelegatedField[][];
    }
  > {}

export interface DelegatedQuery
  extends Modify<
    ContextualisedQuery,
    {
      source?: DelegatedSource | DelegatedQueryResult;
      dest?: DelegatedSource | DelegatedQueryResult;
    }
  > {}

export type AnyObj = { [key: string]: any };
