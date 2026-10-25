// Semantic colour from a src/lib/ds/tokens.css channel variable (DESIGN-SYSTEM.md §1.1).
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

// Type scale (DESIGN-SYSTEM.md §1.3). Two-value sizes shrink below md through clamp().
const type = (size, lineHeight, fontWeight, letterSpacing) => [
	size,
	{ lineHeight, fontWeight, ...(letterSpacing && { letterSpacing }) }
];

/** @type {import('tailwindcss').Config} */
export default {
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		'./node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}',
		'./node_modules/layerchart/**/*.{svelte,js}'
	],

	plugins: [require('flowbite/plugin')],

	darkMode: 'class',

	theme: {
		extend: {
			colors: {
				canvas: token('canvas'),
				surface: { DEFAULT: token('surface'), 2: token('surface-2') },
				line: token('line'),
				edge: token('edge'),
				ink: { DEFAULT: token('ink'), muted: token('ink-muted') },
				accent: {
					DEFAULT: token('accent'),
					fill: token('accent-fill'),
					soft: token('accent-soft')
				},
				hi: { DEFAULT: token('hi'), ink: token('hi-ink'), soft: token('hi-soft') },
				ok: { DEFAULT: token('ok'), soft: token('ok-soft') },
				warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
				danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
				focus: token('focus'),
				grid: token('grid'),
				'series-3': token('series-3'),
				expected: { DEFAULT: token('expected'), halo: token('expected-halo') },
				'on-hero': {
					DEFAULT: token('on-hero'),
					muted: token('on-hero-muted'),
					// A complete rgba value, so no opacity modifier.
					surface: 'var(--c-on-hero-surface)'
				},
				// flowbite-svelte's primary, re-pointed from coral to Voi violet (VIS-03).
				primary: {
					50: '#f5f3ff',
					100: '#ede9fe',
					200: '#ddd6fe',
					300: '#c4b5fd',
					400: '#a78bfa',
					500: '#8b5cf6',
					600: '#7c3aed',
					700: '#6d28d9',
					800: '#5b21b6',
					900: '#4c1d95'
				}
			},
			fontFamily: {
				sans: ['Lato', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
			},
			fontSize: {
				display: type('clamp(2.125rem, 4.5vw, 3.125rem)', '1.08', '900', '-0.02em'),
				'hero-num': type('clamp(2.75rem, 5.25vw, 3.375rem)', '1.1', '900', '-0.02em'),
				stat: type('clamp(1.75rem, 3.3vw, 2.125rem)', '1.1', '900', '-0.02em'),
				title: type('clamp(1.625rem, 3.1vw, 2rem)', '1.15', '900'),
				lede: type('clamp(1rem, 1.75vw, 1.125rem)', '1.45', '400'),
				h2: type('1.25rem', '1.3', '900', '-0.01em'),
				body: type('0.9375rem', '1.5', '400'),
				sm: ['0.875rem', { lineHeight: '1.45' }],
				label: type('0.8125rem', '1.4', '700'),
				micro: type('0.75rem', '1.35', '700')
			},
			borderRadius: {
				xs: '8px',
				sm: '12px',
				md: '16px',
				card: 'var(--r-card)',
				hero: 'var(--r-hero)'
			},
			boxShadow: {
				card: 'var(--shadow-card)',
				pop: '0 10px 40px rgba(20,0,60,.35)'
			},
			backgroundImage: {
				hero: 'var(--g-hero)',
				bar: 'var(--g-bar)'
			},
			transitionDuration: { fast: '120ms', base: '200ms', slow: '600ms' },
			transitionTimingFunction: { 'out-soft': 'cubic-bezier(.2,.8,.2,1)' },
			spacing: {
				bento: 'var(--sp-bento)',
				card: 'var(--sp-card)'
			},
			animation: {
				shimmer: 'shimmer 2s infinite linear',
				'spin-slow': 'spin 3s linear infinite'
			},
			keyframes: {
				shimmer: {
					'0%': { transform: 'translateX(-100%)' },
					'100%': { transform: 'translateX(100%)' }
				}
			}
		}
	}
};
