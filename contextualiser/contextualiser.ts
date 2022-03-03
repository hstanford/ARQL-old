/* TODO:
- pass required fields down so the interface of a delegated query is clear
- default support for left join (to support `users {id, details}` where relationship details is in a different source)
*/

import type {
  Alphachain,
  Dest,
  Field,
  Model,
  Modifier,
  Query,
  Transform,
  Shape,
  Source,
  ExprUnary,
} from 'arql-parser';

type operatorOp = (...args: any[]) => any;
type transformFn = (...args: any[]) => any;

export interface DataSourceOpts {
  operators: Map<string, (...args: any[]) => any>,
  transforms: Map<string, (...args: any[]) => any>
}

export abstract class DataSource<ModelType, FieldType> {
  models: Map<string, ModelType> = new Map();
  operators: Map<string, operatorOp> = new Map();
  transforms: Map<string, transformFn> = new Map();

  add(def: DataModel) {}

  getField(
    modelName: string,
    fieldName: string,
    ...parts: string[]
  ): ModelType | FieldType {
    throw new Error('Not implemented');
  }

  async resolve(subquery: ContextualisedQuery | ContextualisedSource, params: any[]): Promise<any> {

  }

  implementsOp(opName: string) {
    return this.operators.has(opName);
  }

  implementsTransform(transform: ContextualisedTransform) {
    return this.transforms.has(transform.name); // TODO: make it check modifiers and args
  }
}

export class UnresolveableSource extends DataSource<any, any> {}

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
  source?: ContextualisedSource;
  dest?: ContextualisedSource;
  modifier?: Modifier;
  sources: DataSource<any, any>[];
}

export interface ContextualisedSource {
  type: 'source';
  value:
    | (DataModel | ContextualisedSource | DataField)[]
    | DataModel
    | ContextualisedSource
    | DataField;
  fields: ContextualisedField[];
  name?: Alphachain | string;
  subModels?: (DataModel | ContextualisedSource | DataField)[];
  shape?: ContextualisedField[];
  sources: DataSource<any, any>[];
  transform?: ContextualisedTransform;
}

export interface ContextualisedTransform {
  type: 'transform';
  name: string;
  modifier: string[];
  args: (ContextualisedField | ContextualisedExpr | ContextualisedField[])[];
  sources: DataSource<any, any>[];
}

export interface ContextualisedExpr {
  type: 'exprtree';
  op: string;
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

// singleton for uniqueness detection
export const Unresolveable = new UnresolveableSource();

export class Contextualiser {
  models: Map<string, DataModel>;
  transforms: TransformDef[];
  constructor(models: Map<string, DataModel>, transforms: TransformDef[]) {
    this.models = models;
    this.transforms = transforms;
  }

  run(ast: Query) {
    const contextualisedQuery: ContextualisedQuery = {
      type: ast.type,
      modifier: ast.modifier,
      sources: [],
    };
    const context: ContextualiserState = {
      aliases: new Map(),
    };
    if (ast.source) {
      contextualisedQuery.source = this.handleSource(ast.source, context);
    }
    if (ast.dest) {
      contextualisedQuery.dest = this.handleDest(ast.dest, context);
    }
    contextualisedQuery.sources = uniq(
      (contextualisedQuery?.source?.sources || []).concat(
        contextualisedQuery?.dest?.sources || []
      )
    );
    return contextualisedQuery;
  }

  aggregateSources(contSource: ContextualisedSource) {
    const sources = contSource.value
      ? Array.isArray(contSource.value)
        ? contSource.value
        : [contSource.value]
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
    contSource.name = (sources[0] || contSource.subModels?.[0])?.name;
    contSource.sources = uniq(combineSources(contSource.subModels));
  }

  handleSource(source: Source, context: ContextualiserState) {
    const contextualisedSource: ContextualisedSource = {
      type: 'source',
      fields: [],
      value: [],
      sources: [],
    };
    if (Array.isArray(source.value)) {
      contextualisedSource.value = source.value.map((s) =>
        this.handleSource(s, context)
      );
      this.aggregateSources(contextualisedSource);
    } else if (source.value?.type === 'alphachain') {
      const model = this.getModel(source.value, context);

      contextualisedSource.value = model;
      contextualisedSource.subModels = [model];
      if (model.fields)
        contextualisedSource.fields = model.fields; // need contextualising?
      // TODO: fix this hack by passing required fields back down
      contextualisedSource.sources =
        model?.fields?.[0] && model.fields[0].type === 'datafield'
          ? [model.fields[0].source]
          : [];
      // TODO: sources independent from shape if inner join?
    }

    if (
      !Array.isArray(contextualisedSource.value) &&
      contextualisedSource.value.type === 'datafield'
    ) {
      contextualisedSource.sources.push(contextualisedSource.value.source);
    }

    // TODO: revise this (doesn't make sense for Array source.value)
    contextualisedSource.name =
      source.alias || contextualisedSource.subModels?.[0].name;

    const key =
      typeof contextualisedSource.name === 'string'
        ? contextualisedSource.name
        : contextualisedSource.name?.root;
    if (key) context.aliases.set(key, contextualisedSource);


    let out = contextualisedSource;
    if (source.transforms.length) {
      for (const transform of source.transforms) {
        const outTransform = this.getTransform(transform, out, context);
        out = {
          type: 'source',
          transform: outTransform,
          value: [out],
          fields: out.fields,
          name: out.name,
          subModels: out.subModels,
          sources:
            out.sources.length === 1 &&
            out.sources[0].implementsTransform(outTransform)
              ? out.sources
              : out.sources.concat([Unresolveable]),
        };
      }
    }

    for (let field of out.fields) {
      if (field.type === 'datafield')
        context.aliases.set(field.name, field);
    }

    if (source.shape) {
      out.shape = this.getShape(source.shape, out, context);
    } else {
      out.shape = out.fields;
    }
    out.sources = uniq(out.sources.concat(combineSources(out.shape)));

    return out;
  }

  handleDest(dest: Dest, context: ContextualiserState) {
    const contextualisedDest: ContextualisedSource = {
      type: 'source',
      fields: [],
      value: [],
      sources: [],
    };
    let out = contextualisedDest;
    contextualisedDest.value = this.getModel(
      {
        type: 'alphachain',
        root: dest.value,
        parts: [],
      },
      context
    );
    if (dest.transforms.length) {
      for (const transform of dest.transforms) {
        out = {
          type: 'source',
          transform: this.getTransform(transform, out, context),
          value: [out],
          fields: out.fields,
          name: out.name,
          subModels: out.subModels,
          sources: out.sources, // TODO: combine with if source supports transform
        };
      }
    }
    if (dest.shape) {
      out.shape = this.getShape(dest.shape, out, context);
      out.sources = uniq(out.sources.concat(combineSources(out.shape)));
    }
    return contextualisedDest;
  }

  getModel(alphachain: Alphachain, context: ContextualiserState) {
    // TODO: handle parts
    let model;
    if (context.aliases.has(alphachain.root)) {
      model = context.aliases.get(alphachain.root);
    } else if (this.models.has(alphachain.root)) {
      model = this.models.get(alphachain.root);
    }

    let prevModel: any = model;

    if (model?.type === 'source') {
      model = model?.subModels?.[0];
    }

    if (!model) {
      throw new Error(`Failed to find model ${JSON.stringify(alphachain)}`);
    }

    for (let part of alphachain.parts) {
      model = model?.fields?.find?.(({ name }) => name === part);
      if (!model)
        throw new Error(
          `Failed to find model ${JSON.stringify(alphachain)} at part "${part}"`
        );
      model = { ...model, from: prevModel };
      prevModel = model;
      if (model.type === 'exprtree' || model.type === 'param')
        throw new Error('Exprtrees and params cannot be used as models');
    }
    return model;
  }

  getTransform(
    transform: Transform,
    model: ContextualisedSource,
    context: ContextualiserState
  ): ContextualisedTransform {
    const match = this.transforms.find(
      (tr) => tr.name === transform.description.root
    );
    if (!match)
      throw new Error(`Unrecognised transform ${transform.description.root}`);

    // TODO: handle shape modification e.g. groups
    return {
      type: 'transform',
      name: match.name,
      modifier: transform.description.parts.filter(
        (part) => match.modifiers && match.modifiers.indexOf(part) !== -1
      ),
      args: transform.args.map(
        (arg): ContextualisedField | ContextualisedField[] => {
          if (arg.type === 'exprtree') return this.getExpression(arg, model, context);
          if (arg.type === 'source') return this.handleSource(arg, context);
          if (arg.type === 'shape') return this.getShape(arg, model, context);
          throw new Error('Unrecognised arg type');
        }
      ),
      sources: [],
    };
  }

  getShape(
    shape: Shape,
    model: ContextualisedSource,
    context: ContextualiserState
  ) {
    const out = [];
    for (let field of shape.fields) {
      out.push(this.getField(field, model, context));
    }
    return out;
  }

  getField(
    field: Field,
    model: ContextualisedSource,
    context: ContextualiserState
  ): ContextualisedField {
    let contextualisedField: ContextualisedField;
    if (field.value?.type === 'source') {
      contextualisedField = this.handleSource(field.value, context);
    } else {
      contextualisedField = this.getExpression(field.value, model, context);
    }

    contextualisedField.name = field.alias || contextualisedField.name;
    return contextualisedField;
  }

  getExpression(
    expr: ExprUnary,
    model: ContextualisedSource,
    context: ContextualiserState,
  ): ContextualisedField | ContextualisedExpr {
    if (expr.type === 'alphachain') {
      const parts = [expr.root].concat(expr.parts);
      let field: ContextualisedField = model;
      let mod: ContextualisedField = model;
      while (parts.length) {
        const part = parts.shift();
        if (!part) continue;
        mod = field;
        if (!field.fields) {
          throw new Error(
            `Unable to find nested field ${part} on ${field.name}`
          );
        }
        let subField: ContextualisedField | undefined = field.fields.find(
          (f) => f.name === part
        );
        if (!subField) {
          subField = context.aliases.get(part);
        }
        if (subField) {
          if (subField.type === 'datafield' && field.type === 'source')
            subField.from = field;
          field = subField;
        }
      }
      return field;
    }
    if (expr.type === 'exprtree') {
      const args = expr.args.map((arg) => this.getExpression(arg, model, context));
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
