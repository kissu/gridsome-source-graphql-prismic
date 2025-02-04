const { setContext } = require("apollo-link-context");
const { HttpLink } = require("apollo-link-http");
const fetch = require("node-fetch");

const {
  introspectSchema,
  makeRemoteExecutableSchema,
  transformSchema,
  RenameTypes
} = require("graphql-tools");

const {
  NamespaceUnderFieldTransform,
  StripNonQueryTransform
} = require(`./transforms`);

class GraphQLSource {
  static defaultOptions() {
    return {
      url: undefined,
      fieldName: undefined,
      typeName: undefined,
      headers: {},
      userMasterRef: undefined
    };
  }

  constructor(api, options) {
    const { url, fieldName, headers, useMasterRef } = options;
    let typeName = options.typeName;

    // Make sure all required props are passed

    if (!url) {
      throw new Error(`Missing url option.`);
    }

    if (!fieldName) {
      throw new Error(`Missing fieldName option.`);
    }

    // If typeName isn't defined, default to fieldName

    if (!typeName) {
      typeName = fieldName;
    }

    // Fetch schema, namespace it, and merge it into local schema
    api.createSchema(async ({ addSchema }) => {
      const remoteSchema = await this.getRemoteExecutableSchema(
        url,
        headers,
        useMasterRef
      );
      const namespacedSchema = await this.namespaceSchema(
        remoteSchema,
        fieldName,
        typeName
      );

      addSchema(namespacedSchema);
    });
  }

  async getRemoteExecutableSchema(uri, headers, useMasterRef) {
    const graphqlUri = `${uri}/graphql`;
    const http = new HttpLink({
      uri: graphqlUri,
      fetch,
      useGETForQueries: true
    });

    if (useMasterRef) {
      const res = await fetch(`${uri}/api`, { method: "GET" });
      const data = await res.json();

      headers["Prismic-Ref"] = data.refs.find(ref => ref.id === "master").ref;
    }

    const link = setContext(() => ({ headers })).concat(http);
    const remoteSchema = await introspectSchema(link);

    return makeRemoteExecutableSchema({
      schema: remoteSchema,
      link
    });
  }

  namespaceSchema(schema, fieldName, typeName) {
    return transformSchema(schema, [
      new StripNonQueryTransform(),
      new RenameTypes(name => `${typeName}_${name}`),
      new NamespaceUnderFieldTransform(typeName, fieldName)
    ]);
  }
}

module.exports = GraphQLSource;
