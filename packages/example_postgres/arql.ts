// core lib
import {
  buildParser,
  opResolver,
  contextualise,
  getOperatorLookup,
  delegator,
  Collector,
  getSourcedModels,
  DataModel,
} from '@arql/core';

// standard libraries
import generic from '@arql/stdlib-general';
import nativeConfigurer from '@arql/stdlib-native';
import sqlConfigurer from '@arql/stdlib-sql';
import PostgresSQL from '@arql/source-postgresql';

// custom model definitions
import { definitions } from './models.js';

// get source-independent transform and operator definitions
const { transforms, operators } = generic();
const opMap = getOperatorLookup(operators);

// set up the postgres resolver
const database1 = new PostgresSQL({
  models: undefined,
  connectionString: process.env.CONNECTION_STRING
});
// bind the stdlib's transforms and operators to the resolver
sqlConfigurer(database1);

// bind the models to the resolver
Object.keys(definitions).forEach(k => database1.setModel(k, (definitions as any)[k]));
const sourceLookup = Object.keys(definitions).reduce<any>((acc, k) => {
  return {...acc, [k]: database1};
}, {});
const sourcedModels = getSourcedModels(definitions, sourceLookup);
Object.keys(sourcedModels).forEach(k => database1.add((sourcedModels as any)[k]));
const models: Map<string, DataModel> = new Map(Object.entries(sourcedModels));

// set up the source-independent query processing functions
const resolve = opResolver(opMap);
const parser = buildParser(resolve);
const collector = new Collector();
nativeConfigurer(collector);

export async function arql(query: string, params: any[]) {
  console.time(query);
  let ast = parser.query(query);
  const contextualised = contextualise(ast, models, transforms, parser);
  const delegated = delegator(contextualised);
  const data = await collector.run(delegated, params);
  console.timeEnd(query);

  return data;
}
