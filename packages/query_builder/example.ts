import {
  Models,
  ModelsTypes,
} from './models.js'
import { transformModel, Source, multi } from './index.js';
import { transforms } from '@arql/stdlib-general';

type ArrayElement<ArrayType extends readonly unknown[]> = 
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

type Transforms = ArrayElement<typeof transforms>['name'];

type TransformMethod<T> = (...args: any[]) => Source<Transforms, T>;

export type SourceClassMethods<ModelType> = {
  [key in Transforms]: TransformMethod<ModelType>;
};

type MethodType = Record<Transforms, TransformMethod<any>>;
const transformMethods: MethodType = transforms.reduce<Partial<MethodType>>((acc, transform) => {
  acc[transform.name] = function (...args: any[]) {
    return (this as any).transform({
      name: transform.name,
      args
    });
  }
  return acc;
}, {}) as MethodType;

const transformNames = transforms.map(t => t.name);
const u = transformModel<ModelsTypes, 'users', Transforms>(Models['users'], 'users', transformNames);
const o = transformModel<ModelsTypes, 'orders', Transforms>(Models['orders'], 'orders', transformNames);

const out = multi([u, o], transformNames)
  .join(o.userId.equals(u.id))
  .filter(o.name.equals('foo'))
  .shape({
    userId: u.id,
    orderId: o.id,
  })
  .toQuery();

console.log(out);
