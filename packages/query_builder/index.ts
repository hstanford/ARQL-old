import type { DataModel } from 'arql';
import { Native } from 'arql';
import {
  DataField,
  DataReference,
  Models,
  ModelsTypes,
  Model as ModelType,
} from './models';

import { Field, isField, Expression, isExpression, Operators, fieldToQuery, expressionToQuery } from './transforms';

function toQuery (item: SourceClass<any> | Field | Expression) {
  if (item instanceof SourceClass) {
    return item.toQuery();
  } else if (isField(item)) {
    return fieldToQuery(item);
  } else if (isExpression(item)) {
    return expressionToQuery(item);
  } else {
    throw new Error('Unhandled type');
  }
}

const createField = (name: string, dataType: string, model: string): Field => {
  const out: Partial<Field> = {
    _name: name,
    _datatype: dataType,
    _model: model,
  };
  (Object.entries(Operators) as any).map(([key, value]: [key: keyof typeof Operators, value: any]) => {
    out[key] = value.bind(out);
  });
  return out as Field;
}

type Model<T> = {
  _type: 'model';
  _name: string;
} & FieldMap<T>;

interface Transform {
  name: string;
  args: any[];
}

type FieldMap<T> = { [k in keyof T]: Field };

type Source<ModelType> = SourceClass<ModelType> & FieldMap<ModelType>;

class SourceClass<ModelType> {
  _type: 'source' = 'source';
  private _sources: (Model<ModelType> | Source<ModelType>)[];
  private _transforms: Transform[];
  private _shape?: Map<string, any>;
  constructor(
    sources: (Model<ModelType> | Source<ModelType>)[] = [],
    transforms = [],
    shape = undefined
  ) {
    (this._sources = sources), (this._transforms = transforms);
    this._shape = shape;
    if (sources.length === 1) {
      for (const key of Object.keys(sources[0])) {
        if (key[0] !== '_')
          (this as any)[key] = (sources[0] as any)[key] as Field;
      }
    }
  }

  transform(tr: Transform): Source<ModelType> {
    this._transforms.push(tr);
    return this as any;
  }

  shape(s: any[] | { [key: string]: any }) {
    if (!this._shape) this._shape = new Map();
    if (Array.isArray(s))
      for (let field of s) {
        this._shape?.set?.(field.name, field);
      }
    else
      for (let key of Object.keys(s)) {
        this._shape?.set?.(key, s[key]);
      }
    return this;
  }

  toQuery() {
    let out = '';
    const sources = this._sources.map((source) => {
      if (source._type === 'model') {
        return source._name;
      } else return source.toQuery();
    });
    if (sources.length > 1) {
      out += '(' + sources.join(', ') + ')';
    } else if (sources.length === 1) {
      out += sources[0];
    }

    for (const transform of this._transforms) {
      out += ` | ${transform.name}(${transform.args
        .map((a) => {
          try {
            return toQuery(a);
          } catch (e) {
            return a;
          }
          
        })
        .join(',')})`;
    }

    if (this._shape) {
      out +=
        ' {' +
        [...this._shape.entries()]
          .map(([k, v]) => `${k}: ${toQuery(v)}`)
          .join(', ') +
        '}';
    }

    return out;
  }
}

function transformModel<SignatureKey extends keyof ModelsTypes>(
  model: ModelType,
  modelName: SignatureKey
): Source<ModelsTypes[SignatureKey]> {
  type Signature = ModelsTypes[SignatureKey];
  const fieldObj: Model<Signature> = Object.keys(model).reduce(
    (acc: any, key: keyof typeof model) => {
      const field = model[key];
      if (field.type === 'datareference') {
        return acc;
      }
      return {
        ...acc,
        [key]: createField(key, field.datatype, modelName),
      };
    },
    { _type: 'model', _name: modelName } as Model<Signature>
  );
  return new SourceClass<Signature>([fieldObj]) as Source<Signature>;
}

// TODO: type overrides
function multi<T, U>(...args: [Source<T>, Source<U>]): Source<{}> {
  return new SourceClass<{}>(args);
}

const u = transformModel(Models['users'], 'users');
const o = transformModel(Models['orders'], 'orders');

// extend Source with custom transform method
interface SourceClass<ModelType> {
  join: (...args: any[]) => Source<ModelType>;
  filter: (...args: any[]) => Source<ModelType>;
}
SourceClass.prototype.join = function (...args) {
  return this.transform({
    name: 'join',
    args,
  });
};
SourceClass.prototype.filter = function (...args) {
  return this.transform({
    name: 'filter',
    args,
  });
};

/*const out = multi(u, o)
  .join(o.userId.equals(u.id))
  .filter(o.name.equals('foo'))
  .shape({
    userId: u.id,
    orderId: o.id,
  })
  .toQuery();*/

const out = u.filter(u.name.notEquals('blah')).shape({id: u.id}).toQuery();

console.log(out);
