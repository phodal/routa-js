module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Avoid circular dependencies to keep dependency graph maintainable.",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-core-to-app",
      comment: "Core domain logic must not depend on Next.js app routes or route handlers.",
      severity: "error",
      from: {
        path: "^src/core",
      },
      to: {
        path: "^src/app",
      },
    },
    {
      name: "no-core-to-client",
      comment: "Core domain logic must not depend on client presentation components or hooks.",
      severity: "error",
      from: {
        path: "^src/core",
      },
      to: {
        path: "^src/client",
      },
    },
  ],
  options: {
    tsConfig: {
      fileName: "tsconfig.json",
    },
    doNotFollow: {
      path: "node_modules",
    },
    includeOnly: "^src|^apps|^crates",
  },
};
