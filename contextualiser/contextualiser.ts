import type { Alphachain, Expr, Field, From, Model, Param, Query, To, Transform, Shape, Source, ExprUnary } from 'arql-parser';

type DataSource = any;
type dataType = 'string' | 'number' | 'boolean' | 'json';
type ContextualisedField = DataField | DataModel | ContextualisedFrom | ContextualisedTo | ContextualisedExpr | ContextualisedParam;

export interface DataField {
  name: string;
  type: dataType;
  fields?: DataField[];
  source: DataSource;
  model?: DataModel;
}

interface ContextualisedParam {
  index: number;
  name?: string | undefined;
  fields?: undefined;
}

export interface DataModel {
  name: string;
  fields: DataField[];
}

export interface TransformDef {
  name: string;
  modifiers?: string[];
  nArgs: string | number;
}

interface ContextualiserState {
  aliases: Map<any, any>;
}

interface ContextualisedQuery {
  from?: ContextualisedFrom;
  to?: ContextualisedTo;
}

interface ContextualisedFrom {
  source?: ContextualisedSource;
  fields: ContextualisedField[];
  name?: Alphachain | string;
  subModels?: (DataModel | ContextualisedFrom)[];
  transforms: ContextualisedTransform[];
  shape?: ContextualisedField[];
}

interface ContextualisedTo {
  source?: ContextualisedSource;
  fields: ContextualisedField[];
  name?: Alphachain | string;
  subModels?: (DataModel | ContextualisedFrom)[];
  transforms: ContextualisedTransform[];
  shape?: ContextualisedField[];
}

interface ContextualisedSource {
  fields: ContextualisedField[];
  subModels: (DataModel | ContextualisedFrom)[];
  name?: Alphachain | string;
}

interface ContextualisedTransform {

}

interface ContextualisedExpr {
  name?: Alphachain | string;
  fields?: undefined;
  args: ContextualisedExpr[];
}

function uniqBy<T> (arr: T[], key: keyof T) {
  return arr.filter((field, idx, self) => idx === self.findIndex(f2 => f2[key] === field[key]));
}

class Contextualiser {
  state: ContextualiserState;
  models: Map<string, DataModel>;
  transforms: TransformDef[];
  constructor (models: Map<string, DataModel>, transforms: TransformDef[]) {
    this.state = { aliases: new Map() };
    this.models = models;
    this.transforms = transforms;
  }

  run (ast: Query) {
    const contextualisedQuery: ContextualisedQuery = {};
    if (ast.from) {
      contextualisedQuery.from = this.handleFrom(ast.from);
    }
    if (ast.to) {
      contextualisedQuery.to = this.handleTo(ast.to, contextualisedQuery.from);
    }
  }

  handleFrom (from: From) {
    const contextualisedFrom: ContextualisedFrom = { fields: [], transforms: [] };
    if (from.source) {
      contextualisedFrom.source = this.handleSource(from.source);
      contextualisedFrom.fields = contextualisedFrom.source.fields;
      contextualisedFrom.subModels = contextualisedFrom.source.subModels;
      contextualisedFrom.name = contextualisedFrom.source.name || contextualisedFrom.subModels?.[0]?.name;
    }
    if (from.transforms.length) {
      contextualisedFrom.transforms = from.transforms.map(transform => this.getTransform(transform, contextualisedFrom));
    }
    if (from.shape) {
      contextualisedFrom.shape = this.getShape(from.shape, contextualisedFrom);
    }
    return contextualisedFrom;
  }

  handleTo (to: To, from?: ContextualisedFrom) {
    const contextualisedTo: ContextualisedTo = { fields: [], transforms: []};
    if (to.source) {
      contextualisedTo.source = this.handleSource(to.source);
      contextualisedTo.fields = contextualisedTo.source.fields;
      contextualisedTo.subModels = contextualisedTo.source.subModels;
      contextualisedTo.name = contextualisedTo.source.name || contextualisedTo.subModels?.[0]?.name;
    }
    if (to.transforms.length) {
      contextualisedTo.transforms = to.transforms.map(transform => this.getTransform(transform, {
        ...contextualisedTo,
        fields: uniqBy((from?.fields || []).concat(contextualisedTo.fields) as ContextualisedField[], 'name'),
        transforms: [],
      }));
    }
    if (to.shape) {
      contextualisedTo.shape = this.getShape(to.shape, contextualisedTo);
    }
    return contextualisedTo;
  }

  handleSource (source: Source | Model) {
    const contextualisedSource: ContextualisedSource = { fields: [], subModels: [] };
    // TODO: handle joins
    if (source.value?.type === 'alphachain') {
      // TODO: handle parts
      const model = this.getModel(source.value);
      contextualisedSource.subModels = [model];
    } else if (source.value?.type === 'from' && source.value.shape) {
      // sneaky typescripting: we know "from" here has shape
      const contextualisedFrom = this.handleFrom({...source.value, shape: source.value.shape});
      contextualisedSource.subModels = [contextualisedFrom];
    }

    if (source.type === 'source' && source.joins?.length)
      contextualisedSource.subModels.push(...source.joins.map(j => ({
        ...this.handleSource(j.to),
        transforms: []
      })));

    contextualisedSource.name = source.alias || contextualisedSource.subModels?.[0].name;

    const initialSubfields: ContextualisedField[] = [];
    contextualisedSource.fields = uniqBy([
      { ...contextualisedSource, transforms: [] },
      ...contextualisedSource.subModels,
      ...contextualisedSource.subModels.reduce((acc, model) => acc.concat(model.fields), initialSubfields),
    ], 'name');

    return contextualisedSource;
  }

  getModel (alphachain: Alphachain) {
    // TODO: handle parts
    let model;
    if (this.state.aliases.has(alphachain.root)) {
      model = this.state.aliases.get(alphachain.root);
    } else if (this.models.has(alphachain.root)) {
      model = this.models.get(alphachain.root);
    }
    return model;
  }

  getTransform (transform: Transform, model: ContextualisedFrom): ContextualisedTransform {
    const match = this.transforms.find(tr => tr.name === transform.description.root);
    if (!match)
      throw new Error(`Unrecognised transform ${transform.description.root}`);
    return {
      name: match.name,
      modifier: transform.description.parts.filter(part => match.modifiers && (match.modifiers.indexOf(part) !== -1)),
      args: transform.args.map(arg => this.getExpression(arg, model)),
    };
  }

  getShape (shape: Shape, model: ContextualisedFrom | ContextualisedTo) {
    const out = [];
    for (let field of shape.fields) {
      out.push(this.getField(field, model));
    }
    return out;
  }

  getField (field: Field, model: ContextualisedFrom | ContextualisedTo): ContextualisedField {
    let contextualisedField: ContextualisedField;
    if (field.value?.type === 'from') {
      contextualisedField = this.handleFrom(field.value);
    } else {
      contextualisedField = this.getExpression(field.value, model);
    }

    contextualisedField.name = field.alias || contextualisedField.name;
    return contextualisedField;
  }

  getExpression (expr: ExprUnary, model: ContextualisedFrom | ContextualisedTo): ContextualisedField | ContextualisedExpr {
    if (expr.type === 'alphachain') {
      const parts = [expr.root].concat(expr.parts);
      let field: ContextualisedField = model;
      let mod: ContextualisedField = model;
      while (parts.length) {
        const part = parts.shift();
        mod = field;
        if (!field.fields) {
          throw new Error(`Unable to find nested field ${part} on ${field.name}`);
        }
        const subField: ContextualisedField | undefined = field.fields.find(f => f.name === part);
        if (subField)
          field = subField;
      }
      return field;
    }
    if (expr.type === 'exprtree') {
      return {...expr, args: expr.args.map(arg => this.getExpression(arg, model))} as ContextualisedExpr;
    }
    if (expr.type === 'param') {
      return { index: expr.index } as ContextualisedParam;
    }
    throw new Error('Invalid expression type');
  }
}

export default function contextualise (ast: Query, models: Map<string, DataModel>, transforms: TransformDef[]) {
  (new Contextualiser(models, transforms)).run(ast);
}
