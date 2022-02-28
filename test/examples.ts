import buildParser, { Query, ExprTree } from 'arql-parser';
import opResolver from 'arql-op-resolver';
import contextualise, {
  ContextualisedExpr,
  ContextualisedQuery,
  TransformDef,
} from 'arql-contextualiser';
import { getOperatorLookup } from 'arql-operations';
import models from './models.js';
import delegator from 'arql-delegator';
import Resolver from 'arql-resolver-native';

const transforms: TransformDef[] = [
  {
    name: 'filter',
    modifiers: [],
    nArgs: 1,
  },
  {
    name: 'sort',
    modifiers: ['desc', 'asc', 'nullsFirst', 'nullsLast'],
    nArgs: '1+',
  },
  {
    name: 'join',
    modifiers: [],
    nArgs: 1,
  },
].map((o) => ({ ...o, type: 'transformdef' }));

const EXPR = Symbol.for('EXPR');

const operators = [
  {
    name: 'negation',
    pattern: ['!', EXPR],
  },
  {
    name: '+',
    pattern: [EXPR, '+', EXPR],
  },
  {
    name: 'equality',
    pattern: [EXPR, '=', EXPR],
  },
  {
    name: 'ternary',
    pattern: [EXPR, '?', EXPR, ':', EXPR],
  },
];

const opMap = getOperatorLookup(operators);

// declare this once for multiple parsings
const resolve = opResolver(opMap);

const run = buildParser(resolve);

const nameFromUsers = 'users {name}';

const updateUsers = `(u: users) {name} -> users`;

const updateNameFamily = `
  (u: users) | filter(id = $1) | sort.desc.foo(u.id) {
    name
  } -> (u2: users) | filter(u2.name = u.id) {
    idplus: id + $1
  }`;

const updateNameFamily2 = `
  u: users
    | filter(id = $1)
    | sort.desc(id) { name }
  -> u2: users | filter(u2.name = u.id) {
    idplus: id + $1
  }
`;

const t = `(u: users) {name} -> (u2: users) | filter(u2.name = u.id);`;

const multiModel = `
  (
    u: users,
    o: orders,
  ) | join(o.userId = u.id) {
    username: u.name,
    ordername: o.name,
  }
`;

let ast = run.query(multiModel);
const contextualised = contextualise(ast, models, transforms);
const delegated = delegator(contextualised);
const resolver = new Resolver(
  new Map([
    [
      'join',
      async function (
        modifiers: string[],
        values: Map<any, any>,
        condition: ContextualisedExpr
      ) {
        const vals: any[] = [];
        const out = new Map([
          [0, vals],
        ]);
        if (
          condition.args[0].type !== 'datafield' ||
          condition.args[1].type !== 'datafield' ||
          condition.op !== 'equality'
        )
          throw new Error('condition not yet supported');
        
        let i = 0;
        for (const [alias, model] of values.entries()) {
          if (i++ > 0) break;
          for (const [otheralias, othermodel] of values.entries()) {
            if (alias === otheralias) continue;
            for (const row of model) {
              const matching = othermodel.filter((r: any) => {
                if (
                  condition.args[0]?.type !== 'datafield' ||
                  condition.args[1]?.type !== 'datafield'
                )
                  return false;
                // TODO: this will need to know which arg refers to which model
                const lkey = condition.args[0].name;
                const rkey = condition.args[1].name;
                const lmodel = alias === condition.args[0].from?.name ? model : othermodel;
                const rmodel = alias === condition.args[1].from?.name ? model : othermodel;

                return lmodel[lkey] === rmodel[rkey];
              });
              for (let m of matching) {
                vals.push({ ...m, ...row, [alias]: row, [otheralias]: m });
              }
            }
          }
        }
        return out;
      },
    ],
  ])
);

const resolved = resolver.resolve(delegated);

//const arg = contextualised.to?.transforms?.[0]?.args?.[0];
//if (arg?.type === 'exprtree')
//  console.log(arg.args[0]);
resolved.then((r) => console.log(r));
export default resolved;
