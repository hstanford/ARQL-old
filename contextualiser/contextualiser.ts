import type {
  Alphachain,
  Field,
  FullFrom,
  Join,
  JoinModifier,
  Model,
  Query,
  To,
  Transform,
  Shape,
  Source,
  ExprUnary,
} from 'arql-parser';

type operatorOp = (...args: any[]) => any;
type transformFn = (...args: any[]) => any;
type combinationFn = (...args: any[]) => any;

export abstract class DataSource<ModelType, FieldType> {
  models: Map<string, ModelType> = new Map();
  operators: Map<string, operatorOp> = new Map();
  transforms: Map<string, transformFn> = new Map();
  combinations: Map<string | null, combinationFn> = new Map();

  add(def: DataModel) {}

  resolveField(
    modelName: string,
    fieldName: string,
    ...parts: string[]
  ): ModelType | FieldType {
    throw new Error('Not implemented');
  }

  implementsOp(opName: string) {
    return this.operators.has(opName);
  }

  implementsTransform(transform: ContextualisedTransform) {
    return this.transforms.has(transform.name); // TODO: make it check modifiers and args
  }

  implementsCombination(combiner: Combiner) {
    return this.combinations.has(combiner.modifier); // TODO: make it check range
  }
}

export class UnresolveableSource extends DataSource<any, any> {}

export type Combiner = Join;
export type dataType = 'string' | 'number' | 'boolean' | 'json';
export type ContextualisedField =
  | DataField
  | DataModel
  | ContextualisedSource
  | ContextualisedExpr
  | ContextualisedParam;

export interface DataField {
  type: 'datafield';
  name: string;
  datatype: dataType;
  fields?: DataField[];
  source: DataSource<any, any>;
  model?: DataModel;
  from?: ContextualisedSource;
}

export interface ContextualisedParam {
  index: number;
  type: 'param';
  name?: string | undefined;
  fields?: undefined;
}

export interface DataModel {
  type: 'datamodel';
  name: string;
  fields: DataField[];
}

export interface TransformDef {
  type: 'transformdef';
  name: string;
  modifiers?: string[];
  nArgs: string | number;
}

export interface ContextualiserState {
  aliases: Map<string, ContextualisedSource | DataModel | DataField>;
}

export interface ContextualisedQuery {
  type: 'query';
  from?: ContextualisedSource;
  to?: ContextualisedSource;
  modifier: string | null;
  sources: DataSource<any, any>[];
}

export interface ContextualisedSource {
  type: 'source';
  source?: (ContextualisedSource | Join)[] | ContextualisedSource;
  fields: ContextualisedField[];
  name?: Alphachain | string;
  subModels?: (DataModel | ContextualisedSource | DataField)[];
  modifier?: JoinModifier;
  shape?: ContextualisedField[];
  sources: DataSource<any, any>[];
  transform?: ContextualisedTransform;
}

export interface ContextualisedTransform {
  type: 'transform';
  name: string;
  modifier: string[];
  args: (ContextualisedField | ContextualisedExpr)[];
  sources: DataSource<any, any>[];
}

export interface ContextualisedExpr {
  type: 'exprtree';
  name?: Alphachain | string;
  fields?: undefined;
  args: (ContextualisedExpr | ContextualisedField)[];
  sources: DataSource<any, any>[];
}

function uniq<T>(arr: T[]) {
  return arr.filter(
    (field, idx, self) => idx === self.findIndex((f2) => f2 === field)
  );
}

function uniqBy<T>(arr: T[], key: keyof T) {
  return arr.filter(
    (field, idx, self) => idx === self.findIndex((f2) => f2[key] === field[key])
  );
}

export function combineSources(fields: ContextualisedField[]) {
  return fields.reduce((acc, m) => {
    let sources: DataSource<any, any>[] = [];
    if (m.type === 'datafield') {
      sources = [m.source];
    } else if (m.type === 'datamodel') {
      sources = uniq(m.fields.map((f) => f.source));
    } else if (m.type === 'param') {
      sources = [];
    } else {
      sources = m.sources;
    }
    return acc.concat(sources);
  }, [] as DataSource<any, any>[]);
}

export class Contextualiser {
  state: ContextualiserState;
  models: Map<string, DataModel>;
  transforms: TransformDef[];
  constructor(models: Map<string, DataModel>, transforms: TransformDef[]) {
    this.state = { aliases: new Map() };
    this.models = models;
    this.transforms = transforms;
  }

  run(ast: Query) {
    const contextualisedQuery: ContextualisedQuery = {
      type: ast.type,
      modifier: ast.modifier,
      sources: [],
    };
    if (ast.from) {
      contextualisedQuery.from = this.handleFrom(ast.from);
    }
    if (ast.to) {
      contextualisedQuery.to = this.handleTo(ast.to, contextualisedQuery.from);
    }
    contextualisedQuery.sources = uniq(
      (contextualisedQuery?.from?.sources || []).concat(
        contextualisedQuery?.to?.sources || []
      )
    );
    return contextualisedQuery;
  }

  aggregateSources(contSource: ContextualisedSource) {
    const sources = contSource.source
      ? Array.isArray(contSource.source)
        ? contSource.source
        : [contSource.source]
      : [];
    contSource.fields = uniqBy(
      sources.reduce(
        (acc, source) =>
          acc.concat(source.type === 'source' ? source.fields : []),
        [] as ContextualisedField[]
      ) || [],
      'name'
    );
    contSource.subModels = uniqBy(
      sources.reduce(
        (acc, source) =>
          source?.type === 'source' ? acc.concat(source.subModels || []) : acc,
        [] as (DataField | DataModel | ContextualisedSource)[]
      ) || [],
      'name'
    );
    const firstSource = sources.find(
      (s): s is ContextualisedSource => s.type !== 'join'
    );
    contSource.name = (firstSource || contSource.subModels?.[0])?.name;
    contSource.sources = combineSources(contSource.subModels);
  }

  handleFrom(from: FullFrom) {
    const contextualisedFrom: ContextualisedSource = {
      type: 'source',
      fields: [],
      sources: [],
    };
    let out = contextualisedFrom;
    if (from.source) {
      contextualisedFrom.source = this.handleSource(from.source);
      this.aggregateSources(contextualisedFrom);
    }
    if (from.transforms.length) {
      for (const transform of from.transforms) {
        const outTransform = this.getTransform(transform, out);
        out = {
          type: 'source',
          transform: outTransform,
          source: out,
          fields: out.fields,
          name: out.name,
          subModels: out.subModels,
          sources:
            out.sources.length === 1 &&
            out.sources[0].implementsTransform(outTransform)
              ? out.sources
              : [new UnresolveableSource()],
        };
      }
      // handle sources if they're not capable of the transforms
    }
    if (from.shape) {
      out.shape = this.getShape(from.shape, out);
      contextualisedFrom.sources = uniq(
        contextualisedFrom.sources.concat(combineSources(out.shape))
      );
    } else {
      contextualisedFrom.shape = contextualisedFrom.fields;
    }
    return out;
  }

  handleTo(to: To, from?: ContextualisedSource) {
    const contextualisedTo: ContextualisedSource = {
      type: 'source',
      fields: [],
      sources: [],
    };
    let out = contextualisedTo;
    if (to.source) {
      contextualisedTo.source = this.handleSource([to.source]);
      this.aggregateSources(contextualisedTo);
    }
    if (to.transforms.length) {
      for (const transform of to.transforms) {
        out = {
          type: 'source',
          transform: this.getTransform(transform, out),
          source: out,
          fields: out.fields,
          name: out.name,
          subModels: out.subModels,
          sources: out.sources, // TODO: combine with if source supports transform
        };
      }
    }
    if (to.shape) {
      out.shape = this.getShape(to.shape, out);
      out.sources = uniq(out.sources.concat(combineSources(out.shape)));
    }
    return contextualisedTo;
  }

  handleSource(sources: (Source | Join | Model)[]) {
    const contextualisedSources: (ContextualisedSource | Join)[] = [];
    for (const source of sources) {
      if (source.type === 'join') {
        contextualisedSources.push(source);
        continue;
      }

      let contextualisedSource: ContextualisedSource = {
        type: 'source',
        fields: [],
        subModels: [],
        sources: [],
      };
      // TODO: handle joins
      if (source.value?.type === 'alphachain') {
        const model = this.getModel(source.value);

        contextualisedSource.subModels = [model];
      } else if (source.value?.type === 'from') {
        const contextualisedFrom = this.handleFrom(source.value);
        contextualisedSource = contextualisedFrom;
      }

      contextualisedSource.sources = uniq(
        combineSources(contextualisedSource.subModels || [])
      );

      // TODO: make sure the aliases are scoped correctly
      if (source.alias)
        this.state.aliases.set(
          typeof source.alias === 'string'
            ? source.alias
            : [source.alias.root, ...source.alias.parts].join(''),
          contextualisedSource
        );
      contextualisedSource.name =
        source.alias || contextualisedSource.subModels?.[0].name;

      const initialSubfields: ContextualisedField[] = [];
      contextualisedSource.fields = uniqBy(
        [
          { ...contextualisedSource, transforms: [] },
          ...(contextualisedSource.subModels || []),
          ...(contextualisedSource.subModels || []).reduce(
            (acc, model) => acc.concat(model.fields || []),
            initialSubfields
          ),
        ],
        'name'
      );

      contextualisedSource.fields[0].fields = contextualisedSource.fields;

      contextualisedSources.push(contextualisedSource);
    }
    return contextualisedSources;
  }

  getModel(alphachain: Alphachain) {
    // TODO: handle parts
    let model;
    if (this.state.aliases.has(alphachain.root)) {
      model = this.state.aliases.get(alphachain.root);
    } else if (this.models.has(alphachain.root)) {
      model = this.models.get(alphachain.root);
    }
    if (!model)
      throw new Error(`Failed to find model ${JSON.stringify(alphachain)}`);

    for (let part of alphachain.parts) {
      model = model?.fields?.find?.(({ name }) => name === part);
      if (!model)
        throw new Error(
          `Failed to find model ${JSON.stringify(alphachain)} at part "${part}"`
        );
      if (model.type === 'exprtree' || model.type === 'param')
        throw new Error('Exprtrees and params cannot be used as models');
    }
    return model;
  }

  getTransform(
    transform: Transform,
    model: ContextualisedSource
  ): ContextualisedTransform {
    const match = this.transforms.find(
      (tr) => tr.name === transform.description.root
    );
    if (!match)
      throw new Error(`Unrecognised transform ${transform.description.root}`);

    return {
      type: 'transform',
      name: match.name,
      modifier: transform.description.parts.filter(
        (part) => match.modifiers && match.modifiers.indexOf(part) !== -1
      ),
      args: transform.args.map((arg) => this.getExpression(arg, model)),
      sources: [],
    };
  }

  getShape(shape: Shape, model: ContextualisedSource) {
    const out = [];
    for (let field of shape.fields) {
      out.push(this.getField(field, model));
    }
    return out;
  }

  getField(field: Field, model: ContextualisedSource): ContextualisedField {
    let contextualisedField: ContextualisedField;
    if (field.value?.type === 'from') {
      contextualisedField = this.handleFrom(field.value);
    } else {
      contextualisedField = this.getExpression(field.value, model);
    }

    contextualisedField.name = field.alias || contextualisedField.name;
    return contextualisedField;
  }

  getExpression(
    expr: ExprUnary,
    model: ContextualisedSource
  ): ContextualisedField | ContextualisedExpr {
    if (expr.type === 'alphachain') {
      const parts = [expr.root].concat(expr.parts);
      let field: ContextualisedField = model;
      let mod: ContextualisedField = model;
      while (parts.length) {
        const part = parts.shift();
        mod = field;
        if (!field.fields) {
          throw new Error(
            `Unable to find nested field ${part} on ${field.name}`
          );
        }
        const subField: ContextualisedField | undefined = field.fields.find(
          (f) => f.name === part
        );
        if (subField) {
          if (subField.type === 'datafield' && field.type === 'source')
            subField.from = field;
          field = subField;
        }
      }
      return field;
    }
    if (expr.type === 'exprtree') {
      const args = expr.args.map((arg) => this.getExpression(arg, model));
      return {
        ...expr,
        args,
        sources: combineSources(args),
      };
    }
    if (expr.type === 'param') {
      return { type: 'param', index: expr.index } as ContextualisedParam;
    }
    throw new Error('Invalid expression type');
  }
}

export default function contextualise(
  ast: Query,
  models: Map<string, DataModel>,
  transforms: TransformDef[]
) {
  return new Contextualiser(models, transforms).run(ast);
}
