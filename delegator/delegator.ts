import type { ContextualisedQuery, ContextualisedSource } from 'arql-contextualiser';

interface ResolutionTree {
  tree: ContextualisedQuery;
  queries: ContextualisedQuery[];
}

function findSplit (ast: ContextualisedQuery): ResolutionTree {
  throw new Error('Not yet implemented');
}

export default function delegator(ast: ContextualisedQuery): ResolutionTree {
  if (ast.sources.length === 1 && ast.from) {
    const queryResult: ContextualisedSource = {
      ...ast.from,
      type: 'delegatedQueryResult',
      index: 1,
    }
    return {
      tree: {
        ...ast,
        from: queryResult,
      },
      queries: [ast]
    };
  }
  if (ast.sources.length === 0)
    return { tree: ast, queries: [] };
  return findSplit(ast);
}
