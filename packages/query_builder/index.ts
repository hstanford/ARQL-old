import { transforms } from '@arql/stdlib-general';
import { DataModel } from 'arql';
import { BaseModel } from 'arql';

import {
  Field,
  isField,
  Expression,
  isExpression,
  Operators,
  isModel,
} from './transforms.js';

const fieldToQuery = (field: Field, params: any[]): [string, any[]] => {
  return [`${field._model}.${field._name}`, params];
};

const expressionToQuery = (expression: Expression, params: any[]): [string, any[]] => {
  let out: string = '';
  const args: string[] = [];
  for (const arg of expression.args) {
    const [str, newParams] = toQuery(arg, params);
    params = newParams;
    args.push(str);
  }
  switch (expression.type) {
    case 'prefixUnary':
      out = `${expression.ops[0]}${args[0]}`;
      break;
    case 'binary':
      out = `${args[0]} ${expression.ops[0]} ${args[1]}`;
      break;
    case 'ternary':
      out = `${args[0]} ${expression.ops[0]} ${args[1]} ${expression.ops[1]} ${args[2]}`;
      break;
    default:
      throw new Error(`Unexpected expression type ${expression.type}`);
  }
  return [out, params];
};

function toQuery(item: Source<any, any> | Model<any> | Field | Expression, params: any[]): [string, any[]] {
  if (isIntermediate(item)) {
    return sourceToQuery(item, params);
  } else if (isModel(item)) {
    return [item._name, []];
  } else if (isField(item)) {
    return fieldToQuery(item, params);
  } else if (isExpression(item)) {
    return expressionToQuery(item, params);
  } else {
    const newParams = params.concat([item]);
    return [`$${newParams.length}`, newParams];
  }
}

const createField = (name: string, dataType: string, model: string): Field => {
  const out: Partial<Field> = {
    _name: name,
    _datatype: dataType,
    _model: model,
  };
  (Object.entries(Operators) as any).map(
    ([key, value]: [key: keyof typeof Operators, value: any]) => {
      out[key] = value.bind(out);
    }
  );
  return out as Field;
};

type Model<T> = {
  _type: 'model';
  _name: string;
} & FieldMap<T>;

interface Transform<T extends string = string> {
  name: T;
  args: any[];
}

type FieldMap<T> = { [k in keyof T]: Field };

export type Source<Transforms extends string, ModelType> = FieldMap<ModelType> &
  Intermediate<Transforms, ModelType> & {
    [key in Transforms]: (...args: any[]) => Source<Transforms, ModelType>;
  } & {
    toQuery: () => string;
    shape: (s: any[] | Record<string, any>) => Source<Transforms, ModelType>;
  };

export type Intermediate<Transforms extends string, ModelType> = {
  _sources: (Model<ModelType> | Source<Transforms, ModelType>)[];
  _transforms: { name: Transforms; args: any[] }[];
  _shape: Map<string, any> | undefined;
};
function isIntermediate(item: any): item is Intermediate<any, any> {
  return !!item._sources;
}

function initialiseIntermediate<Transforms extends string, ModelType>(
  sources: (Model<ModelType> | Source<Transforms, ModelType>)[] = [],
  transforms: { name: Transforms; args: any[] }[] = [],
  shape: Map<string, any> | undefined = undefined,
  availableTransforms: Transforms[] = []
): Source<Transforms, ModelType> {
  const intermediate: Intermediate<Transforms, ModelType> = {
    _sources: sources,
    _transforms: transforms,
    _shape: shape,
  };
  const source: Model<ModelType> | Source<Transforms, ModelType> | undefined =
    sources[0];
  const fields: FieldMap<ModelType> = (
    source
      ? Object.keys(source).reduce(
          (acc, key) =>
            key[0] !== '_' ? { ...acc, [key]: (source as any)[key] } : acc,
          {}
        )
      : {}
  ) as FieldMap<ModelType>;
  const out = {
    ...intermediate,
    ...fields,
  } as any;

  out.toQuery = toQuery.bind(null, out);
  out.shape = applyShape.bind(null, out);

  availableTransforms.forEach(
    (transform) => {
      out[transform] = (...args: any[]) => {
        out._transforms?.push?.({
          name: transform,
          args,
        });
        return out as Source<Transforms, ModelType>;
      };
    },
    {}
  );

  return out as Source<Transforms, ModelType>;
}

function transform<T extends string, U>(intermediate: Source<T, U>, transform: Transform<T>): Source<T, U> {
  intermediate._transforms.push(transform);
  return intermediate;
}

function applyShape<T extends string, U>(intermediate: Source<T, U>, s: any[] | Record<string, any>) {
  if (!intermediate._shape) intermediate._shape = new Map();
  if (Array.isArray(s))
    for (let field of s) {
      intermediate._shape?.set?.(field.name, field);
    }
  else
    for (let key of Object.keys(s)) {
      intermediate._shape?.set?.(key, s[key]);
    }
  return intermediate;
}

function sourceToQuery(intermediate: Source<any, any>, params: any[]): [string, any[]] {
  let out = '';
  const sources: string[] = [];
  for (const source of intermediate._sources) {
    const [str, newParams] = toQuery(source, params);
    params = newParams;
    sources.push(str);
  }
  if (sources.length > 1) {
    out += '(' + sources.join(', ') + ')';
  } else if (sources.length === 1) {
    out += sources[0];
  }

  for (const transform of intermediate._transforms) {
    const args: string[] = [];
    for (const arg of transform.args) {
      const [str, newParams] = toQuery(arg, params);
      params = newParams;
      args.push(str);
    }
    out += ` | ${transform.name}(${args.join(',')})`;
  }

  if (intermediate._shape) {
    const fields: string[] = [];
    for (const [key, value] of intermediate._shape.entries()) {
      const [str, newParams] = toQuery(value, params);
      params = newParams;
      fields.push(`${key}: ${str}`);
    }
    out +=
      ' {' +
      fields.join(', ') +
      '}';
  }

  return [out, params];
}

export function transformModel<
  T,
  SignatureKey extends keyof T,
  Transforms extends string
>(model: BaseModel, modelName: SignatureKey, transforms: Transforms[]) {
  type Signature = T[SignatureKey];
  const fieldObj: Model<Signature> = Object.keys(model).reduce(
    (acc: any, key: keyof typeof model) => {
      const field = model[key];
      if (field.type === 'datareference') {
        return acc;
      }
      return {
        ...acc,
        [key]: createField(key, field.datatype, modelName as string),
      };
    },
    { _type: 'model', _name: modelName } as Model<Signature>
  );
  return initialiseIntermediate([fieldObj], [], undefined, transforms);
}

// TODO: type overrides
export function multi<T, U, Transforms extends string>(
  args: [Source<Transforms, T>, Source<Transforms, U>],
  transforms: Transforms[]
): Source<Transforms, {}> {
  return initialiseIntermediate<Transforms, {}>(args, [], undefined, transforms);
}
