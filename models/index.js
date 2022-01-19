import { postgresql } from '../sources/index.js';

const mainDb = postgresql();

function selfReference (model) {
  for (const field of model.fields) {
    field.model = model;
  }
}

export const users = {
  name: 'users',
  source: mainDb,
  fields: [
    {
      name: 'id',
      type: 'number',
    },
    {
      name: 'name',
      type: 'string',
    }
  ],
};

selfReference(users);
mainDb.add(users);

export default (new Map([['users', users]]));
