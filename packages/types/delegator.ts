import {
  DelegatedQueryResult,
  ContextualisedCollection,
  ContextualisedQuery,
} from './contextualiser.js';

export type Modify<T, R> = Omit<T, keyof R> & R;

export interface ResolutionTree {
  tree: DelegatedQuery | DelegatedQueryResult;
  queries: (ContextualisedQuery | ContextualisedCollection)[];
}

export interface DelegatedQuery
  extends Modify<
    ContextualisedQuery,
    {
      sourceCollection?: ContextualisedCollection | DelegatedQueryResult;
      dest?: ContextualisedCollection | DelegatedQueryResult;
    }
  > {}
