// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
    },
    resolve: {
        // Strip .js extensions from imports so Vite resolves them as .ts source files.
        // Our source uses ".js" extensions for compiled-output compatibility, but
        // Vitest operates on the raw .ts source, so we need this alias.
        alias: [
            {
                find: /^(\.{1,2}\/.+)\.js$/,
                replacement: '$1',
            },
        ],
    },
});
