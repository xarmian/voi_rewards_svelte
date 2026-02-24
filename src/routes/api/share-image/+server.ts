import type { RequestHandler } from '@sveltejs/kit';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync } from 'fs';

// Load Arial Bold font - we'll use a fallback if not available
let fontData: ArrayBuffer;

try {
	// Try to load Arial Bold from system fonts (macOS path)
	const fontPath = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
	fontData = readFileSync(fontPath);
} catch {
	// Fallback: fetch a similar bold font from Google Fonts
	fontData = new ArrayBuffer(0); // Will be loaded dynamically
}

async function loadFont(): Promise<ArrayBuffer> {
	if (fontData.byteLength > 0) {
		return fontData;
	}
	// Fetch Inter Bold as fallback (similar to Arial Bold)
	const response = await fetch(
		'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hjp-Ek-_EeA.woff'
	);
	fontData = await response.arrayBuffer();
	return fontData;
}

export const GET: RequestHandler = async ({ url, fetch: svelteKitFetch }) => {
	try {
		// Get query parameters
		const tokenName = url.searchParams.get('tokenName') || 'TOKEN';
		const tokenImage = url.searchParams.get('tokenImage') || '';
		const gainLoss = url.searchParams.get('gainLoss') || '+0%';
		const bought = url.searchParams.get('bought') || '0';
		const pl = url.searchParams.get('pl') || '$0';
		const entryPrice = url.searchParams.get('entryPrice') || '$0';
		const markPrice = url.searchParams.get('markPrice') || '$0';

		// Load the font
		const font = await loadFont();

		// Fetch the token image if provided
		let tokenImageData = '';
		if (tokenImage) {
			try {
				const imgResponse = await fetch(tokenImage);
				const imgBuffer = await imgResponse.arrayBuffer();
				const base64 = Buffer.from(imgBuffer).toString('base64');
				const contentType = imgResponse.headers.get('content-type') || 'image/png';
				tokenImageData = `data:${contentType};base64,${base64}`;
			} catch (e) {
				console.error('Failed to fetch token image:', e);
			}
		}

		// Create the SVG using Satori
		// Layout: 1080x1080, all elements 110px from left
		const svg = await satori(
			{
				type: 'div',
				props: {
					style: {
						width: '1080px',
						height: '1080px',
						display: 'flex',
						flexDirection: 'column',
						position: 'relative',
						fontFamily: 'Arial Bold'
					},
					children: [
						// Token Image (scaled: 371px, 68x68)
						tokenImageData
							? {
									type: 'img',
									props: {
										src: tokenImageData,
										style: {
											position: 'absolute',
											left: '62px',
											top: '371px',
											width: '68px',
											height: '68px',
											borderRadius: '34px'
										}
									}
								}
							: null,
						// Token Name (scaled: ~390px)
						{
							type: 'div',
							props: {
								style: {
									position: 'absolute',
									left: '140px',
									top: '377px',
									fontSize: '56px',
									fontWeight: 700,
									color: '#ffffff'
								},
								children: tokenName
							}
						},
						// Gain/Loss (scaled: 506px)
						{
							type: 'div',
							props: {
								style: {
									position: 'absolute',
									left: '62px',
									top: '506px',
									fontSize: '113px',
									fontWeight: 700,
									color: '#d2aa49'
								},
								children: gainLoss
							}
						},
						// "Bought" label (scaled: 703px, x=62)
						{
							type: 'div',
							props: {
								style: {
									position: 'absolute',
									left: '62px',
									top: '703px',
									fontSize: '34px',
									fontWeight: 700,
									color: '#b1b3c2'
								},
								children: 'Bought'
							}
						},
						// "P/L" label (scaled: 703px, x=422)
						{
							type: 'div',
							props: {
								style: {
									position: 'absolute',
									left: '422px',
									top: '703px',
									fontSize: '34px',
									fontWeight: 700,
									color: '#b1b3c2'
								},
								children: 'P/L'
							}
						},
						// Bought value (scaled: 745px, x=73)
						{
							type: 'div',
							props: {
								style: {
									position: 'absolute',
									left: '73px',
									top: '745px',
									fontSize: '34px',
									fontWeight: 700,
									color: '#ffffff'
								},
								children: bought
							}
						},
						// P/L value (scaled: 745px, x=433)
						{
							type: 'div',
							props: {
								style: {
									position: 'absolute',
									left: '433px',
									top: '745px',
									fontSize: '34px',
									fontWeight: 700,
									color: '#ffffff'
								},
								children: pl
							}
						},
						// "Entry Price" label (scaled: 844px, x=62)
						{
							type: 'div',
							props: {
								style: {
									position: 'absolute',
									left: '62px',
									top: '844px',
									fontSize: '34px',
									fontWeight: 700,
									color: '#b1b3c2'
								},
								children: 'Entry Price'
							}
						},
						// "Mark Price" label (scaled: 844px, x=422)
						{
							type: 'div',
							props: {
								style: {
									position: 'absolute',
									left: '422px',
									top: '844px',
									fontSize: '34px',
									fontWeight: 700,
									color: '#b1b3c2'
								},
								children: 'Mark Price'
							}
						},
						// Entry Price value (scaled: 886px, x=73)
						{
							type: 'div',
							props: {
								style: {
									position: 'absolute',
									left: '73px',
									top: '886px',
									fontSize: '34px',
									fontWeight: 700,
									color: '#ffffff'
								},
								children: entryPrice
							}
						},
						// Mark Price value (scaled: 886px, x=433)
						{
							type: 'div',
							props: {
								style: {
									position: 'absolute',
									left: '433px',
									top: '886px',
									fontSize: '34px',
									fontWeight: 700,
									color: '#ffffff'
								},
								children: markPrice
							}
						}
					].filter(Boolean)
				}
			},
			{
				width: 1080,
				height: 1080,
				fonts: [
					{
						name: 'Arial Bold',
						data: font,
						weight: 700,
						style: 'normal'
					}
				]
			}
		);

		// Convert SVG to PNG using resvg
		const resvg = new Resvg(svg, {
			fitTo: {
				mode: 'width',
				value: 1080
			}
		});
		const overlayPng = resvg.render().asPng();

		// Load the background template via fetch (works on both localhost and Vercel)
		const backgroundUrl = new URL('/share_image_chub_blank.png', url.origin).toString();
		const bgResponse = await svelteKitFetch(backgroundUrl);
		const bgBuffer = Buffer.from(await bgResponse.arrayBuffer());
		const background = sharp(bgBuffer);

		// Composite the overlay onto the background
		const finalImage = await background
			.composite([
				{
					input: overlayPng,
					top: 0,
					left: 0
				}
			])
			.png()
			.toBuffer();

		return new Response(finalImage, {
			status: 200,
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (error) {
		console.error('Share image generation error:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return new Response(JSON.stringify({ error: errorMessage }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
};

// CORS support
export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
};
