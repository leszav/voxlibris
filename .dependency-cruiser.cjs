/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make repository-level relationships harder to reason about.',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Every internal import should resolve through the project TypeScript configuration.',
      from: {},
      to: {
        couldNotResolve: true,
        path: '^(client/src|server|shared)(/|$)',
      },
    },
    {
      name: 'client-not-to-server',
      severity: 'error',
      comment: 'Browser code must talk to the backend through HTTP/WebSocket APIs, not server imports.',
      from: {
        path: '^client/src',
      },
      to: {
        path: '^server',
      },
    },
    {
      name: 'server-not-to-client',
      severity: 'error',
      comment: 'Server runtime code must not import browser implementation modules.',
      from: {
        path: '^server',
      },
      to: {
        path: '^client/src',
      },
    },
    {
      name: 'shared-not-to-runtime',
      severity: 'error',
      comment: 'Shared schema/types must stay independent from client and server runtime code.',
      from: {
        path: '^shared',
      },
      to: {
        path: '^(client/src|server)',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules'],
    },
    exclude: {
      path: [
        '(^|/)__tests__/',
        '[.](?:test|spec)[.](?:ts|tsx)$',
      ],
    },
    includeOnly: ['^(client/src|server|shared)(/|$)'],
    moduleSystems: ['es6', 'cjs', 'tsd'],
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    extraExtensionsToScan: ['.css', '.json', '.svg', '.png', '.webp', '.avif'],
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.d.ts', '.json', '.css', '.svg', '.png', '.webp', '.avif'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    skipAnalysisNotInRules: false,
  },
};
