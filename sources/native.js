function nativeOp(name, ...args) {
  return {
    type: 'nativeOp',
    name,
    args,
  };
}

export class Native {
  constructor({ data }) {
    this.models = new Map();
    this.operators = new Map(
      ['addition', 'subtraction', 'negation', 'equality', 'ternary'].map(
        (name) =>
          (...args) =>
            nativeOp(name, ...args)
      )
    );

    this.data = data;
  }

  add(def) {
    this.models.set(def.name, def);
  }

  resolveField(modelName, fieldName, ...parts) {
    if (parts.length) console.log('Not yet supported');
    // TODO: error handling
    return {
      modelName,
      fieldName,
    };
  }

  run() {}
}
