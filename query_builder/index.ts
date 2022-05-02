import type { DataModel } from 'arql';
import { Native } from 'arql';

const mainDb = new Native({
  users: [{ id: 1, name: 'hello' }],
  elephants: [
    { id: 1, age: 42 },
    { id: 2, age: 39 },
  ],
});

const secondaryDb = new Native({
  orders: [{ id: 1, userId: 1, name: 'foo', stuff: new Date() }],
});

function selfReference(model: DataModel) {
  for (const field of model.fields) {
    field.model = model;
  }
}

export const elephants: DataModel = {
  type: 'datamodel',
  name: 'elephants',
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
      source: mainDb,
    },
    {
      type: 'datafield',
      name: 'age',
      datatype: 'number',
      source: mainDb,
    },
  ],
};

export const users: DataModel = {
  type: 'datamodel',
  name: 'users',
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
      source: mainDb,
    },
    {
      type: 'datafield',
      name: 'name',
      datatype: 'string',
      source: mainDb,
    },
  ],
};

export const orders: DataModel = {
  type: 'datamodel',
  name: 'orders',
  fields: [
    {
      type: 'datafield',
      name: 'id',
      datatype: 'number',
      source: secondaryDb,
    },
    {
      type: 'datafield',
      name: 'userId',
      datatype: 'number',
      source: secondaryDb,
    },
    {
      type: 'datafield',
      name: 'name',
      datatype: 'string',
      source: secondaryDb,
    },
  ],
};

const Users = {
  id: users.fields.find((i) => i.name === 'id'),
  name: users.fields.find((i) => i.name === 'name'),
} as const;

const Orders = {
  id: orders.fields.find((i) => i.name === 'id'),
  userId: orders.fields.find((i) => i.name === 'userId'),
  name: orders.fields.find((i) => i.name === 'name'),
} as const;

selfReference(users);
selfReference(orders);
selfReference(elephants);

class Field {
  name: string;
  datatype: string;
  model: string;
  constructor(name: string, datatype: string, model: string) {
    this.name = name;
    this.datatype = datatype;
    this.model = model;
  }

  toQuery() {
    return `${this.model}.${this.name}`;
  }

  equals(otherVal: any): ExprTree {
    return new ExprTree({
      op: '=',
      args: [this, otherVal],
    });
  }
}

type Model<T> = {
  _type: 'model';
  _name: string;
} & FieldMap<T>;

interface Transform {
  name: string;
  args: any[];
}

class ExprTree {
  op: string;
  args: (ExprTree | Field)[];
  constructor({ op, args }: { op: string; args: any[] }) {
    this.op = op;
    this.args = args;
  }

  toQuery(): string {
    return this.args
      .map((a) => {
        if (a?.toQuery) {
          return a.toQuery();
        } else {
          return a;
        }
      })
      .join(` ${this.op} `);
  }
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
          if (a?.toQuery) {
            return a.toQuery();
          } else {
            return a;
          }
        })
        .join(',')})`;
    }

    if (this._shape) {
      out +=
        ' {' +
        [...this._shape.entries()]
          .map(([k, v]) => `${k}: ${v.toQuery()}`)
          .join(', ') +
        '}';
    }

    return out;
  }
}

function transformModel<Signature>(model: DataModel): Source<Signature> {
  const fieldObj: Model<Signature> = model.fields.reduce(
    (acc, field) => {
      return {
        ...acc,
        [field.name]: new Field(field.name, field.datatype, model.name),
      };
    },
    { _type: 'model', _name: model.name } as Model<Signature>
  );
  return new SourceClass<Signature>([fieldObj]) as any;
}

// TODO: type overrides
function multi<T, U>(...args: [Source<T>, Source<U>]): Source<{}> {
  return new SourceClass<{}>(args);
}

const u = transformModel<{ id: number; name: string }>(users);
const o = transformModel<{ id: number; userId: number; name: string }>(orders);

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

const out = multi(u, o)
  .join(o.userId.equals(u.id))
  .filter(o.name.equals('foo'))
  .shape({
    userId: u.id,
    orderId: o.id,
  })
  .toQuery();

console.log(out);
