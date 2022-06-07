# Querying

ARQL queries are fairly straightforward to compose. There are a few syntactic elements to be aware of.

### Models

`users`

Reference a model by writing its name.

### Fields

`users.options.darkmode`

Access a field by providing a path from a model.

### Parameters

`$4`

Pass in a literal value like a search string or an id separately, but reference the value in your query using `$` and the value's index.

### Functions

`uppercase(users.firstname)`

Execute a function by providing a comma-separated list of expressions (see below) inside parentheses after a `.`-separated sequence of tokens.

### Expressions

`(users.firstname + users.lastname) + $1`

A combination of fields, parameters, functions, other expressions and "operators" (e.g. `+`, the set and effect of operators is configurable) used to express more complicated logic.

### Aliases

`u: users`

Whenever you see a `:` outside an expression, the token before it is the new name of the model, field or expression.

### Shape

`{id, username: firstname + lastname}`

Curly braces delimit a list of expressions that form the output of a section of the query. This section for example exposes fields `id` and `username`.

### Collections

`users`

```
(
  u: users,
  o: (
    orders,
    orders.orderitems
  ) {
    orders.id,
    orderitems.name
  }
) | filter(o.userId = u.id) {
  u.id,
  o.name
}
```

The simplest example of a collection is a model. It can get more complicated, with `(coll1, coll2)` representing a "multi" collection.

Collections can include tranformations (`|` followed by numerous functions separated by `|`) and can terminate with a reshape. Certain transforms can be used to combine a multi collection into one, e.g. join and union.

Collections represent a collated pool of data.

### Modifications

`users {name} -> users`

Use of `->`, `-+` or `-x` indicate that the data in the collection on the left should be used to write data into the collection on the right.

## Writing Queries

The primary usecase of ARQL is to replace CRUD operations in web applications - replacing both a REST API for web clients and SQL server-side. Queries will mostly be written to satisfy the requirements of these clients.

### REST replacement

If you are replacing a REST interface, there will be a resource that you're operating on.
If the existing call is `GET /users`, then you're wanting to get data from the users model.
In ARQL you would send just the collection `users`.
What ARQL then gives you for free is the ability to whitelist the fields of users and transform the collection.
If you're replacing something that looks like `GET /users/1?field=id&field=firstname`, you can consider that to be:

- collection: `users`
- transform: filter id = 1
- shape: id and firstname

so it becomes `users | filter(id = 1) { id, firstname }`.

If you have an API endpoint that flattens data from one model onto another e.g. `GET /orders?withuser=true` you can dispose of the additional server-side logic and move the specification of the data format to the client.
That would be:

```
orders {
  id,
  price,
  user: users | filter(userId = users.id) | first,
}
```

Here, `filter` and `first` are customisable transforms.

### SQL

When replacing SQL statements, use shape to replace the fields following SELECT, use collections to replace the FROM section of a query, and use transforms to replace WHERE, (JOIN ...) ON, GROUP BY and more.

E.g.

```
SELECT id, firstname, lastname, orders.price
FROM users
  JOIN orders ON orders.userId = users.id
WHERE firstname = 'test';
```

becomes:

```
(
  users,
  orders
)
  | join(orders.userId = users.id)
  | filter(firstname = $1) {
  id,
  firstname,
  lastname,
  price
}
```

Importantly, the advantage here is that users and orders can exist in different databases under the hood. Additionally, if you've set up an "orders" relationship on the "users" model (encapsulating the userId = users.id filter) you can express the above more concisely and clearly as:

```
(
  users,
  users.orders
) | filter(firstname = $1) {
  id,
  firstname,
  lastname,
  price
}
```
