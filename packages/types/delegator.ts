import {
  DataField,
  DataModel,
  DataReference,
  ContextualisedCollection,
  ContextualisedExpr,
  ContextualisedFunction,
  ContextualisedParam,
  ContextualisedQuery,
} from './contextualiser.js';

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
  | ContextualisedCollection
  | DelegatedCollection
  | ContextualisedExpr
  | ContextualisedParam
  | DelegatedQueryResult
  | DataReference
  | ContextualisedFunction;

export interface ResolutionTree {
  tree: DelegatedQuery | DelegatedQueryResult;
  queries: (ContextualisedQuery | ContextualisedCollection)[];
}

export interface DelegatedCollection
  extends Modify<
    ContextualisedCollection,
    {
      subModels?: (
        | DelegatedCollection
        | ContextualisedCollection
        | DataModel
        | DataField
      )[];
      value:
        | DelegatedCollection
        | DelegatedQueryResult
        | ContextualisedCollection
        | DataModel
        | DataField
        | (
            | DelegatedCollection
            | DelegatedQueryResult
            | ContextualisedCollection
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
      sourceCollection?: DelegatedCollection | DelegatedQueryResult;
      dest?: DelegatedCollection | DelegatedQueryResult;
    }
  > {}
