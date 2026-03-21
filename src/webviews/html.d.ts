/**
 * Type declaration for .html files imported as raw strings via the esbuild text loader.
 */
declare module '*.html' {
	const content: string;
	export default content;
}
