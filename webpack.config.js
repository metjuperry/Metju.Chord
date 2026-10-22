const fs = require('fs');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

/** Emits everything under public/ except index.html (samples, icons, manifest) as build assets. */
class PublicFilesPlugin {
    apply(compiler) {
        const dir = path.join(__dirname, 'public');
        compiler.hooks.thisCompilation.tap('PublicFilesPlugin', compilation => {
            compilation.hooks.processAssets.tap({ name: 'PublicFilesPlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL }, () => {
                const walk = rel => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).forEach(e => {
                    const file = path.posix.join(rel, e.name);
                    if (e.isDirectory()) return walk(file);
                    if (file === 'index.html') return;
                    compilation.fileDependencies.add(path.join(dir, file));
                    compilation.emitAsset(file, new compiler.webpack.sources.RawSource(fs.readFileSync(path.join(dir, file))));
                });
                walk('');
            });
        });
    }
}

module.exports = {
    entry: './src/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
        // relative URLs, so the build works at the site root and under the GitHub Pages subpath (/Metju.Chord/)
        publicPath: '',
    },
    mode: 'development',
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
    performance: {
        // the audio samples are big on purpose; only the code bundle is worth a warning
        assetFilter: file => /\.js$/.test(file),
        maxAssetSize: 800000,
        maxEntrypointSize: 800000,
    },
    devServer: {
        static: {
            directory: path.join(__dirname, 'public'),
        },
        port: 3000,
        hot: true,
        open: true,
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
        }),
        new PublicFilesPlugin(),
    ],
};
