/**
 * CONTEXTUALISER
 *
 * The Contextualiser's role is to take an AST (Abstract Syntax Tree) returned from the Parser
 * and to add knowledge of what data can be provided. It depends on the AST structure and on
 * the models configured. If the models are stored in different storage engines or databases
 * the contextualiser bubbles up which data sources will be required to resolve data at each level.
 */

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
  ContextualisedSourceValue,
  ContextualisedTransform,
  ContextualiserState,
  DataField,
  DataModel,
  DataReference,
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

import type { ARQLParser } from './parser';

import { combine } from './sources.js';

import { uniq, uniqBy } from './util.js';

export class Contextualiser {
  models: Map<string, DataModel>;
  transforms: TransformDef[];
  parser: ARQLParser;
  constructor(
    models: Map<string, DataModel>,
    transforms: TransformDef[],
    parser: ARQLParser
  ) {
    this.models = models;
    this.transforms = transforms;
    this.parser = parser;
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
    if (Array.isArray(contSource.value)) {
      contSource.fields = uniqBy(
        contSource.value.reduce(
          (acc, source) =>
            acc.concat(source.type === 'source' ? source.fields : []),
          [] as ContextualisedField[]
        ) || [],
        'name'
      );
      contSource.subModels = uniqBy(
        contSource.value.reduce(
          (acc, source) =>
            source?.type === 'source'
              ? acc.concat(source.subModels || [])
              : acc,
          [] as ContextualisedSourceValue[]
        ) || [],
        'name'
      );

      contSource.name = (
        contSource.value[0] || contSource.subModels?.[0]
      )?.name;
      contSource.sources = uniq(combine(contSource.subModels));
    } else {
      contSource.fields =
        contSource.value.type === 'source' ? contSource.value.fields : [];
      contSource.subModels =
        contSource.value?.type === 'source'
          ? contSource.value.subModels
          : undefined;
      contSource.name = (contSource.value || contSource.subModels?.[0])?.name;
      contSource.sources = uniq(combine(contSource.subModels || []));
    }
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
    } else if (source.value?.type === 'source') {
      contextualisedSource.value = this.handleSource(source.value, context);
      this.aggregateSources(contextualisedSource);
    } else if (source.value?.type === 'alphachain') {
      const model = this.getModel(source.value, context);

      contextualisedSource.value = model;
      contextualisedSource.subModels = [model];
      if (model.fields)
        contextualisedSource.fields = (model.fields as any).filter(
          (f: any) => f.type === 'datafield'
        ) as DataField[]; // need contextualising?
      // TODO: fix this hack by passing required fields back down
      contextualisedSource.sources = (model.type === 'source' && model.sources) ||
        (model?.fields?.[0] && model.fields[0].type === 'datafield'
          ? [model.fields[0].source]
          : []);
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
          value: Array.isArray(out.value) && !out.transform ? out.value : out,
          fields: out.fields,
          name: out.name,
          subModels: out.subModels,
          sources: uniq(out.sources.concat(outTransform.sources)),
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
    if (!Array.isArray(out.shape[0])) {
      // should be type guard for ContextualisedField[][]
      out.sources = uniq(
        out.sources.concat(combine(out.shape as ContextualisedField[]))
      );
    }

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
    const model = this.getModel(
      {
        type: 'alphachain',
        root: dest.value,
        parts: [],
      },
      context
    );

    contextualisedDest.value = model;
    contextualisedDest.fields = ((model.fields || []) as DataField[]).filter?.(
      (f) => f.type === 'datafield'
    );
    contextualisedDest.name = model.name;

    // TODO: fix this hack by passing required fields back down
    contextualisedDest.sources =
      model?.fields?.[0] && model.fields[0].type === 'datafield'
        ? [model.fields[0].source]
        : [];

    if (dest.transforms.length) {
      for (const transform of dest.transforms) {
        out = {
          type: 'source',
          transform: this.getTransform(transform, out, context),
          value: out,
          fields: out.fields,
          name: out.name,
          subModels: out.subModels,
          sources: out.sources, // TODO: combine with if source supports transform
        };
      }
    }
    if (dest.shape) {
      out.shape = this.getShape(dest.shape, out, context);
      if (Array.isArray(out.shape[0])) {
        // should be type guard for ContextualisedField[][]
        throw new Error('Cannot doubly nest shapes yet');
      }
      out.sources = uniq(
        out.sources.concat(combine(out.shape as ContextualisedField[]))
      );
    } else {
      out.shape = out.fields;
    }
    return out;
  }

  getDataReference(
    model: ContextualisedSource | DataModel,
    dataReference: DataReference,
    context: ContextualiserState
  ): ContextualisedSource {
    const name = model.alias || model.name;
    if (!name || typeof name !== 'string')
      throw new Error('Data reference only supported for strings');
    const trfm = this.parser(
      dataReference.join(name, dataReference.other.name),
      'transform'
    );
    const source: ContextualisedSource = {
      type: 'source',
      name,
      value: model,
      fields: (model.fields as any[]).filter(function (f: any): f is DataField { return f.type === 'datafield' }),
      sources:
        model.type === 'source'
          ? model.sources
          : model.fields[0].type === 'datafield'
          ? [model.fields[0].source]
          : [],
    };
    const transform = this.getTransform(trfm, source, context);
    const outSources =
      dataReference.other.fields[0].type === 'datafield'
        ? [dataReference.other.fields[0].source]
        : [];
    return {
      type: 'source',
      name: dataReference.other.name,
      value: dataReference.other,
      fields: dataReference.other.fields.filter(function (f): f is DataField { return f.type === 'datafield' }),
      sources: uniq(outSources.concat(source.sources)),
      transform,
    };
  }

  getModel(alphachain: Alphachain, context: ContextualiserState) {
    // TODO: handle parts
    let model: ContextualisedSource | DataModel | DataField | undefined;
    if (context.aliases.has(alphachain.root)) {
      model = context.aliases.get(alphachain.root);
    } else if (this.models.has(alphachain.root)) {
      model = this.models.get(alphachain.root);
    }

    let prevModel = model;

    if (model?.type === 'source') {
      model = model?.subModels?.[0];
    }

    if (!model) {
      throw new Error(`Failed to find model ${JSON.stringify(alphachain)}`);
    }

    for (let part of alphachain.parts) {
      for (let subModel of model?.fields || []) {
        if (subModel.name === part) {
          if (subModel.type === 'datareference') {
            if (!model || model.type === 'datafield') {
              throw new Error('Invalid model for data references');
            }
            model = this.getDataReference(model, subModel, context);
          } else {
            if (subModel.type === 'exprtree' || subModel.type === 'param') {
              throw new Error(`${subModel.type} invalid for submodel`);
            }
            model = subModel;
          }
          break;
        }
      }
      if (!model)
        throw new Error(
          `Failed to find model ${JSON.stringify(alphachain)} at part "${part}"`
        );
      if (model.type === 'datamodel' || model.type === 'source') {
        prevModel = model;
      } else {
        model = {
          ...model,
          from: prevModel?.type === 'source' ? prevModel : undefined,
        };
        prevModel = model;
      }
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
        if (arg.type === 'shape') {
          const shape = this.getShape(arg, model, context);
          if (Array.isArray(shape[0])) {
            // should be type guard for ContextualisedField[][]
            throw new Error('Cannot doubly nest shapes yet');
          }
          return shape as ContextualisedField[];
        }
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
      sources: uniq(
        args.reduce((acc, arg) => {
          // TODO: handle more arg types
          if (!Array.isArray(arg) && arg.type === 'exprtree') {
            return acc.concat(arg.sources);
          }
          return acc;
        }, [] as DataSource<any, any>[])
      ),
    };
  }

  getShape(
    shape: Shape | Shape[],
    model: ContextualisedSource,
    context: ContextualiserState
  ): ContextualisedField[] | ContextualisedField[][] {
    if (Array.isArray(shape)) {
      return shape.map((subShape) => {
        const contextualised = this.getShape(subShape, model, context);
        if (Array.isArray(contextualised[0])) {
          // should be type guard for ContextualisedField[][]
          throw new Error('Cannot doubly nest shapes yet');
        }
        return contextualised as ContextualisedField[];
      });
    }
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
        let subField: ContextualisedField | undefined = (field.fields as any)
          .filter((f: any) => f.type === 'datafield')
          .find((f: any) => f.name === part);
        if (!subField) {
          subField = context.aliases.get(part);
        }
        if (!subField) {
          subField = this.models.get(part);
        }
        if (!subField) {
          throw new Error(`Can't find subfield for ${part}`);
        }
        if (subField.type === 'datafield' && field.type === 'source')
          subField.from = field;
        field = subField;
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
  transforms: TransformDef[],
  parser: ARQLParser
) {
  return new Contextualiser(models, transforms, parser).run(ast);
}
