import type {
  ContextualisedExpr,
  ContextualisedParam,
  ContextualisedQuery,
  ContextualisedSource,
  DataModel,
  DataField,
  ContextualisedField,
} from 'arql-contextualiser';

import { combineSources, Unresolveable } from 'arql-contextualiser';

function uniq<T>(arr: T[]) {
  return arr.filter(
    (field, idx, self) => idx === self.findIndex((f2) => f2 === field)
  );
}

type Modify<T, R> = Omit<T, keyof R> & R;
export interface DelegatedQueryResult {
  type: 'delegatedQueryResult';
  index: number;
  alias?: string;
}

export type DelegatedField =
  | DataField
  | DataModel
  | ContextualisedSource
  | ContextualisedExpr
  | ContextualisedParam
  | DelegatedQueryResult;
export interface ResolutionTree {
  tree: DelegatedQuery | DelegatedQueryResult;
  queries: (ContextualisedQuery | ContextualisedSource)[];
}

export interface DelegatedSource
  extends Modify<
    ContextualisedSource,
    {
      subModels?: (
        | DelegatedSource
        | ContextualisedSource
        | DataModel
        | DataField
      )[];
      value:
        | DelegatedSource
        | DelegatedQueryResult
        | ContextualisedSource
        | DataModel
        | DataField
        | (
            | DelegatedSource
            | DelegatedQueryResult
            | ContextualisedSource
            | DataModel
            | DataField
          )[];
      shape?: DelegatedField[];
    }
  > {}

export interface DelegatedQuery
  extends Modify<
    ContextualisedQuery,
    {
      source?: DelegatedSource | DelegatedQueryResult;
      dest?: DelegatedSource | DelegatedQueryResult;
    }
  > {}

function findSplit(
  ast: DataModel | ContextualisedSource | DataField,
  queries: (ContextualisedQuery | ContextualisedSource)[]
): DelegatedSource | DelegatedQueryResult {
  // if the ast only has one data source, add that
  if (ast.type === 'datamodel') {
    throw new Error('Cannot delegate data model on its own');
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

  let shape: DelegatedField[] | undefined = ast.shape;
  // if shape has data sources that "sources" is missing, split off
  if (ast.shape) {
    const sourceDataSources = uniq(combineSources(ast.subModels || []));
    const shapeDataSources = uniq(combineSources(ast.shape || []));
    const inShapeNotInSource = shapeDataSources.filter(
      (source) => !sourceDataSources.includes(source)
    );

    if (inShapeNotInSource.length) {
      shape = ast.shape.map((field) => {
        if (field.type === 'source') {
          if (
            field.sources.some((source) => inShapeNotInSource.includes(source))
          ) {
            queries.push(field);
            return { type: 'delegatedQueryResult', index: queries.length - 1 };
          }
          return field;
        } else if (field.type === 'exprtree') {
          if (
            field.sources.some((source) => inShapeNotInSource.includes(source))
          ) {
            throw new Error(
              'Multi-source origin expressions are not supported'
            );
          }
          return field;
        } else if (field.type === 'datamodel') {
          throw new Error('Lone data models in shapes are not fully supported');
        } else if (field.type === 'datafield') {
          if (inShapeNotInSource.includes(field.source)) {
            throw new Error(
              'Lone data fields in shapes are not fully supported'
            );
          }
          return field;
        } else if (field.type === 'param') {
          return field;
        } else {
          throw new Error('Unrecognised field type');
        }
      });
    }
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
  let tree;
  const queries: (ContextualisedQuery | ContextualisedSource)[] = [];
  if (ast.sources.length === 1) {
    const queryResult: DelegatedQueryResult = {
      type: 'delegatedQueryResult',
      index: 0,
    };
    tree = queryResult;
    queries.push(ast);
  } else if (ast.sources.length > 1) {
    // TODO: can this not mutate ast?
    if (ast.source && ast.type === 'query')
      tree = {
        ...(tree || ast),
        source: findSplit(ast.source, queries),
      };
    if (ast.dest && ast.type === 'query')
      tree = {
        ...(tree || ast),
        dest: findSplit(ast.dest, queries),
      };
  }
  if (!tree) throw new Error('Unable to delegate query with no sources');

  return {
    tree,
    queries,
  };
}
