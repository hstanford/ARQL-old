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

export function isAlphachain(ipt: any): ipt is Alphachain {
  return ipt?.type === 'alphachain';
}

export interface Param {
  type: 'param';
  index: number;
}

export interface Op {
  type: 'op';
  symbol: string;
}

export function isOp(ipt: any): ipt is Op {
  return ipt?.type === 'op';
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

export function isFunction(ipt: any): ipt is FunctionCall {
  return ipt?.type === 'function';
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

export function isModel(ipt: any): ipt is Model {
  return ipt?.type === 'model';
}

export interface Dest {
  type: 'dest';
  alias: string | null;
  transforms: Transform[];
  shape: Shape | null;
  value: string;
}

export function isDest(ipt: any): ipt is Dest {
  return ipt?.type === 'dest';
}

export interface Field {
  type: 'field';
  alias: string | null;
  value: Source | Expr;
}

export function isField(ipt: any): ipt is Field {
  return ipt?.type === 'field';
}

export interface Wildcard {
  type: 'wildcard';
  value: '*';
  root?: string;
  parts?: string[];
}

export function isWildcard(ipt: any): ipt is Wildcard {
  return ipt?.type === 'wildcard';
}

export interface Shape {
  type: 'shape';
  fields: (Field | Wildcard)[];
}

export function isShape(ipt: any): ipt is Shape {
  return ipt?.type === 'shape';
}

export function isMultiShape(
  ipt: ContextualisedField[] | ContextualisedField[][]
): ipt is ContextualisedField[][] {
  return Array.isArray(ipt?.[0]);
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
  | ContextualisedParam
  | DataReference
  | ContextualisedFunction;

export interface DataField {
  type: 'datafield';
  name: string;
  datatype?: dataType;
  fields?: DataField[];
  source: DataSource<any, any> | DataSource<any, any>[];
  model?: DataModel;
  from?: ContextualisedSource;
  alias?: string;
}

export function isDataField(ipt: any): ipt is DataField {
  return ipt?.type === 'datafield';
}

export interface DataReference {
  type: 'datareference';
  name: string;
  join: (self: string, other: string) => string;
  model: DataModel;
  other: DataModel;
  alias?: string | Alphachain;
}

export function isDataReference(ipt: any): ipt is DataReference {
  return ipt?.type === 'datareference';
}

export interface ContextualisedParam {
  index: number;
  type: 'param';
  name?: string | undefined;
  alias?: string;
}

export function isParam<T>(
  ipt: T
): ipt is Extract<T, Param | ContextualisedParam> {
  return (ipt as any)?.type === 'param';
}

export interface DataModel {
  type: 'datamodel';
  name: string;
  alias?: string;
  source: DataSource<any, any>;
  fields: (DataField | DataReference)[];
}

export function isDataModel(ipt: any): ipt is DataModel {
  return ipt?.type === 'datamodel';
}

export interface TransformDef {
  type: 'transformdef';
  name: string;
  modifiers?: string[];
  nArgs: string | number;
}

export function isTransformDef(ipt: any): ipt is TransformDef {
  return ipt?.type === 'transformdef';
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

export function isQuery<T>(
  ipt: T
): ipt is Extract<T, Query | ContextualisedQuery | DelegatedQuery> {
  return (ipt as any)?.type === 'query';
}

export type ContextualisedSourceValue =
  | DataField
  | DataModel
  | ContextualisedSource;

export interface ContextualisedSource {
  type: 'source';
  value: ContextualisedSourceValue[] | ContextualisedSourceValue;
  availableFields: ContextualisedField[];
  requiredFields: ContextualisedField[];
  name?: Alphachain | string;
  subModels?: ContextualisedSourceValue[];
  shape?: ContextualisedField[] | ContextualisedField[][];
  sources: DataSource<any, any>[];
  transform?: ContextualisedTransform;
  alias?: string;
}

export function isSource<T>(
  ipt: T
): ipt is Extract<T, Source | ContextualisedSource | DelegatedSource> {
  return (ipt as any)?.type === 'source';
}

export interface ContextualisedTransform {
  type: 'transform';
  name: string;
  modifier: string[];
  args: (ContextualisedField | ContextualisedExpr | ContextualisedField[])[];
  sources: DataSource<any, any>[];
  requiredFields: ContextualisedField[];
}

export interface ContextualisedFunction extends ContextualisedTransform {
  alias?: string;
}

export function isTransform<T>(
  ipt: T
): ipt is Extract<T, Transform | ContextualisedTransform> {
  return (ipt as any)?.type === 'transform';
}

export interface ContextualisedExpr {
  type: 'exprtree';
  op: string;
  name?: Alphachain | string;
  requiredFields: ContextualisedField[];
  args: (ContextualisedExpr | ContextualisedField)[];
  sources: DataSource<any, any>[];
  alias?: string;
}

export function isExpr<T>(
  ipt: T
): ipt is Extract<T, ExprTree | ContextualisedExpr> {
  return (ipt as any)?.type === 'exprtree';
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

export function isDelegatedQueryResult(ipt: any): ipt is DelegatedQueryResult {
  return ipt?.type === 'exprtree';
}

export type DelegatedField =
  | DataField
  | DataModel
  | ContextualisedSource
  | DelegatedSource
  | ContextualisedExpr
  | ContextualisedParam
  | DelegatedQueryResult
  | DataReference
  | ContextualisedFunction;

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
