/**
 * DELEGATOR
 *
 * The Delegator's role is to take a query tree from the Contextualiser and to break it
 * up based on the data sources that are required to resolve the data at each point.
 *
 * At each node in the input tree it decides if a single data source (e.g. a particular
 * postgres database) can resolve all the data in this branch of the tree. If so, it breaks
 * it off into a delegated query, which will be passed down to the resolver for that
 * particular data source. The rest of the tree is left for the native (js) resolver to
 * combine from the delegated query results.
 */
import { inspect } from 'util';
import type {
  ContextualisedQuery,
  ContextualisedSource,
  DataModel,
  DataField,
  DelegatedQueryResult,
  DelegatedField,
  ResolutionTree,
  DelegatedSource,
  DelegatedQuery,
  ContextualisedField,
} from './types.js';

import { combine } from './sources.js';

function uniq<T>(arr: T[]) {
  return arr.filter(
    (field, idx, self) => idx === self.findIndex((f2) => f2 === field)
  );
}

/**
 * needs a bit of a redesign? Needs to support:
 * - splitting on a source
 * - splitting a shape (will need all required fields selected out of the delegated query)
 * - splitting an expression (will need partial expressions selected out of the delegated query)
 * - splitting based on source flags
 * 
 * at each node:
 * - is it single source?
 * - does the source support the whole shape?
 * - does the source support the transform and all its arguments?
 * 
 * perhaps a recursive "supports(node, source)" function that ensures all leaves and nodes in between
 * can be resolved by the source
 */ 

function findSplitShape(
  ast: DataModel | ContextualisedSource | DataField,
  queries: (ContextualisedQuery | ContextualisedSource)[],
  inShape: ContextualisedField[] | ContextualisedField[][]
): DelegatedField[] | DelegatedField[][] {
  if (ast.type !== 'source') {
    throw new Error('cannot find shape split for non-source');
  }
  if (Array.isArray(inShape?.[0])) {
    return (inShape as ContextualisedField[][]).map(
      (shape) => findSplitShape(ast, queries, shape) as DelegatedField[]
    );
  }
  let shape: DelegatedField[] = inShape as DelegatedField[];
  const sourceDataSources = uniq(combine(ast.subModels || []));
  const shapeDataSources = uniq(
    combine((shape as ContextualisedField[]) || [])
  );
  const inShapeNotInSource = shapeDataSources.filter(
    (source) => !sourceDataSources.includes(source)
  );

  if (inShapeNotInSource.length) {
    shape = (inShape as ContextualisedField[]).map((field) => {
      if (field.type === 'source') {
        if (
          field.sources.every((source) => inShapeNotInSource.includes(source))
        ) {
          queries.push(field);
          return {
            type: 'delegatedQueryResult',
            index: queries.length - 1,
            alias: typeof field.name === 'string' ? field.name : undefined,
          };
        }
        if (
          field.sources.some((source) => inShapeNotInSource.includes(source))
        ) {
          // TODO: this may need some very fancy logic
          if (
            Array.isArray(field.value) &&
            field.value[0].type === 'source' &&
            field.value?.length === 1
          ) {
            queries.push(field.value[0]);
            return {
              ...field,
              value: [
                {
                  type: 'delegatedQueryResult',
                  index: queries.length - 1,
                  alias:
                    typeof field.value[0].name === 'string'
                      ? field.value[0].name
                      : undefined,
                },
              ],
            };
          } else {
            if (!Array.isArray(field.value)) {
              return { ...field, value: findSplit(field.value, queries) };
            }
            throw new Error(
              'Mixed source shapes currently have minimal support'
            );
          }
        }
        return field;
      } else if (field.type === 'exprtree') {
        if (
          field.sources.some((source) => inShapeNotInSource.includes(source))
        ) {
          throw new Error('Multi-source origin expressions are not supported');
        }
        return field;
      } else if (field.type === 'datamodel') {
        throw new Error('Lone data models in shapes are not fully supported');
      } else if (field.type === 'datafield') {
        if (inShapeNotInSource.includes(field.source)) {
          throw new Error('Lone data fields in shapes are not fully supported');
        }
        return field;
      } else if (field.type === 'param') {
        return field;
      } else {
        throw new Error('Unrecognised field type');
      }
    });
  }
  return shape;
}

function findSplit(
  ast: DataModel | ContextualisedSource | DataField,
  queries: (ContextualisedQuery | ContextualisedSource)[]
): DelegatedSource | DelegatedQueryResult {
  // if the ast only has one data source, add that
  if (ast.type === 'datamodel') {
    queries.push({
      type: 'source',
      value: ast,
      fields: [],
      sources: [(ast.fields[0] as DataField)?.source].filter((i) => !!i),
    });
    return {
      type: 'delegatedQueryResult',
      index: queries.length - 1,
      alias: ast.name,
    };
  } else if (ast.type === 'datafield') {
    throw new Error('Cannot Delegate data field on its own');
  }
  if (ast.sources.length === 1) {
    queries.push(ast);
    return {
      type: 'delegatedQueryResult',
      index: queries.length - 1,
      alias: typeof ast.name === 'string' ? ast.name : undefined,
    };
  }

  let shape: DelegatedField[] | DelegatedField[][] | undefined;

  if (ast.shape) {
    shape = findSplitShape(ast, queries, ast.shape);
  }

  // TODO: handle unresolvable transforms

  // if the source's subModels don't all have the same set of sources, split
  // work out the split of subModel origins based on the sources of the fields in the shape
  let value:
    | DelegatedQueryResult
    | DelegatedSource
    | (DelegatedQueryResult | DelegatedSource)[] = [];
  if (!Array.isArray(ast.value)) {
    value = findSplit(ast.value, queries);
  } else if (ast.value.length === 1) {
    value = findSplit(ast.value[0], queries);
  } else if (ast.value.length > 1) {
    value = ast.value.map((v) => findSplit(v, queries));
  }

  return {
    ...ast,
    value,
    shape,
  };
}

export default function delegator(ast: ContextualisedQuery): ResolutionTree {
  let tree: DelegatedQuery | DelegatedQueryResult | undefined;
  const queries: (ContextualisedQuery | ContextualisedSource)[] = [];
  if (ast.sources.length === 1) {
    tree = {
      type: 'delegatedQueryResult',
      index: 0,
    } as DelegatedQueryResult;
    queries.push(ast);
  } else if (ast.sources.length > 1) {
    // TODO: can this not mutate ast?
    if (ast.source && ast.type === 'query')
      tree = {
        ...(tree || ast),
        source: findSplit(ast.source, queries),
      } as DelegatedQuery;
    if (ast.dest && ast.type === 'query')
      tree = {
        ...(tree || ast),
        dest: findSplit(ast.dest, queries),
      } as DelegatedQuery;
  }
  if (!tree) {
    tree = ast;
  }

  return {
    tree,
    queries,
  };
}
