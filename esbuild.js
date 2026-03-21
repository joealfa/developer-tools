const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	// Extension host bundle — Node.js, runs in the extension process
	const extensionCtx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		// .html files imported as raw strings (webview HTML templates)
		loader: { '.html': 'text' },
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	// Webview scripts bundle — browser context, one output file per webview
	const webviewCtx = await esbuild.context({
		entryPoints: [
			'src/webview-scripts/passwordGenerator.ts',
			'src/webview-scripts/portManager.ts',
			'src/webview-scripts/sessionTracker.ts',
			'src/webview-scripts/noteEditor.ts',
			'src/webview-scripts/notesTable.ts',
		],
		bundle: true,
		format: 'iife',      // self-contained browser bundle, no require()
		platform: 'browser', // no Node.js globals
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		outdir: 'dist/webview-scripts',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	if (watch) {
		await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
	} else {
		await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
		await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
