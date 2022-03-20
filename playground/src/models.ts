import { Native, DataModel, DataField } from 'arql';
import { native as nativeConfigurer } from './configuration';
export class Data {
  sources: Map<string, Native> = new Map();
  models: Map<string, DataModel> = new Map();
  onChange = () => {};
  constructor (onChange?: () => any) {
    if (onChange)
      this.onChange = onChange;
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
      model.fields = model.fields.filter((field) => field.source === source);
    }
    this.sources.delete(name);
    this.onChange();
  }
  addModel(name: string, ...sourceNames: string[]) {
    const newModel: DataModel = {
      type: 'datamodel',
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
    datatype: 'number' | 'string',
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
  removeField(name: string, modelName: string) {
    const model = this.models.get(modelName);
    model.fields = model.fields.filter(field => field.name !== name);
    this.onChange();
  }
  addRecord(record: any, sourceName: string, modelName: string) {
    const source = this.sources.get(sourceName);
    source.data[modelName].push(record);
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
data.addRecord({id: 1, name: 'hello'}, 'main', 'users');
data.addRecord({id: 2, name: 'goodbye'}, 'main', 'users');
data.addRecord({id: 1, age: 42}, 'main', 'elephants');
data.addRecord({id: 2, name: 39}, 'main', 'elephants');
data.addRecord({id: 1, userId: 1, name: 'foo'}, 'secondary', 'orders');
data.addRecord({id: 2, userId: 1, name: 'blah'}, 'secondary', 'orders');
data.addRecord({id: 3, userId: 2, name: 'other'}, 'secondary', 'orders');

export default data;