class Contextualiser {
  constructor (models, transforms) {
    this.state = { aliases: new Map() };
    this.models = models;
    this.transforms = transforms;
  }

  run (ast) {
    if (ast.from) {
      this.handleFrom(ast.from);
    }
    if (ast.to) {
      this.handleTo(ast.to, ast.from);
    }
  }

  handleFrom (from) {
    if (from.source) {
      this.handleSource(from.source);
      from.fields = from.source.fields;
      from.subModels = from.source.subModels;
      from.name = from.source.root || from.source.name || (from.subModels.length === 1 ? from.subModels[0].name : undefined);
    }
    if (from.transforms?.length) {
      from.transforms = from.transforms.map(transform => this.getTransform(transform, from));
    }
    if (from.shape) {
      this.handleShaped(from);
    }
  }

  handleShaped (shaped) {
    shaped.shape = this.getShape(shaped.shape, shaped);
    shaped.fields = shaped.shape.map(field => {
      const dup = {...field};
      dup.name = dup.alias || dup.name;
      delete dup.alias;
      return dup;
    });
  }

  handleTo (to, from) {
    if (to.source) {
      this.handleSource(to.source);
      to.fields = to.source.fields;
      to.subModels = to.source.subModels;
      to.name = to.source.root || to.source.name || (to.subModels.length === 1 ? to.subModels[0].name : undefined);
    }
    if (to.transforms?.length) {
      to.transforms = to.transforms.map(transform => this.getTransform(transform, {
        fields: (from?.source?.fields || []).concat(to.fields)
          .filter((field, idx, self) => idx === self.findIndex(f2 => f2.name === field.name)),
      }));
    }
    if (to.shape) {
      this.handleShaped(to);
    }
  }

  handleSource (source) {
    // TODO: handle joins
    if (source.value?.type === 'alphachain') {
      // TODO: handle parts
      const model = this.getModel(source.value);
      source.subModels = [{...model, alias: source.root}];
      delete source.value;
    } else if (source.value?.type === 'source') {
      this.handleSource(source.value);
      source.subModels = [{
        name: source.value.name,
        subModels: source.value.subModels,
        fields: source.value.fields,
        alias: source.root,
      }];
    } else if (source.value?.type === 'from') {
      this.handleFrom(source.value);
      source.subModels = [{
        name: source.value.name,
        subModels: source.value.subModels,
        fields: source.value.fields,
        alias: source.root,
      }];
    }

    if (source.join?.length)
      source.subModels = source.subModels.concat(source.join);

    source.name = source.root || (source.subModels.length === 1 ? source.subModels[0].name : undefined);

    source.fields = source.subModels.map(model => ({ name: model.name, fields: model.fields })).concat(
      source.subModels
        .reduce((acc, model) => acc.concat(model.fields), [])
    )
      .filter((field, idx, self) => idx === self.findIndex(f2 => f2.name === field.name));

    source.fields.unshift({ name: source.name, fields: source.fields });

  }

  getModel (alphachain) {
    // TODO: handle parts
    let model;
    if (this.state.aliases.has(alphachain.root)) {
      model = this.state.aliases.get(alphachain.root);
    } else if (this.models.has(alphachain.root)) {
      model = this.models.get(alphachain.root);
    }
    return model;
  }

  getTransform (transform, model) {
    const out = { type: 'transform' };
    const match = this.transforms.find(tr => tr.name === transform.root);
    out.name = match.name;
    out.modifiers = transform.parts.filter(part => match.modifiers.indexOf(part) !== -1);
    out.args = transform.args.map(arg => this.getExpression(arg, model));
    return out;
  }

  getShape (shape, model) {
    const out = [];
    for (let field of shape) {
      out.push(this.getField(field, model));
    }
    return out;
  }

  getField (field, model) {
    let out = field;
    if (field.value?.type === 'from') {
      this.handleFrom(field.value, model);
      out = field.value;
    } else {
      out = this.getExpression(field.value, model);
    }
    return {...out, alias: field.root};
  }

  getExpression (expr, model) {
    if (expr.type === 'alphachain') {
      const parts = [expr.root].concat(expr.parts);
      let field = model, mod;
      while (parts.length) {
        const part = parts.shift();
        mod = field;
        field = field.fields.find(f => f.name === part);
      }
      return {...field, model: mod};
    }
    if (expr.type === 'expr') {
      return {...expr, args: expr.args.map(arg => this.getExpression(arg, model))};
    }
    if (expr.type === 'param') {
      return expr;
    }
  }
}

export default function contextualise (ast, models, transforms) {
  (new Contextualiser(models, transforms)).run(ast);
}
