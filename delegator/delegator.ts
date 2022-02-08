import type { ContextualisedQuery } from 'arql-contextualiser';

interface ResolutionTree {
  tree: any;
  queries: ContextualisedQuery[];
}

export default function delegator(ast: ContextualisedQuery): ResolutionTree {
  return { tree: null, queries: [ast] };
}
