import { dataType } from './models.js';
import { Alphachain, ExprTree, Modifier, Param, Transform } from './parser.js';
import { AnyObj } from './util.js';

export type operatorOp = (...args: any[]) => any;
export type transformFn = (...args: any[]) => any;

export interface DataSourceOpts {}

export abstract class DataSource<ModelType, FieldType> {
  models: Map<string, ModelType> = new Map();
  operators: Map<string, operatorOp> = new Map();
  transforms: Map<string, transformFn> = new Map();

  // these will be used by the contextualiser/delegator to work out if
  // we need to reject the query or where to break the node off the tree
  // as a delegated query we can definitely resolve
  supportsExpressions: boolean = false;
  supportsSubExpressions: boolean = false;
  supportsSubCollections: boolean = false;
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
    subquery: ContextualisedQuery | ContextualisedCollection,
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

export type ContextualisedField =
  | DataField
  | DataModel
  | ContextualisedCollection
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
  from?: ContextualisedCollection;
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
  aliases: Map<string, ContextualisedCollection | DataModel | DataField>;
}

export interface ContextualisedQuery {
  type: 'query';
  sourceCollection?: ContextualisedCollection;
  dest?: ContextualisedCollection;
  modifier?: Modifier;
  sources: DataSource<any, any>[];
}

export type ContextualisedCollectionValue =
  | DataField
  | DataModel
  | ContextualisedCollection;

export interface ContextualisedCollection {
  type: 'collection';
  value: ContextualisedCollectionValue[] | ContextualisedCollectionValue;
  availableFields: ContextualisedField[];
  requiredFields: ContextualisedField[];
  name?: Alphachain | string;
  subModels?: ContextualisedCollectionValue[];
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

export function isMultiShape(
  ipt: ContextualisedField[] | ContextualisedField[][]
): ipt is ContextualisedField[][] {
  return Array.isArray(ipt?.[0]);
}
