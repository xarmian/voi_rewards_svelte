#!/usr/bin/env node
// Recomputes the DESIGN-SYSTEM.md §1.2 contrast table from src/lib/ds/tokens.css (and the
// primary scale in tailwind.config.js) and exits non-zero if any pair is below WCAG 2.2 AA:
// 4.5:1 for text, 3:1 for non-text (1.4.11). Runs in `npm run check`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(`${root}src/lib/ds/tokens.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tw = readFileSync(`${root}tailwind.config.js`, 'utf8');

// Declarations of the first rule whose selector is exactly `selector`.
function block(selector) {
	const re = new RegExp(`(^|[}\\s])${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`);
	const m = css.match(re);
	if (!m) throw new Error(`tokens.css: no "${selector}" block`);
	return Object.fromEntries(
		[...m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()])
	);
}

const light = block(':root');
const dark = { ...light, ...block(':root.dark') };

function rgb(theme, name) {
	const v = theme[`--c-${name}`];
	if (!v) throw new Error(`tokens.css: --c-${name} is not defined`);
	const ch = v.split(/\s+/).map(Number);
	if (ch.length !== 3 || ch.some((c) => !(c >= 0 && c <= 255))) {
		throw new Error(`tokens.css: --c-${name} is not an RGB channel triple: ${v}`);
	}
	return ch;
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const stops = (theme) => (theme['--g-hero'].match(/#[0-9a-f]{6}/gi) ?? []).map(hex);

function primary(shade) {
	const m = tw.match(new RegExp(`primary:\\s*\\{[^}]*?\\b${shade}:\\s*'(#[0-9a-f]{6})'`, 'i'));
	if (!m) throw new Error(`tailwind.config.js: primary.${shade} not found`);
	return hex(m[1]);
}

// Alpha-composite an rgba() over an opaque background.
function over(rgba, bg) {
	const [r, g, b, a] = rgba.match(/[\d.]+/g).map(Number);
	return [r, g, b].map((c, i) => c * a + bg[i] * (1 - a));
}

function luminance(c) {
	const [r, g, b] = c.map((v) => {
		const s = v / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const WHITE = [255, 255, 255];
const TEXT = 4.5;
const NON_TEXT = 3;

// [label, min, (theme) => [fg, bg], themes?]
const pairs = [
	['Text', null],
	...['canvas', 'surface', 'surface-2'].flatMap((bg) =>
		['ink', 'ink-muted', 'accent'].map((fg) => [
			`${fg} on ${bg}`,
			TEXT,
			(t) => [rgb(t, fg), rgb(t, bg)]
		])
	),
	['accent on accent-soft', TEXT, (t) => [rgb(t, 'accent'), rgb(t, 'accent-soft')]],
	['ink on accent-soft', TEXT, (t) => [rgb(t, 'ink'), rgb(t, 'accent-soft')]],
	...['ok', 'warn', 'danger'].flatMap((s) => [
		[`${s} on surface`, TEXT, (t) => [rgb(t, s), rgb(t, 'surface')]],
		[`${s} on ${s}-soft`, TEXT, (t) => [rgb(t, s), rgb(t, `${s}-soft`)]]
	]),
	['hi-ink on surface', TEXT, (t) => [rgb(t, 'hi-ink'), rgb(t, 'surface')]],
	['hi-ink on hi-soft', TEXT, (t) => [rgb(t, 'hi-ink'), rgb(t, 'hi-soft')]],
	['white on primary button (primary-700)', TEXT, () => [WHITE, primary(700)]],
	['active wallet tab (primary-800) on white', TEXT, () => [primary(800), WHITE]],

	['Hero, every gradient stop', null],
	...[0, 1, 2].flatMap((i) => [
		[`on-hero on stop ${i + 1}`, TEXT, (t) => [rgb(t, 'on-hero'), stops(t)[i]]],
		[`on-hero-muted on stop ${i + 1}`, TEXT, (t) => [rgb(t, 'on-hero-muted'), stops(t)[i]]],
		[
			`on-hero on on-hero-surface over stop ${i + 1}`,
			TEXT,
			(t) => [rgb(t, 'on-hero'), over(t['--c-on-hero-surface'], stops(t)[i])]
		],
		[`focus ring (white) on stop ${i + 1}`, NON_TEXT, (t) => [WHITE, stops(t)[i]]]
	]),

	['Non-text (WCAG 1.4.11)', null],
	['accent-fill vs surface', NON_TEXT, (t) => [rgb(t, 'accent-fill'), rgb(t, 'surface')]],
	['accent-fill vs grid', NON_TEXT, (t) => [rgb(t, 'accent-fill'), rgb(t, 'grid')]],
	['hi vs surface', NON_TEXT, (t) => [rgb(t, 'hi'), rgb(t, 'surface')]],
	['expected vs surface', NON_TEXT, (t) => [rgb(t, 'expected'), rgb(t, 'surface')]],
	[
		'expected-halo vs accent-fill',
		NON_TEXT,
		(t) => [rgb(t, 'expected-halo'), rgb(t, 'accent-fill')]
	],
	['expected-halo vs hi', NON_TEXT, (t) => [rgb(t, 'expected-halo'), rgb(t, 'hi')]],
	['ok (ring) vs grid (track)', NON_TEXT, (t) => [rgb(t, 'ok'), rgb(t, 'grid')]],
	['series-3 vs surface', NON_TEXT, (t) => [rgb(t, 'series-3'), rgb(t, 'surface')]],
	...['surface', 'canvas', 'surface-2'].map((bg) => [
		`edge vs ${bg}`,
		NON_TEXT,
		(t) => [rgb(t, 'edge'), rgb(t, bg)]
	]),
	['focus vs surface', NON_TEXT, (t) => [rgb(t, 'focus'), rgb(t, 'surface')]],
	['focus vs canvas', NON_TEXT, (t) => [rgb(t, 'focus'), rgb(t, 'canvas')]],
	// The ring is drawn at a 2px outline-offset, so it sits on the page background, not the
	// control: check it against the worst of the three backgrounds in both themes. In light the
	// ring is the primary colour itself, so ring vs button only applies in dark (§1.1: 3.85).
	[
		'focus ring (2px offset) vs worst page background',
		NON_TEXT,
		(t) => {
			const ring = rgb(t, 'focus');
			const bgs = ['canvas', 'surface', 'surface-2'].map((bg) => rgb(t, bg));
			return [ring, bgs.reduce((a, b) => (ratio(ring, a) <= ratio(ring, b) ? a : b))];
		}
	],
	['focus vs primary button (dark)', NON_TEXT, (t) => [rgb(t, 'focus'), primary(700)], ['dark']]
];

if (stops(light).length !== 3 || stops(dark).length !== 3) {
	console.error('contrast-check: --g-hero must have exactly 3 hex stops in each theme');
	process.exit(1);
}

let failures = 0;
const w = Math.max(...pairs.map(([l]) => l.length));
console.log(`${'Pair'.padEnd(w)}   min   light    dark`);
for (const [label, min, fn, themes = ['light', 'dark']] of pairs) {
	if (min === null) {
		console.log(`\n${label}`);
		continue;
	}
	const cells = Object.entries({ light, dark }).map(([name, t]) => {
		if (!themes.includes(name)) return '     — ';
		const r = ratio(...fn(t));
		const ok = r >= min;
		if (!ok) failures++;
		return `${r.toFixed(2).padStart(6)}${ok ? ' ' : '✗'}`;
	});
	console.log(`${label.padEnd(w)}  ${min.toFixed(1).padStart(4)}  ${cells.join('  ')}`);
}

if (failures) {
	console.error(`\ncontrast-check: ${failures} pair(s) below WCAG 2.2 AA (marked ✗)`);
	process.exit(1);
}
console.log('\ncontrast-check: all pairs pass WCAG 2.2 AA');
