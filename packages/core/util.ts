import type {
  Alphachain,
  ContextualisedCollection,
  ModelsDeclarationTypes,
  DataSource,
  DataModel,
  DataField,
  DataReference,
  BaseModel,
} from './types.js';
import { isAlphachain } from './types.js';

export function uniq<T>(arr: T[]) {
  return arr.filter(
    (field, idx, self) => idx === self.findIndex((f2) => f2 === field)
  );
}

export function uniqBy<T>(arr: T[], key: keyof T) {
  return arr.filter(
    (field, idx, self) => idx === self.findIndex((f2) => f2[key] === field[key])
  );
}

export function getAlias(ipt: string | Alphachain | null | undefined) {
  let alias: string = '';
  if (isAlphachain(ipt)) {
    alias = [ipt.root, ...ipt.parts].pop() || '';
  } else if (typeof ipt === 'string') {
    alias = ipt;
  }
  return alias;
}

export function getCollectionName(
  collection: ContextualisedCollection
): string {
  let name = '';
  if (collection.alias) {
    name = collection.alias;
  } else if (Array.isArray(collection.value)) {
    name = '';
  } else {
    name = getAlias(collection.value.alias || collection.value.name);
  }
  return name;
}

type SourceMap<K extends string> = { [key in K]: DataSource<any, any> };

export function getSourcesModel<
  K extends string,
  M extends SourceMap<K>,
  T extends BaseModel<M>
>(model: T, key: K, sourceModels: M, getModel: (name: string) => DataModel) {
  return {
    type: 'datamodel',
    name: key,
    source: sourceModels[key],
    fields: (Object.keys(model) as (keyof T)[]).reduce<
      (DataField | DataReference)[]
    >((acc, k) => {
      if (k === '_id') {
        return acc;
      }
      if (typeof k !== 'string') {
        throw new Error('Expected string key');
      }
      const data = model[k];
      let out: DataReference | DataField;
      if (data.type === 'datareference') {
        out = {
          type: 'datareference',
          name: k,
          get model() {
            return getModel(key);
          },
          get other() {
            if (typeof data.model !== 'string') {
              throw new Error('Expected string key');
            }
            return getModel(data.model);
          },
          join: data.join,
        };
      } else {
        out = {
          type: data.type,
          name: k,
          get model() {
            return getModel(key);
          },
          source: sourceModels[key],
        };
      }
      return acc.concat(out);
    }, []),
  };
}

export function getSourcedModels<T extends ModelsDeclarationTypes<any>>(
  models: T,
  sourceLookup: SourceMap<keyof T & string>
) {
  type ModelsMap = {
    [key in keyof T]: DataModel;
  };

  const sourcedModels: ModelsMap = Object.keys(models).reduce<
    Partial<ModelsMap>
  >((acc, key) => {
    return {
      ...acc,
      [key]: getSourcesModel(
        models[key],
        key,
        sourceLookup,
        (key) => sourcedModels[key]
      ),
    };
  }, {}) as ModelsMap;

  return sourcedModels;
}
