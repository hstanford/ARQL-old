import { Collection, Query } from './parser.js';
import {
  ContextualisedCollection,
  ContextualisedQuery,
} from './contextualiser.js';
import { DelegatedCollection, DelegatedQuery } from './delegator.js';

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
