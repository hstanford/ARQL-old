export const nameFromUsers = 'users {name}';

export const updateUsers = `(u: users) {name} -> users`;

export const updateNameFamily = `
  (u: users) | filter(id = $1) | sort.desc.foo(u.id) {
    name
  } -> (u2: users) | filter(u2.name = u.id) {
    idplus: id + $1
  }`;

export const updateNameFamily2 = `
  u: users
    | filter(id = $1)
    | sort.desc(id) { name }
  -> u2: users | filter(u2.name = u.id) {
    idplus: id + $1
  }
`;

export const basicUpdate = `(u: users) {name} -> (u2: users) | filter(u2.name = u.id);`;

export const multiModel = `
  (
    u: users,
    o: orders,
  ) | join(o.userId = u.id) {
    username: u.name,
    ordername: o.name,
  }
`;
