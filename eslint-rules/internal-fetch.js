// Simple custom ESLint rule to forbid fetch of internal routes outside /src/lib
export const internalFetchRule = {
  meta: { type: 'problem', docs: { description: 'Disallow direct fetch to internal routes outside lib layer' } },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'fetch') {
          const arg = node.arguments[0];
          if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
            const v = arg.value;
            if (v.startsWith('/') && !v.startsWith('/api/og')) {
              const filename = context.getFilename();
              if (!filename.includes('/src/lib/')) {
                context.report({ node, message: 'Use a lib helper instead of direct fetch to internal route' });
              }
            }
          }
        }
      }
    };
  }
};

export default internalFetchRule;
