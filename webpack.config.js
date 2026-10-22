const crypto = require('crypto');
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

/**
 * Emits sw.js: src/sw.js with the list of every file in the build (and a version made from their
 * contents) filled in, so a new deploy installs a new worker that precaches exactly that build.
 */
class ServiceWorkerPlugin {
    apply(compiler) {
        compiler.hooks.thisCompilation.tap('ServiceWorkerPlugin', compilation => {
            compilation.hooks.processAssets.tap({ name: 'ServiceWorkerPlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT }, assets => {
                const files = Object.keys(assets).filter(f => f !== 'sw.js' && !f.endsWith('.LICENSE.txt') && !f.endsWith('.map')).sort();
                const hash = crypto.createHash('sha256');
                files.forEach(f => hash.update(f).update(assets[f].source()));
                const template = path.join(__dirname, 'src/sw.js');
                compilation.fileDependencies.add(template);
                const source = fs.readFileSync(template, 'utf8')
                    .replace('self.__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
                    .replace('self.__FILES__', JSON.stringify(files));
                compilation.emitAsset('sw.js', new compiler.webpack.sources.RawSource(source));
            });
        });
    }
}

module.exports = {
    entry: './src/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist'),
        // hashed, so a new deploy's page always loads its own code (the service worker caches by URL)
        filename: 'bundle.[contenthash:8].js',
        clean: true,
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
        new ServiceWorkerPlugin(),
    ],
};
