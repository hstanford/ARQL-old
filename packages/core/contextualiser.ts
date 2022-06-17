/**
 * CONTEXTUALISER
 *
 * The Contextualiser's role is to take an AST (Abstract Syntax Tree) returned from the Parser
 * and to add knowledge of what data can be provided. It depends on the AST structure and on
 * the models configured. If the models are stored in different storage engines or databases
 * the contextualiser bubbles up which data sources will be required to resolve data at each level.
 */

/* TODO:
- Fields of type collection should remove required fields that are available in that collection
*/

import {
  Alphachain,
  ContextualisedExpr,
  ContextualisedField,
  ContextualisedFunction,
  ContextualisedParam,
  ContextualisedQuery,
  ContextualisedCollection,
  ContextualisedCollectionValue,
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
  isCollection,
  isTransform,
  isWildcard,
  Query,
  Shape,
  Collection,
  Transform,
  TransformDef,
} from './types.js';

import type { ARQLParser } from './parser';

import { combine } from './sources.js';

import { uniq, uniqBy, getAlias, getCollectionName } from './util.js';

function combineFields(subFields: ContextualisedField[]) {
  const fields = [];
  for (const subField of subFields) {
    if (isCollection(subField)) {
      // a collection requires all the data that it mentions
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
  collection: ContextualisedCollectionValue
): DataField[] {
  if (isMultiShape(shape)) {
    const fields: DataField[] = [];
    for (const f of shape) {
      fields.push(...shapeToAvailableFields(f, collection));
    }
    return uniq(fields);
  }
  return shape.map(
    (f) =>
      ({
        type: 'datafield',
        from: collection,
        name: f.alias,
        source: getSourcesFromContextualisedField(f),
      } as DataField)
  );
}

function getAvailableFieldsFromCollection(
  collectionValue: ContextualisedCollectionValue
): ContextualisedField[] {
  let fields = [];
  if (isCollection(collectionValue)) {
    fields = collectionValue.availableFields;
    if (collectionValue.shape) {
      fields = shapeToAvailableFields(collectionValue.shape, collectionValue);
    }
  } else if (isDataModel(collectionValue)) {
    fields = collectionValue.fields.filter(isDataField);
  } else {
    throw new Error(
      `Unsupported collectionValue type ${collectionValue.type} for extracting fields`
    );
  }
  return fields;
}

function getSubmodels(collectionValue: ContextualisedCollectionValue) {
  let subModels: ContextualisedCollectionValue[] = [];
  if (isCollection(collectionValue)) {
    subModels = collectionValue.subModels || [];
  } else if (isDataModel(collectionValue)) {
    return [collectionValue];
  } else {
    throw new Error(
      `Unsupported collectionValue type ${collectionValue.type} for extracting subModels`
    );
  }
  return subModels;
}

function getSourcesFromCollectionValue(collectionValue: ContextualisedCollectionValue) {
  const firstField = isCollection(collectionValue)
    ? collectionValue?.availableFields?.[0]
    : collectionValue?.fields?.[0];
  if (isCollection(collectionValue)) {
    return collectionValue.sources;
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
    return getSourcesFromCollectionValue(field);
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
  return uniq(query?.sourceCollection?.sources || []).concat(query?.dest?.sources || []);
}

function applyRequiredFields(
  collection: ContextualisedCollection,
  requiredFields: ContextualisedField[]
) {
  let required = requiredFields;
  if (collection.transform) {
    required = required.concat(collection.transform.requiredFields);
  }
  collection.requiredFields = uniq([...collection.requiredFields, ...requiredFields]);
  if (Array.isArray(collection.value)) {
    // divide required fields by source
    for (let collectionValue of collection.value) {
      if (!isCollection(collectionValue)) return;
      const subFields = [];
      for (let field of requiredFields) {
        if (isDataField(field) && field.from === collectionValue) {
          subFields.push(field);
        }
      }
      applyRequiredFields(collectionValue, subFields);
    }
  } else if (isCollection(collection.value)) {
    applyRequiredFields(collection.value, collection.requiredFields);
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
    if (ast.sourceCollection) {
      contextualisedQuery.sourceCollection = this.handleCollection(ast.sourceCollection, context);
      const collection = contextualisedQuery.sourceCollection;
      // implicit wildcard
      if (!collection.requiredFields.length && collection.availableFields.length) {
        applyRequiredFields(collection, combineFields(collection.availableFields));
      }
    }
    if (ast.dest) {
      contextualisedQuery.dest = this.handleDest(ast.dest, context);
    }
    contextualisedQuery.sources = aggregateQuerySources(contextualisedQuery);
    return contextualisedQuery;
  }

  aggregateCollections(collection: ContextualisedCollection) {
    if (Array.isArray(collection.value)) {
      collection.availableFields = [];
      collection.subModels = [];
      for (let source of collection.value) {
        collection.availableFields.push(
          ...getAvailableFieldsFromCollection(source)
        );
        collection.subModels.push(...getSubmodels(source));
      }
      collection.availableFields = uniqBy(collection.availableFields, 'name');
      collection.subModels = uniqBy(collection.subModels, 'name');
    } else {
      collection.availableFields = getAvailableFieldsFromCollection(
        collection.value
      );
      collection.subModels = getSubmodels(collection.value);
    }
    collection.name = getCollectionName(collection);
    collection.sources = uniq(combine(collection.subModels || []));
  }

  transformCollection(
    collection: ContextualisedCollection,
    transform: Transform,
    context: ContextualiserState
  ): ContextualisedCollection {
    const outTransform = this.getTransform(transform, collection, context);
    const outShape = outTransform.args
      .reverse()
      .find(function (arg): arg is ContextualisedField[] {
        return Array.isArray(arg);
      }); // is a contextualised shape
    if (outShape) {
      outTransform.args = outTransform.args.filter((arg) => arg !== outShape);
    }
    const outCollection: ContextualisedCollection = {
      type: 'collection',
      transform: outTransform,
      value:
        Array.isArray(collection.value) && !collection.transform
          ? collection.value
          : collection,
      availableFields: collection.availableFields,
      requiredFields: [],
      name: getAlias(collection.alias || collection.name),
      subModels: collection.subModels,
      sources: uniq(collection.sources.concat(outTransform.sources)),
      shape: outShape,
    };
    if (outShape) {
      return this.applySourceShape(outCollection, outShape, context);
    } else {
      return outCollection;
    }
  }

  shapeSource(
    source: ContextualisedCollection,
    shape: Shape | Shape[],
    context: ContextualiserState
  ): ContextualisedCollection {
    const outShape = this.getShape(shape, source, context);
    return this.applySourceShape(source, outShape, context);
  }

  applySourceShape(
    collection: ContextualisedCollection,
    shape: ContextualisedField[] | ContextualisedField[][],
    context: ContextualiserState
  ): ContextualisedCollection {
    const sources = isMultiShape(shape) ? shape.map(combine) : [combine(shape)];
    const requiredFields = isMultiShape(shape)
      ? combineFields(
          shape.reduce<ContextualisedField[]>(
            (acc, subShape) => acc.concat(subShape),
            []
          )
        )
      : combineFields(shape);

    const out: ContextualisedCollection = {
      type: 'collection',
      value: Array.isArray(collection.value) && !collection.value.length ? [] : collection,
      availableFields: [],
      requiredFields: [],
      name: getAlias(collection.alias || collection.name),
      subModels: collection.subModels,
      sources: uniq(collection.sources.concat(...sources)),
      shape,
    };
    out.availableFields = shapeToAvailableFields(shape, out);
    applyRequiredFields(out, requiredFields);
    return out;
  }

  handleCollection(collection: Collection, context: ContextualiserState) {
    const ContextualisedCollection: ContextualisedCollection = {
      type: 'collection',
      availableFields: [],
      requiredFields: [],
      value: [],
      sources: [],
    };
    if (Array.isArray(collection.value)) {
      ContextualisedCollection.value = collection.value.map((s) =>
        this.handleCollection(s, context)
      );
      this.aggregateCollections(ContextualisedCollection);
    } else if (isCollection(collection.value)) {
      ContextualisedCollection.value = this.handleCollection(collection.value, context);
      this.aggregateCollections(ContextualisedCollection);
    } else if (isAlphachain(collection.value)) {
      const model = this.getModel(collection.value, context);

      ContextualisedCollection.value = model;
      ContextualisedCollection.subModels = [model];
      const availableFields = isCollection(model)
        ? model.availableFields
        : model.fields;
      if (availableFields)
        ContextualisedCollection.availableFields = availableFields; // need contextualising?
      // TODO: fix this hack by passing required fields back down
      const firstField = availableFields?.[0];
      ContextualisedCollection.sources = getSourcesFromCollectionValue(model);
      // TODO: sources independent from shape if inner join?
    }

    if (
      !Array.isArray(ContextualisedCollection.value) &&
      isDataField(ContextualisedCollection.value)
    ) {
      ContextualisedCollection.sources.push(
        ...getSourcesFromCollectionValue(ContextualisedCollection.value)
      );
    }

    ContextualisedCollection.name = getCollectionName(ContextualisedCollection);

    if (collection.alias) {
      context.aliases.set(collection.alias, ContextualisedCollection);
      ContextualisedCollection.alias = collection.alias;
    } else if (ContextualisedCollection.name) {
      context.aliases.set(ContextualisedCollection.name, ContextualisedCollection);
    }

    let out = ContextualisedCollection;
    if (collection.transforms.length) {
      for (const transform of collection.transforms) {
        out = this.transformCollection(out, transform, context);
      }
    }

    for (let field of out.availableFields) {
      if (isDataField(field)) context.aliases.set(field.name, field);
    }

    if (collection.shape) {
      out = this.shapeSource(out, collection.shape, context);
    } else {
      // shape here can be applied by transform
      // we don't want it on the output collection
      delete out.shape;
    }

    if (collection.alias) {
      context.aliases.set(collection.alias, out);
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

    const availableFields = isCollection(model)
      ? model.availableFields
      : model.fields;
    const firstField = availableFields?.[0];

    let out: ContextualisedCollection = {
      type: 'collection',
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
        out = this.transformCollection(out, transform, context);
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
    model: ContextualisedCollection | DataModel,
    dataReference: DataReference,
    context: ContextualiserState
  ): ContextualisedCollection {
    const name = getAlias(model.alias || model.name);
    const trfms = this.parser(
      dataReference.join(name, dataReference.other.name),
      'transforms'
    );
    const availableFields = isCollection(model)
      ? model.availableFields
      : model.fields;
    const collection: ContextualisedCollection = {
      type: 'collection',
      name,
      value: model,
      availableFields,
      requiredFields: [],
      sources: getSourcesFromCollectionValue(model),
    };

    const firstOtherField = dataReference.other.fields?.[0];
    let out: ContextualisedCollection = {
      type: 'collection',
      name: dataReference.other.name,
      value: dataReference.other,
      availableFields: dataReference.other.fields,
      requiredFields: [],
      sources: uniq(
        (isDataField(firstOtherField)
          ? getSourcesFromDataField(firstOtherField)
          : []
        ).concat(collection.sources)
      ),
    };

    for (const trfm of trfms) {
      out = this.transformCollection(out, trfm, context);
    }
    if (!out) {
      throw new Error('Datareference without a transform');
    }
    return out;
  }

  getModel(alphachain: Alphachain, context: ContextualiserState) {
    let model: ContextualisedCollection | DataModel | DataField | undefined;
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
        (isCollection(model) ? model.availableFields : model?.fields) || [];
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
      if (isDataModel(model) || isCollection(model)) {
        prevModel = model;
      } else {
        model = {
          ...model,
          from: isCollection(prevModel) ? prevModel : undefined,
        };
        prevModel = model;
      }
    }
    return model;
  }

  getTransform(
    transform: Transform,
    model: ContextualisedCollection,
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
        if (isCollection(arg)) return this.handleCollection(arg, context);
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
    model: ContextualisedCollection,
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
              const availableFields = isCollection(val)
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
    model: ContextualisedCollection,
    context: ContextualiserState
  ): ContextualisedField {
    let contextualisedField: ContextualisedField;
    if (isCollection(field.value)) {
      contextualisedField = this.handleCollection(field.value, context);
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
    model: ContextualisedCollection,
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
        } else if (isCollection(field)) {
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
        if (isDataField(subField) && isCollection(field)) subField.from = field;
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
