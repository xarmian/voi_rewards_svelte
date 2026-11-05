export function isVanityPath(pathname: string): boolean {
	return pathname === '/vanity' || pathname.startsWith('/vanity/');
}

export function newNonce(): string {
	return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

export function vanityCsp(nonce: string): string {
	return `script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; worker-src 'self'; object-src 'none'; base-uri 'self'`;
}

// The response carries a per-request nonce, so it must not be stored by a shared cache. no-transform
// asks proxies not to rewrite the body: Cloudflare otherwise injects its analytics script into HTML
// and copies the page nonce onto it, which would run third-party code where phrases are made.
export const VANITY_CACHE_CONTROL = 'private, no-store, no-transform';

export function nonceInlineScripts(html: string, nonce: string): string {
	return html.replace(
		/<script(?![^>]*\bsrc\s*=)(?![^>]*\bnonce\s*=)([^>]*)>/gi,
		`<script nonce="${nonce}"$1>`
	);
}
