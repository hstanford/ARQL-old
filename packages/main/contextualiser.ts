/**
 * CONTEXTUALISER
 *
 * The Contextualiser's role is to take an AST (Abstract Syntax Tree) returned from the Parser
 * and to add knowledge of what data can be provided. It depends on the AST structure and on
 * the models configured. If the models are stored in different storage engines or databases
 * the contextualiser bubbles up which data sources will be required to resolve data at each level.
 */

/* TODO:
- Fields of type source should remove required fields that are available in that source
*/

import {
  Alphachain,
  ContextualisedExpr,
  ContextualisedField,
  ContextualisedFunction,
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
  isAlphachain,
  isDataField,
  isDataModel,
  isDataReference,
  isExpr,
  isFunction,
  isMultiShape,
  isParam,
  isShape,
  isSource,
  isTransform,
  isWildcard,
  Query,
  Shape,
  Source,
  Transform,
  TransformDef,
} from './types.js';

import type { ARQLParser } from './parser';

import { combine } from './sources.js';

import { uniq, uniqBy, getAlias, getSourceName } from './util.js';

function combineFields(subFields: ContextualisedField[]) {
  const fields = [];
  for (const subField of subFields) {
    if (isSource(subField)) {
      // a source requires all the data that it mentions
      // but can't provide itself
      fields.push(...subField.requiredFields);
    } else if (isDataField(subField)) {
      // a data field being mentioned requires itself
      fields.push({ ...subField, alias: undefined });
      if (subField.from) {
        fields.push({
          type: 'datafield',
          from: subField.from,
          name: subField.from.name,
          source: getSourcesFromContextualisedField(subField.from),
        } as DataField);
      }
    } else if (isDataModel(subField)) {
      // a Data model doesn't put any requirements out
      //fields.push() ???
    } else if (isExpr(subField)) {
      // an expression requires all the fields mentioned
      fields.push(...subField.requiredFields);
    } else if (isParam(subField)) {
      // do nothing: no fields required
    } else if (isDataReference(subField)) {
      // do nothing: dataReference meaningless unless used
    } else if (isTransform(subField)) {
      fields.push(...subField.requiredFields);
    } else {
      throw new Error(`Unrecognised type ${(subField as any).type}`);
    }
  }
  return uniq(fields);
}

function shapeToAvailableFields(
  shape: ContextualisedField[] | ContextualisedField[][],
  source: ContextualisedSourceValue
): DataField[] {
  if (isMultiShape(shape)) {
    const fields: DataField[] = [];
    for (const f of shape) {
      fields.push(...shapeToAvailableFields(f, source));
    }
    return uniq(fields);
  }
  return shape.map(
    (f) =>
      ({
        type: 'datafield',
        from: source,
        name: f.alias,
        source: getSourcesFromContextualisedField(f),
      } as DataField)
  );
}

function getAvailableFieldsFromSource(
  source: ContextualisedSourceValue
): ContextualisedField[] {
  let fields = [];
  if (isSource(source)) {
    fields = source.availableFields;
    if (source.shape) {
      fields = shapeToAvailableFields(source.shape, source);
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
  const firstField = isSource(source)
    ? source?.availableFields?.[0]
    : source?.fields?.[0];
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
  } else if (isDataReference(field)) {
    // TODO: should get source of joining fields rather than models
    return uniq([field.model.source, field.other.source]);
  } else {
    return field.sources;
  }
}

function aggregateQuerySources(query: ContextualisedQuery) {
  return uniq(query?.source?.sources || []).concat(query?.dest?.sources || []);
}

function applyRequiredFields(
  source: ContextualisedSource,
  requiredFields: ContextualisedField[]
) {
  let required = requiredFields;
  if (source.transform) {
    required = required.concat(source.transform.requiredFields);
  }
  source.requiredFields = uniq([...source.requiredFields, ...requiredFields]);
  if (Array.isArray(source.value)) {
    // divide required fields by source
    for (let subSource of source.value) {
      if (!isSource(subSource)) return;
      const subFields = [];
      for (let field of requiredFields) {
        if (isDataField(field) && field.from === subSource) {
          subFields.push(field);
        }
      }
      applyRequiredFields(subSource, subFields);
    }
  } else if (isSource(source.value)) {
    applyRequiredFields(source.value, source.requiredFields);
  }
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
      const source = contextualisedQuery.source;
      // implicit wildcard
      if (!source.requiredFields.length && source.availableFields.length) {
        applyRequiredFields(source, combineFields(source.availableFields));
      }
    }
    if (ast.dest) {
      contextualisedQuery.dest = this.handleDest(ast.dest, context);
    }
    contextualisedQuery.sources = aggregateQuerySources(contextualisedQuery);
    return contextualisedQuery;
  }

  aggregateSources(contSource: ContextualisedSource) {
    if (Array.isArray(contSource.value)) {
      contSource.availableFields = [];
      contSource.subModels = [];
      for (let source of contSource.value) {
        contSource.availableFields.push(
          ...getAvailableFieldsFromSource(source)
        );
        contSource.subModels.push(...getSubmodels(source));
      }
      contSource.availableFields = uniqBy(contSource.availableFields, 'name');
      contSource.subModels = uniqBy(contSource.subModels, 'name');
    } else {
      contSource.availableFields = getAvailableFieldsFromSource(
        contSource.value
      );
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
    const outShape = outTransform.args
      .reverse()
      .find(function (arg): arg is ContextualisedField[] {
        return Array.isArray(arg);
      }); // is a contextualised shape
    if (outShape) {
      outTransform.args = outTransform.args.filter((arg) => arg !== outShape);
    }
    const outSource: ContextualisedSource = {
      type: 'source',
      transform: outTransform,
      value:
        Array.isArray(source.value) && !source.transform
          ? source.value
          : source,
      availableFields: source.availableFields,
      requiredFields: [],
      name: getAlias(source.alias || source.name),
      subModels: source.subModels,
      sources: uniq(source.sources.concat(outTransform.sources)),
      shape: outShape,
    };
    if (outShape) {
      return this.applySourceShape(outSource, outShape, context);
    } else {
      return outSource;
    }
  }

  shapeSource(
    source: ContextualisedSource,
    shape: Shape | Shape[],
    context: ContextualiserState
  ): ContextualisedSource {
    const outShape = this.getShape(shape, source, context);
    return this.applySourceShape(source, outShape, context);
  }

  applySourceShape(
    source: ContextualisedSource,
    shape: ContextualisedField[] | ContextualisedField[][],
    context: ContextualiserState
  ): ContextualisedSource {
    const sources = isMultiShape(shape) ? shape.map(combine) : [combine(shape)];
    const requiredFields = isMultiShape(shape)
      ? combineFields(
          shape.reduce<ContextualisedField[]>(
            (acc, subShape) => acc.concat(subShape),
            []
          )
        )
      : combineFields(shape);

    const out: ContextualisedSource = {
      type: 'source',
      value: Array.isArray(source.value) && !source.value.length ? [] : source,
      availableFields: [],
      requiredFields: [],
      name: getAlias(source.alias || source.name),
      subModels: source.subModels,
      sources: uniq(source.sources.concat(...sources)),
      shape,
    };
    out.availableFields = shapeToAvailableFields(shape, out);
    applyRequiredFields(out, requiredFields);
    return out;
  }

  handleSource(source: Source, context: ContextualiserState) {
    const contextualisedSource: ContextualisedSource = {
      type: 'source',
      availableFields: [],
      requiredFields: [],
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
      const availableFields = isSource(model)
        ? model.availableFields
        : model.fields;
      if (availableFields)
        contextualisedSource.availableFields = availableFields; // need contextualising?
      // TODO: fix this hack by passing required fields back down
      const firstField = availableFields?.[0];
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
    } else if (contextualisedSource.name) {
      context.aliases.set(contextualisedSource.name, contextualisedSource);
    }

    let out = contextualisedSource;
    if (source.transforms.length) {
      for (const transform of source.transforms) {
        out = this.transformSource(out, transform, context);
      }
    }

    for (let field of out.availableFields) {
      if (isDataField(field)) context.aliases.set(field.name, field);
    }

    if (source.shape) {
      out = this.shapeSource(out, source.shape, context);
    } else {
      // TODO: revise?
      out.shape = out.availableFields;
    }

    if (source.alias) {
      context.aliases.set(source.alias, out);
    }
    if (out.name) context.aliases.set(getAlias(out.name), out);

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

    const availableFields = isSource(model)
      ? model.availableFields
      : model.fields;
    const firstField = availableFields?.[0];

    let out: ContextualisedSource = {
      type: 'source',
      availableFields: availableFields || [],
      requiredFields: [],
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
      // TODO: is this right?
      out.shape = out.availableFields;
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
    const availableFields = isSource(model)
      ? model.availableFields
      : model.fields;
    const source: ContextualisedSource = {
      type: 'source',
      name,
      value: model,
      availableFields,
      requiredFields: [],
      sources: getSourcesFromSourceValue(model),
    };

    const firstOtherField = dataReference.other.fields?.[0];
    let out: ContextualisedSource = {
      type: 'source',
      name: dataReference.other.name,
      value: dataReference.other,
      availableFields: dataReference.other.fields,
      requiredFields: [],
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
    let model: ContextualisedSource | DataModel | DataField | undefined;
    if (context.aliases.has(alphachain.root)) {
      model = context.aliases.get(alphachain.root);
    } else if (this.models.has(alphachain.root)) {
      model = this.models.get(alphachain.root);
    }

    let prevModel = model;

    if (!model) {
      throw new Error(`Failed to find model ${JSON.stringify(alphachain)}`);
    }

    for (let part of alphachain.parts) {
      const fields: ContextualisedField[] =
        (isSource(model) ? model.availableFields : model?.fields) || [];
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
            if (
              isExpr(subModel) ||
              isParam(subModel) ||
              isTransform(subModel)
            ) {
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

    let requiredFields: ContextualisedField[] = [];
    for (let arg of args) {
      if (Array.isArray(arg)) {
        requiredFields = requiredFields.concat(arg);
      } else {
        requiredFields = requiredFields.concat([arg]);
      }
    }
    requiredFields = combineFields(requiredFields);

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
      requiredFields,
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
              const availableFields = isSource(val)
                ? val.availableFields
                : val.fields;
              if (
                (field.root === val.alias || field.root === val.name) &&
                availableFields
              ) {
                for (let f of availableFields) {
                  out.push(f);
                }
              }
            }
          } else {
            // TODO: handle deep models?
            out.push(...model.availableFields);
          }
        } else {
          out.push(...model.availableFields);
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
      // implicit wildcard
      if (
        !contextualisedField.requiredFields.length &&
        contextualisedField.availableFields.length
      ) {
        applyRequiredFields(
          contextualisedField,
          combineFields(contextualisedField.availableFields)
        );
      }
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
        let fields: ContextualisedField[] = [];
        if (isExpr(field) || isParam(field)) {
          throw new Error(
            `Cannot find nested field ${part} on ${
              isExpr(field) ? 'expr' : 'param'
            }`
          );
        } else if (isSource(field)) {
          fields = field.availableFields;
        } else if (isDataField(field)) {
          if (!field.fields) {
            throw new Error(
              `Unable to find nested field ${part} on ${field.name}`
            );
          }
          fields = field.fields;
        } else if (isDataModel(field)) {
          fields = field.fields;
        }
        const subField: ContextualisedField | undefined =
          fields
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
        requiredFields: combineFields(args),
      };
    } else if (isParam(expr)) {
      return { type: 'param', index: expr.index };
    } else if (isFunction(expr)) {
      if (!isAlphachain(expr.expr)) {
        throw new Error('Unhandled function call on complex sub-expression');
      }
      return this.getTransform(
        { type: 'transform', description: expr.expr, args: expr.args },
        model,
        context
      ) as ContextualisedFunction;
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
