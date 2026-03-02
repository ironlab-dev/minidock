import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { babel } from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    input: path.resolve(__dirname, 'scripts/novnc-wrapper.js'),
    output: {
        file: path.resolve(__dirname, 'public/novnc/rfb.bundle.js'),
        format: 'umd',
        name: 'RFB',
        exports: 'default',
        globals: {},
    },
    plugins: [
        nodeResolve({
            preferBuiltins: false,
            browser: true,
        }),
        commonjs({
            transformMixedEsModules: true,
            strictRequires: false,
        }),
        babel({
            babelHelpers: 'bundled',
            exclude: 'node_modules/**',
            presets: [
                ['@babel/preset-env', {
                    targets: {
                        browsers: ['> 1%', 'last 2 versions', 'not ie <= 11'],
                    },
                    modules: false,
                }],
            ],
        }),
        terser({
            format: {
                comments: false,
            },
        }),
    ],
    external: [],
};

