import {
  Models,
  ModelsTypes,
} from './models'
import { transformModel, Collection, multi } from './index';
import { transforms } from '@arql/stdlib-general';

type ArrayElement<ArrayType extends readonly unknown[]> = 
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

type Transforms = ArrayElement<typeof transforms>['name'];

type TransformMethod<T> = (...args: any[]) => Collection<Transforms, T>;

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
const elephants = transformModel<ModelsTypes, 'elephants', Transforms>(Models['elephants'], 'elephants', transformNames);

test('basic name from users', () => {
  const [query, params] = u.shape({name: u.name}).toQuery();

  expect(query).toBe('users {name: users.name}');
  expect(params).toHaveLength(0);
});

test('basic aliased name from users', () => {
  const [query, params] = u.shape({foo: u.name}).toQuery();

  expect(query).toBe('users {foo: users.name}');
  expect(params).toHaveLength(0);
});

test('join and reshaping', () => {
  const [query, params] = multi([u, o], transformNames)
    .join(o.userId.equals(u.id))
    .shape({
      username: u.name,
      ordername: o.name,
    })
    .toQuery();

  expect(query).toBe('(users, orders) | join(orders.userId = users.id) {username: users.name, ordername: orders.name}');
  expect(params).toHaveLength(0);
});

test('basic filtering', () => {
  const [query, params] = elephants.filter(elephants.id.equals(39))
    .toQuery();

  expect(query).toBe('elephants | filter(elephants.id = $1)');
  expect(params).toEqual([39]);
});

test('basic reshaping with no aliasing', () => {
  const [query, params] = elephants.shape({elephantAge: elephants.age})
    .toQuery();

  expect(query).toBe('elephants {elephantAge: elephants.age}');
  expect(params).toHaveLength(0);
});

test('basic sort with modifier', () => {
  const [query, params] = elephants.sort(elephants.age).shape({age: elephants.age})
    .toQuery();

  expect(query).toBe('elephants | sort(elephants.age) {age: elephants.age}');
  expect(params).toHaveLength(0);
});