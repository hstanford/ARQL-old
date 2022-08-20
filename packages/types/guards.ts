import { Collection, Query } from './parser';
import {
  ContextualisedCollection,
  ContextualisedQuery,
} from './contextualiser';
import { DelegatedCollection, DelegatedQuery } from './delegator';

export function isCollection<T>(
  ipt: T
): ipt is Extract<
  T,
  Collection | ContextualisedCollection | DelegatedCollection
> {
  return (ipt as any)?.type === 'collection';
}

export function isQuery<T>(
  ipt: T
): ipt is Extract<T, Query | ContextualisedQuery | DelegatedQuery> {
  return (ipt as any)?.type === 'query';
}
