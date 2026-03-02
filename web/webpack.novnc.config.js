const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: path.resolve(__dirname, 'node_modules/@novnc/novnc/lib/rfb.js'),
    output: {
        path: path.resolve(__dirname, 'public/novnc'),
        filename: 'rfb.bundle.js',
        library: {
            name: 'RFB',
            type: 'umd',
            export: 'default',
        },
        globalObject: 'this',
    },
    experiments: {
        topLevelAwait: true,
    },
    resolve: {
        extensions: ['.js'],
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                include: /node_modules\/@novnc/,
                type: 'javascript/auto',
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', {
                                targets: {
                                    browsers: ['> 1%', 'last 2 versions', 'not ie <= 11'],
                                },
                                modules: 'umd',
                            }],
                        ],
                    },
                },
            },
        ],
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    format: {
                        comments: false,
                    },
                },
                extractComments: false,
            }),
        ],
    },
    externals: {
        // 排除不需要的外部依赖
    },
};

