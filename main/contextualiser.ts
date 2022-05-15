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

import {
  Alphachain,
  ContextualisedExpr,
  ContextualisedField,
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
  isAlphachain,
  isDataField,
  isDataModel,
  isDataReference,
  isExpr,
  isMultiShape,
  isParam,
  isShape,
  isSource,
  isWildcard,
  PerhapsContextualisedField,
  Query,
  Shape,
  Source,
  Transform,
  TransformDef,
} from './types.js';

import type { ARQLParser } from './parser';

import { combine } from './sources.js';

import { uniq, uniqBy, getAlias, getSourceName } from './util.js';

function shapeToField (source: ContextualisedSourceValue) {
  if (!isSource(source) || !source.shape || isMultiShape(source.shape)) {
    throw new Error('Cannot map shape');
  }
  return source.shape.map(
    (f) =>
      ({
        type: 'datafield',
        from: source,
        name: f.alias,
        source: getSourcesFromContextualisedField(f),
      } as DataField)
  );

}

function getFieldsFromSource(
  source: ContextualisedSourceValue
): ContextualisedField[] {
  let fields = [];
  if (isSource(source)) {
    fields = source.fields;
    if (source.shape && !isMultiShape(source.shape)) {
      fields = shapeToField(source);
    }
  } else if (isDataModel(source)) {
    fields = source.fields.filter(isDataField);
  } else {
    throw new Error(
      `Unsupported source type ${source.type} for extracting fields`
    );
  }
  return fields;
}

function getSubmodels(source: ContextualisedSourceValue) {
  let subModels: ContextualisedSourceValue[] = [];
  if (isSource(source)) {
    subModels = source.subModels || [];
  } else if (isDataModel(source)) {
    return [source];
  } else {
    throw new Error(
      `Unsupported source type ${source.type} for extracting subModels`
    );
  }
  return subModels;
}

function getSourcesFromSourceValue(source: ContextualisedSourceValue) {
  const firstField = source?.fields?.[0];
  if (isSource(source)) {
    return source.sources;
  } else if (isDataField(firstField)) {
    return getSourcesFromDataField(firstField);
  } else {
    return [];
  }
}

function getSourcesFromDataField(dataField: DataField) {
  if (Array.isArray(dataField.source)) {
    return dataField.source;
  } else {
    return [dataField.source].filter((i) => !!i);
  }
}

function getSourcesFromContextualisedField(field: ContextualisedField) {
  if (isDataField(field)) {
    return getSourcesFromDataField(field);
  } else if (isDataModel(field)) {
    return getSourcesFromSourceValue(field);
  } else if (isParam(field)) {
    return [];
  } else {
    return field.sources;
  }
}

function aggregateQuerySources(query: ContextualisedQuery) {
  return uniq(query?.source?.sources || []).concat(query?.dest?.sources || []);
}

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
    contextualisedQuery.sources = aggregateQuerySources(contextualisedQuery);
    return contextualisedQuery;
  }

  aggregateSources(contSource: ContextualisedSource) {
    if (Array.isArray(contSource.value)) {
      contSource.fields = [];
      contSource.subModels = [];
      for (let source of contSource.value) {
        contSource.fields.push(...getFieldsFromSource(source));
        contSource.subModels.push(...getSubmodels(source));
      }
      contSource.fields = uniqBy(contSource.fields, 'name');
      contSource.subModels = uniqBy(contSource.subModels, 'name');
    } else {
      contSource.fields = getFieldsFromSource(contSource.value);
      contSource.subModels = getSubmodels(contSource.value);
    }
    contSource.name = getSourceName(contSource);
    contSource.sources = uniq(combine(contSource.subModels || []));
  }

  transformSource(
    source: ContextualisedSource,
    transform: Transform,
    context: ContextualiserState
  ): ContextualisedSource {
    const outTransform = this.getTransform(transform, source, context);
    return {
      type: 'source',
      transform: outTransform,
      value:
        Array.isArray(source.value) && !source.transform
          ? source.value
          : source,
      fields: source.fields,
      name: getAlias(source.alias || source.name),
      subModels: source.subModels,
      sources: uniq(source.sources.concat(outTransform.sources)),
    };
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
    } else if (isSource(source.value)) {
      contextualisedSource.value = this.handleSource(source.value, context);
      this.aggregateSources(contextualisedSource);
    } else if (isAlphachain(source.value)) {
      const model = this.getModel(source.value, context);

      contextualisedSource.value = model;
      contextualisedSource.subModels = [model];
      if (model.fields)
        contextualisedSource.fields = (
          model.fields as PerhapsContextualisedField[]
        ).filter(isDataField); // need contextualising?
      // TODO: fix this hack by passing required fields back down
      const firstField = model?.fields?.[0];
      contextualisedSource.sources = getSourcesFromSourceValue(model);
      // TODO: sources independent from shape if inner join?
    }

    if (
      !Array.isArray(contextualisedSource.value) &&
      isDataField(contextualisedSource.value)
    ) {
      contextualisedSource.sources.push(
        ...getSourcesFromSourceValue(contextualisedSource.value)
      );
    }

    contextualisedSource.name = getSourceName(contextualisedSource);

    if (source.alias) {
      context.aliases.set(source.alias, contextualisedSource);
      contextualisedSource.alias = source.alias;
    }
    if (contextualisedSource.name)
      context.aliases.set(contextualisedSource.name, contextualisedSource);

    let out = contextualisedSource;
    if (source.transforms.length) {
      for (const transform of source.transforms) {
        out = this.transformSource(out, transform, context);
      }
    }

    for (let field of out.fields) {
      if (isDataField(field)) context.aliases.set(field.name, field);
    }

    if (source.shape) {
      out.shape = this.getShape(source.shape, out, context);
      if (!out.fields?.length && !isMultiShape(out.shape)) {
        out.fields = shapeToField(out);
      }
    } else {
      out.shape = out.fields;
    }
    if (!isMultiShape(out.shape)) {
      out.sources = uniq(out.sources.concat(combine(out.shape)));
    }
    
    return out;
  }

  handleDest(dest: Dest, context: ContextualiserState) {
    const model = this.getModel(
      {
        type: 'alphachain',
        root: dest.value,
        parts: [],
      },
      context
    );

    const firstField = model.fields?.[0];

    let out: ContextualisedSource = {
      type: 'source',
      fields: ((model.fields || []) as PerhapsContextualisedField[]).filter(
        isDataField
      ),
      value: model,
      // TODO: fix this hack by passing required fields back down
      sources: isDataField(firstField)
        ? getSourcesFromDataField(firstField)
        : [],
      name: model.name,
    };

    if (dest.transforms.length) {
      for (const transform of dest.transforms) {
        out = this.transformSource(out, transform, context);
      }
    }
    if (dest.shape) {
      out.shape = this.getShape(dest.shape, out, context);
      if (isMultiShape(out.shape)) {
        throw new Error('Cannot doubly nest shapes yet');
      }
      out.sources = uniq(out.sources.concat(combine(out.shape)));
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
    const name = getAlias(model.alias || model.name);
    const trfms = this.parser(
      dataReference.join(name, dataReference.other.name),
      'transforms'
    );
    const source: ContextualisedSource = {
      type: 'source',
      name,
      value: model,
      fields: (model.fields as any[]).filter(isDataField),
      sources: getSourcesFromSourceValue(model),
    };

    const firstOtherField = dataReference.other.fields?.[0];
    let out: ContextualisedSource = {
      type: 'source',
      name: dataReference.other.name,
      value: dataReference.other,
      fields: dataReference.other.fields.filter(isDataField),
      sources: uniq(
        (isDataField(firstOtherField)
          ? getSourcesFromDataField(firstOtherField)
          : []
        ).concat(source.sources)
      ),
    };

    for (const trfm of trfms) {
      out = this.transformSource(out, trfm, context);
    }
    if (!out) {
      throw new Error('Datareference without a transform');
    }
    return out;
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

    // TODO: fix - eek this is nasty
    if (isSource(model)) {
      model = model?.subModels?.[0];
    }

    if (!model) {
      throw new Error(`Failed to find model ${JSON.stringify(alphachain)}`);
    }

    for (let part of alphachain.parts) {
      const fields: PerhapsContextualisedField[] = model?.fields || [];
      for (let subModel of fields) {
        if (
          subModel.name === part ||
          (!isDataReference(subModel) && subModel.alias === part)
        ) {
          if (isDataReference(subModel)) {
            if (!model || isDataField(model)) {
              throw new Error('Invalid model for data references');
            }
            model = this.getDataReference(model, subModel, context);
          } else {
            if (isExpr(subModel) || isParam(subModel)) {
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
      if (isDataModel(model) || isSource(model)) {
        prevModel = model;
      } else {
        model = {
          ...model,
          from: isSource(prevModel) ? prevModel : undefined,
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
        if (isExpr(arg) || isAlphachain(arg))
          return this.getExpression(arg, model, context);
        if (isSource(arg)) return this.handleSource(arg, context);
        if (isShape(arg)) {
          const shape = this.getShape(arg, model, context);
          if (isMultiShape(shape)) {
            throw new Error('Cannot doubly nest shapes yet');
          }
          return shape;
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
        args.reduce<DataSource<any, any>[]>((acc, arg) => {
          // TODO: handle more arg types
          if (!Array.isArray(arg) && isExpr(arg)) {
            return acc.concat(arg.sources);
          }
          return acc;
        }, [])
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
        if (isMultiShape(contextualised)) {
          throw new Error('Cannot doubly nest shapes yet');
        }
        return contextualised;
      });
    }
    const out = [];
    for (let field of shape.fields) {
      if (isWildcard(field)) {
        if (field.parts?.length) {
          throw new Error('Not yet supported');
        }
        if (field.root) {
          if (Array.isArray(model.value)) {
            for (let val of model.value) {
              if (
                (field.root === val.alias || field.root === val.name) &&
                val.fields
              ) {
                for (let f of val.fields) {
                  if (!isDataReference(f)) out.push(f);
                }
              }
            }
          } else {
            // TODO: handle deep models?
            out.push(...model.fields);
          }
        } else {
          out.push(...model.fields);
        }
      } else {
        out.push(this.getField(field, model, context));
      }
    }
    return out;
  }

  getField(
    field: Field,
    model: ContextualisedSource,
    context: ContextualiserState
  ): ContextualisedField {
    let contextualisedField: ContextualisedField;
    if (isSource(field.value)) {
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
    if (isAlphachain(expr)) {
      const parts = [expr.root].concat(expr.parts);
      let field: ContextualisedField = model;
      while (parts.length) {
        const part = parts.shift();
        if (!part) continue;
        if (!field.fields) {
          throw new Error(
            `Unable to find nested field ${part} on ${field.name}`
          );
        }
        const subField: ContextualisedField | undefined =
          (field.fields as PerhapsContextualisedField[])
            .filter(function (f): f is ContextualisedField {
              return !isDataReference(f);
            })
            .find((f) => f.name === part || f.alias === part) ||
          context.aliases.get(part) ||
          this.models.get(part);

        if (!subField) {
          throw new Error(`Can't find subfield for ${part}`);
        }
        if (isDataField(subField) && isSource(field)) subField.from = field;
        field = subField;
      }
      return field;
    } else if (isExpr(expr)) {
      const args = expr.args.map((arg) =>
        this.getExpression(arg, model, context)
      );
      return {
        ...expr,
        args,
        sources: combine(args),
      };
    } else if (isParam(expr)) {
      return { type: 'param', index: expr.index };
    } else {
      throw new Error(`Invalid expression type ${expr.type}`);
    }
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
