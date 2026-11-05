export function isVanityPath(pathname: string): boolean {
	return pathname === '/vanity' || pathname.startsWith('/vanity/');
}

export function newNonce(): string {
	return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

export function vanityCsp(nonce: string): string {
	return `script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; worker-src 'self'; object-src 'none'; base-uri 'self'`;
}

export function nonceInlineScripts(html: string, nonce: string): string {
	return html.replace(
		/<script(?![^>]*\bsrc\s*=)(?![^>]*\bnonce\s*=)([^>]*)>/gi,
		`<script nonce="${nonce}"$1>`
	);
}
