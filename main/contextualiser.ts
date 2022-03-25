/* TODO:
- pass required fields down so the interface of a delegated query is clear
- default support for left join (to support `users {id, details}` where relationship details is in a different source)
*/

import type {
  Alphachain,
  ContextualisedExpr,
  ContextualisedField,
  ContextualisedParam,
  ContextualisedQuery,
  ContextualisedSource,
  ContextualisedTransform,
  ContextualiserState,
  DataField,
  DataModel,
  DataSource,
  Dest,
  ExprUnary,
  Field,
  Query,
  Shape,
  Source,
  Transform,
  TransformDef,
} from './types.js';

import { Unresolveable, combine } from './sources.js';

import { uniq, uniqBy } from './util.js';

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
    contSource.sources = uniq(combine(contSource.subModels));
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
      const thing = contextualisedSource.value?.[1];
    } else if (source.value?.type === 'alphachain') {
      const model = this.getModel(source.value, context);

      contextualisedSource.value = model;
      contextualisedSource.subModels = [model];
      if (model.fields) contextualisedSource.fields = model.fields; // need contextualising?
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
            uniq((out.sources.length === 1 &&
            out.sources[0].implementsTransform(outTransform)
              ? out.sources
              : out.sources.concat([Unresolveable])).concat(outTransform.sources)),
        };
      }
    }

    for (let field of out.fields) {
      if (field.type === 'datafield') context.aliases.set(field.name, field);
    }

    if (source.shape) {
      out.shape = this.getShape(source.shape, out, context);
    } else {
      out.shape = out.fields;
    }
    out.sources = uniq(out.sources.concat(combine(out.shape)));

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
      out.sources = uniq(out.sources.concat(combine(out.shape)));
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

    const args = transform.args.map(
      (arg): ContextualisedField | ContextualisedField[] => {
        if (arg.type === 'exprtree' || arg.type === 'alphachain')
          return this.getExpression(arg, model, context);
        if (arg.type === 'source') return this.handleSource(arg, context);
        if (arg.type === 'shape') return this.getShape(arg, model, context);
        throw new Error(`Unrecognised arg type`);
      }
    );

    // TODO: handle shape modification e.g. groups
    return {
      type: 'transform',
      name: match.name,
      modifier: transform.description.parts.filter(
        (part) => match.modifiers && match.modifiers.indexOf(part) !== -1
      ),
      args,
      sources: uniq(args.reduce((acc, arg) => {
        // TODO: handle more arg types
        if (!Array.isArray(arg) && arg.type === 'exprtree') {
          return acc.concat(arg.sources);
        }
        return acc;
      }, [] as DataSource<any, any>[])),
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

    if (field.alias) {
      contextualisedField = { ...contextualisedField, alias: field.alias };
    }

    return contextualisedField;
  }

  getExpression(
    expr: ExprUnary,
    model: ContextualisedSource,
    context: ContextualiserState
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
        if (!subField) {
          // think it must be a model
          return this.handleSource({
            type: 'source',
            alias: expr.root, // probably should handle parts
            value: expr,
            transforms: [],
            shape: null,
          }, context);
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
      const args = expr.args.map((arg) =>
        this.getExpression(arg, model, context)
      );
      return {
        ...expr,
        args,
        sources: combine(args),
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
