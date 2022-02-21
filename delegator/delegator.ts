import type {
  ContextualisedExpr,
  ContextualisedParam,
  ContextualisedQuery,
  ContextualisedSource,
  DataModel,
  DataField,
  ContextualisedField,
} from 'arql-contextualiser';

import { combineSources } from 'arql-contextualiser';

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

type DelegatedField =
| DataField
| DataModel
| ContextualisedSource
| ContextualisedExpr
| ContextualisedParam
| DelegatedQueryResult;
interface ResolutionTree {
  tree: DelegatedQuery | DelegatedQueryResult;
  queries: (ContextualisedQuery | ContextualisedSource)[];
}

interface DelegatedSource extends Modify<ContextualisedSource, {
  subModels?: (DelegatedSource | DataModel | DataField)[];
  shape?: DelegatedField[];
}> {};

interface DelegatedQuery extends Modify<ContextualisedQuery, {
  from?: DelegatedSource | DelegatedQueryResult;
  to?: DelegatedSource | DelegatedQueryResult;
}> {}

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

  const out: DelegatedSource = { ...ast };
  // if shape has data sources that "sources" is missing, split off
  if (ast.shape) {
    const sourceDataSources = uniq(combineSources(ast.subModels || []));
    const shapeDataSources = uniq(combineSources(ast.shape || []));
    const inShapeNotInSource = shapeDataSources.filter(source => !sourceDataSources.includes(source));

    if (inShapeNotInSource.length) {
      out.shape = ast.shape.map(field => {
        if (field.type === 'source') {
          if (field.sources.some(source => inShapeNotInSource.includes(source))) {
            queries.push(field);
            return { type: 'delegatedQueryResult', index: queries.length - 1 };
          }
          return field;
        } else if (field.type === 'exprtree') {
          if (field.sources.some(source => inShapeNotInSource.includes(source))) {
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
  }

  // if the source's subModels don't all have the same set of sources, split
  // work out the split of subModel origins based on the sources of the fields in the shape
  if (ast.subModels?.length && ast.sources.length > 1) {
    const groups = [];
    for (const source of ast.subModels) {
      if (source.type === 'datafield') {
        throw new Error('Cannot yet handle data field');
      } else if (source.type === 'datamodel') {

      }
    }
  }

  // for each subModel, recurse
  return out;
}

export default function delegator(ast: ContextualisedQuery): ResolutionTree {
  const resolutionTree: ResolutionTree = {
    tree: ast,
    queries: [],
  };
  if (ast.sources.length === 1) {
    const queryResult: DelegatedQueryResult = {
      type: 'delegatedQueryResult',
      index: 1,
    };
    resolutionTree.tree = queryResult;
    resolutionTree.queries.push(ast);
  } else if (ast.sources.length > 1) {
    // TODO: can this not mutate ast?
    if (ast.from && resolutionTree.tree.type === 'query')
      resolutionTree.tree = {
        ...resolutionTree.tree,
        from: findSplit(ast.from, resolutionTree.queries),
      };
    if (ast.to && resolutionTree.tree.type === 'query')
      resolutionTree.tree = {
        ...resolutionTree.tree,
        from: findSplit(ast.to, resolutionTree.queries),
      };
  }
  return resolutionTree;
}
