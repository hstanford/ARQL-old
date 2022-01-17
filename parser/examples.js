import buildParser from './parser.js';
import opResolver from './op_resolver.js';

// use custom operators with custom precedence
import opMap from '../operations/example.js';

// declare this once for multiple parsings
const resolve = opResolver(opMap);

const run = buildParser(resolve);

const nameFromUsers = 'users {name}';

const updateUsers = `(u: users) {name} -> users`;

const updateNameFamily = `
  (u: users) | filter(id = $1) {
    name
  } -> (u2: users) | filter(u2.originalUserId = (!u.id + $2)) {
    id
  }`;

console.log(JSON.stringify(run(updateNameFamily), null, 2));

