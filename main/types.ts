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

export type Expr = ExprTree | Param | Alphachain;
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
  value: Alphachain | Source[];
  transforms: Transform[];
  shape: Shape | null;
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

// contextualiser

export type operatorOp = (...args: any[]) => any;
export type transformFn = (...args: any[]) => any;

export interface DataSourceOpts {
  operators: Map<string, (...args: any[]) => any>,
  transforms: Map<string, (...args: any[]) => any>
}

export abstract class DataSource<ModelType, FieldType> {
  models: Map<string, ModelType> = new Map();
  operators: Map<string, operatorOp> = new Map();
  transforms: Map<string, transformFn> = new Map();

  add(def: DataModel) {}

  getField(
    modelName: string,
    fieldName: string,
    ...parts: string[]
  ): ModelType | FieldType {
    throw new Error('Not implemented');
  }

  async resolve(subquery: ContextualisedQuery | ContextualisedSource, params: any[]): Promise<any> {

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
}

export interface ContextualisedParam {
  index: number;
  type: 'param';
  name?: string | undefined;
  fields?: undefined;
}

export interface DataModel {
  type: 'datamodel';
  name: string;
  fields: DataField[];
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

export interface ContextualisedSource {
  type: 'source';
  value:
    | (DataModel | ContextualisedSource | DataField)[]
    | DataModel
    | ContextualisedSource
    | DataField;
  fields: ContextualisedField[];
  name?: Alphachain | string;
  subModels?: (DataModel | ContextualisedSource | DataField)[];
  shape?: ContextualisedField[];
  sources: DataSource<any, any>[];
  transform?: ContextualisedTransform;
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
}

// operators

export interface Operator {
  name: string;
  pattern: (symbol | string)[];
}

export interface RankedOperator extends Operator {
  rank: number;
}