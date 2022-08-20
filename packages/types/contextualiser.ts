import { dataType } from './models.js';
import { Alphachain, ExprTree, Modifier, Param, Transform } from './parser.js';
import { Dictionary } from './util.js';

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
    data: Dictionary[] | null,
    results: Dictionary[][],
    params: any[]
  ): Promise<Dictionary[] | Dictionary> {
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
  | DelegatedQueryResult
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
export class DataField {
  type = 'datafield' as const;
  constructor (opts: Omit<DataField, 'type'>) {
    Object.assign(this, opts);
  }
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

export class DataReference {
  type = 'datareference' as const;
  constructor (opts: Omit<DataReference, 'type'>) {
    Object.assign(this, opts);
  }
}

export function isDataReference(ipt: any): ipt is DataReference {
  return ipt instanceof DataReference || ipt?.type === 'datareference';
}

export interface ContextualisedParam {
  index: number;
  type: 'param';
  name?: string | undefined;
  alias?: string;
}
export class ContextualisedParam {
  type = 'param' as const;
  constructor (opts: Omit<ContextualisedParam, 'type'>) {
    Object.assign(this, opts);
  }
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
export class DataModel {
  type = 'datamodel' as const;
  clone(override?: Partial<DataModel>) {
    const newDataModel = new DataModel(this);
    if (override)
      Object.assign(newDataModel, override);
    return newDataModel;
  }
  getAvailableFields() {
    return [] as ContextualisedField[];
  }
  constructor (opts: Omit<DataModel, 'type' | 'clone' | 'getAvailableFields'>) {
    Object.assign(this, opts);
  }
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
export class TransformDef {
  type = 'transformdef' as const;
  constructor (opts: Omit<TransformDef, 'type'>) {
    Object.assign(this, opts);
  }
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
export class ContextualisedQuery {
  type = 'query' as const;
  constructor (opts: Omit<ContextualisedQuery, 'type'>) {
    Object.assign(this, opts);
  }
}

export interface DelegatedQueryResult {
  name?: never;
  fields?: never;
  sources?: never;
  type: 'delegatedQueryResult';
  index: number;
  alias?: string;
}

export function isDelegatedQueryResult(ipt: any): ipt is DelegatedQueryResult {
  return ipt?.type === 'delegatedQueryResult';
}

export type ContextualisedCollectionValue =
  | DataField
  | DataModel
  | ContextualisedCollection
  | DelegatedQueryResult;

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
export class ContextualisedCollection {
  type = 'collection' as const;
  clone(override?: Partial<ContextualisedCollection>) {
    const newCollection = new ContextualisedCollection(this);
    if (override)
      Object.assign(newCollection, override);
    return newCollection;
  }
  getAvailableFields() {
    return [] as ContextualisedField[];
  }
  constructor (opts: Omit<ContextualisedCollection, 'type' | 'getAvailableFields' | 'clone'>) {
    Object.assign(this, opts);
  }
}

export interface ContextualisedTransform {
  type: 'transform';
  name: string;
  modifier: string[];
  args: (ContextualisedField | ContextualisedExpr | ContextualisedField[])[];
  sources: DataSource<any, any>[];
  requiredFields: ContextualisedField[];
}

export class ContextualisedTransform {
  type = 'transform' as const;
  constructor (opts: Omit<ContextualisedTransform, 'type'>) {
    Object.assign(this, opts);
  }
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
