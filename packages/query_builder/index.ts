import { BaseModel } from '@arql/types';

import {
  Field,
  isField,
  Expression,
  isExpression,
  Operators,
  isModel,
} from './transforms';

const fieldToQuery = (field: Field, params: any[]): [string, any[]] => {
  return [`${field._model}.${field._name}`, params];
};

const expressionToQuery = (
  expression: Expression,
  params: any[]
): [string, any[]] => {
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

function toQuery(
  item: Collection<any, any> | Model<any> | Field | Expression,
  params: any[] = []
): [string, any[]] {
  if (isIntermediate(item)) {
    return collectionToQuery(item, params);
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

export type Collection<
  Transforms extends string,
  ModelType
> = FieldMap<ModelType> &
  Intermediate<Transforms, ModelType> & {
    [key in Transforms]: (...args: any[]) => Collection<Transforms, ModelType>;
  } & {
    toQuery: (params?: any[]) => [string, any[]];
    shape: (
      s: any[] | Record<string, any>
    ) => Collection<Transforms, ModelType>;
  };

export type Intermediate<Transforms extends string, ModelType> = {
  _collections: (Model<ModelType> | Collection<Transforms, ModelType>)[];
  _transforms: { name: Transforms; args: any[] }[];
  _shape: Map<string, any> | undefined;
};
function isIntermediate(item: any): item is Intermediate<any, any> {
  return !!item._collections;
}

function cloneIntermediate<T extends string, U>(
  intermediate: Collection<T, U>,
  availableTransforms: T[]
) {
  const out = initialiseIntermediate(
    intermediate._collections,
    [...intermediate._transforms],
    intermediate._shape,
    availableTransforms
  );
  out.toQuery = toQuery.bind(null, out);
  out.shape = applyShape.bind(null, out, availableTransforms) as any;
  return out;
}

function initialiseIntermediate<Transforms extends string, ModelType>(
  collections: (Model<ModelType> | Collection<Transforms, ModelType>)[] = [],
  transforms: { name: Transforms; args: any[] }[] = [],
  shape: Map<string, any> | undefined = undefined,
  availableTransforms: Transforms[] = []
): Collection<Transforms, ModelType> {
  const intermediate: Intermediate<Transforms, ModelType> = {
    _collections: collections,
    _transforms: transforms,
    _shape: shape,
  };
  const collection:
    | Model<ModelType>
    | Collection<Transforms, ModelType>
    | undefined = collections[0];
  const fields: FieldMap<ModelType> = (
    collection
      ? Object.keys(collection).reduce(
          (acc, key) =>
            key[0] !== '_' ? { ...acc, [key]: (collection as any)[key] } : acc,
          {}
        )
      : {}
  ) as FieldMap<ModelType>;
  const out = {
    ...intermediate,
    ...fields,
  } as any;

  out.toQuery = toQuery.bind(null, out);
  out.shape = applyShape.bind(null, out, availableTransforms);

  availableTransforms.forEach((transform) => {
    out[transform] = (...args: any[]) => {
      return applyTransform(
        out,
        { name: transform, args },
        availableTransforms
      );
    };
  }, {});

  return out as Collection<Transforms, ModelType>;
}

function applyTransform<T extends string, U>(
  intermediate: Collection<T, U>,
  transform: Transform<T>,
  availableTransforms: T[]
): Collection<T, U> {
  const out = cloneIntermediate(intermediate, availableTransforms);
  out._transforms.push(transform);
  return out;
}

function applyShape<T extends string, U>(
  intermediate: Collection<T, U>,
  availableTransforms: T[],
  s: any[] | Record<string, any>
) {
  const out: Collection<T, U> = cloneIntermediate(
    intermediate,
    availableTransforms
  );
  out._shape = new Map();
  if (Array.isArray(s))
    for (let field of s) {
      out._shape?.set?.(field.name, field);
    }
  else {
    for (let key of Object.keys(s)) {
      out._shape?.set?.(key, s[key]);
    }
  }
  return out;
}

function collectionToQuery(
  intermediate: Collection<any, any>,
  params: any[]
): [string, any[]] {
  let out = '';
  const collections: string[] = [];
  for (const collection of intermediate._collections) {
    const [str, newParams] = toQuery(collection, params);
    params = newParams;
    collections.push(str);
  }
  if (collections.length > 1) {
    out += '(' + collections.join(', ') + ')';
  } else if (collections.length === 1) {
    out += collections[0];
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
    out += ' {' + fields.join(', ') + '}';
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
    (acc: any, key: string) => {
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
  args: [Collection<Transforms, T>, Collection<Transforms, U>],
  transforms: Transforms[]
): Collection<Transforms, {}> {
  return initialiseIntermediate<Transforms, {}>(
    args,
    [],
    undefined,
    transforms
  );
}
