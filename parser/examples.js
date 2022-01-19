import buildParser from './parser.js';
import opResolver from './op_resolver.js';
import contextualise from '../contextualiser/index.js';
import models from '../models/index.js';
import transforms from '../transforms/example.js';

// use custom operators with custom precedence
import opMap from '../operations/example.js';

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

let ast = run(updateNameFamily);
contextualise(ast, models, transforms);
console.log(ast.from.transforms[1]);
