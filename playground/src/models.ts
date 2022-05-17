import { Native, DataModel, DataField, DataReference, DataSource } from 'arql';
import nativeConfigurer from '@arql/stdlib-native';
import { v4 as uuid } from 'uuid';
export class Data {
  sources: Map<string, Native> = new Map();
  models: Map<string, DataModel> = new Map();
  onChange = () => {};
  constructor(onChange?: () => any) {
    if (onChange) this.onChange = onChange;
  }
  addSource(name: string) {
    const newSource = new Native({});
    nativeConfigurer(newSource);
    this.sources.set(name, newSource);
    this.onChange();
  }
  removeSource(name: string) {
    const source = this.sources.get(name);
    for (const model of this.models.values()) {
      model.fields = model.fields
        .filter(function (field): field is DataField { return field.type === 'datafield' })
        .filter((field) => field.source === source);
    }
    this.sources.delete(name);
    this.onChange();
  }
  addModel(name: string, ...sourceNames: string[]) {
    const newModel: DataModel = {
      type: 'datamodel',
      source: this.sources.get(sourceNames[0]),
      name,
      fields: [],
    };
    this.models.set(name, newModel);
    for (const sourceName of sourceNames) {
      const source = this.sources.get(sourceName);
      source.add(newModel);
      source.data[name] = [];
    }
    this.onChange();
  }
  removeModel(name: string) {
    this.models.delete(name);
    this.onChange();
  }
  addField(
    name: string,
    datatype: DataField["datatype"],
    modelName: string,
    sourceName: string
  ) {
    const model = this.models.get(modelName);
    const source = this.sources.get(sourceName);
    const newField: DataField = {
      type: 'datafield',
      name,
      datatype,
      model,
      source,
    };
    model.fields.push(newField);
    this.onChange();
  }
  addRelation(
    name: string,
    modelName: string,
    hasOne: boolean,
    otherName: string,
    modelCol: string,
    otherCol: string
  ) {
    const model = this.models.get(modelName);
    const other = this.models.get(otherName);
    const newReference: DataReference = {
      type: 'datareference',
      name,
      other,
      join: (a, b) => `| filter(${a}.${modelCol} = ${b}.${otherCol}) ${hasOne ? '| first() ' : ''}`
    };
    model.fields.push(newReference);
    this.onChange();
  }
  removeField(name: string, modelName: string) {
    const model = this.models.get(modelName);
    model.fields = model.fields.filter((field) => field.name !== name);
    this.onChange();
  }
  addRecord(record: any, sourceName: string, modelName: string) {
    const source = this.sources.get(sourceName);
    source.data[modelName].push(record);
    record._id = uuid();
    this.onChange();
  }
  removeRecord(record: any, sourceName: string, modelName: string) {
    const source = this.sources.get(sourceName);
    var index = source.data[modelName].indexOf(record);
    if (index !== -1) {
      source.data[modelName].splice(index, 1);
    }
    this.onChange();
  }
  getKeyForSource(source: DataSource<any, any>) {
    return [...data.sources.keys()].find(
      (s) => source === data.sources.get(s)
    );
  }
}

const data = new Data();
data.addSource('main');
data.addSource('secondary');
data.addModel('users', 'main');
data.addModel('elephants', 'main');
data.addModel('orders', 'secondary');
data.addField('id', 'number', 'users', 'main');
data.addField('name', 'string', 'users', 'main');
data.addField('id', 'number', 'elephants', 'main');
data.addField('age', 'number', 'elephants', 'main');
data.addField('id', 'number', 'orders', 'secondary');
data.addField('userId', 'number', 'orders', 'secondary');
data.addField('name', 'string', 'orders', 'secondary');
data.addRelation('orders', 'users', false, 'orders', 'id', 'userId');
data.addRelation('user', 'orders', true, 'users', 'userId', 'id');
data.addRecord({ id: 1, name: 'hello' }, 'main', 'users');
data.addRecord({ id: 2, name: 'goodbye' }, 'main', 'users');
data.addRecord({ id: 1, age: 42 }, 'main', 'elephants');
data.addRecord({ id: 2, name: 39 }, 'main', 'elephants');
data.addRecord({ id: 1, userId: 1, name: 'foo' }, 'secondary', 'orders');
data.addRecord({ id: 2, userId: 1, name: 'blah' }, 'secondary', 'orders');
data.addRecord({ id: 3, userId: 2, name: 'other' }, 'secondary', 'orders');

export default data;

const sourceColours: Record<string, string> = {};

function generateLightColorHex() {
  let color = "#";
  for (let i = 0; i < 3; i++)
    color += ("0" + Math.floor(((1 + Math.random()) * Math.pow(16, 2)) / 2).toString(16)).slice(-2);
  return color;
}

export function getColourForSource(source: string) {
  if (source in sourceColours) {
    return sourceColours[source];
  } else {
    const randomColor = generateLightColorHex();
    sourceColours[source] = randomColor;
    return randomColor;
  }
}