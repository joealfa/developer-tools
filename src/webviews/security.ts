import * as crypto from 'crypto';
import * as vscode from 'vscode';

export function createWebviewNonce(): string {
	return crypto.randomBytes(24).toString('base64url');
}

/**
 * CSP meta tag for webviews with only inline scripts (nonce-only, no external files).
 */
export function getWebviewCspMetaTag(nonce: string): string {
	return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}';">`;
}

/**
 * CSP meta tag for webviews that load a bundled script file via asWebviewUri.
 * The webview's cspSource must be added alongside the nonce so the browser
 * allows the vscode-webview-resource: scheme used by asWebviewUri.
 */
export function getWebviewCspMetaTagWithScript(nonce: string, webview: vscode.Webview): string {
	return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}' ${webview.cspSource};">`;
}

/**
 * Returns a webview URI for a bundled webview script.
 * The script must exist at dist/webview-scripts/<scriptName>.
 */
export function getWebviewScriptUri(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	scriptName: string
): vscode.Uri {
	return webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'dist', 'webview-scripts', scriptName)
	);
}
