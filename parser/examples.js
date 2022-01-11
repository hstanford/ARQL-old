import run from './parser.js';

const nameFromUsers = 'users {name}';

const updateUsers = `(u: users) {name} -> users`;

const updateNameFamily = `
  (u: users) | filter(id = $1) {
    name
  } -> (u2: users) | filter(u2.originalUserId = u.id) {
    id
  }`;

console.log(JSON.stringify(run(updateNameFamily), null, 2));

