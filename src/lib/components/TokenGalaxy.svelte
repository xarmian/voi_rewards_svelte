<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Card, Button, Badge, Select } from 'flowbite-svelte';
	import type { UniqueToken } from '../../routes/api/tokens/+server';

	const dispatch = createEventDispatcher<{
		tokenSelect: UniqueToken;
		tokenHover: UniqueToken | null;
	}>();

	export let tokens: any[] = [];
	export let selectedToken: UniqueToken | null = null;
	export let loading = false;

	interface Token3D extends UniqueToken {
		position: { x: number; y: number; z: number };
		velocity: { x: number; y: number; z: number };
		metrics: {
			volume24h: number;
			tvl: number;
			priceChange24h: number;
			marketCap: number;
		};
		color: string;
		size: number;
		connections: number[];
	}

	let containerRef: HTMLDivElement;
	let canvasRef: HTMLCanvasElement;
	let tokens3D: Token3D[] = [];
	let animationId: number;
	let isWebGLSupported = false;
	let hoveredToken: Token3D | null = null;
	let cameraControls = {
		x: 0,
		y: 0,
		z: 500,
		rotationX: 0,
		rotationY: 0,
		zoom: 1
	};

	// Galaxy settings
	let galaxyMode: 'scatter' | 'cluster' | 'orbit' | 'network' = 'scatter';
	let colorMode: 'type' | 'performance' | 'volume' | 'tvl' = 'performance';
	let showConnections = false;
	let animationSpeed = 1;
	let particleCount = 100;

	// WebGL context and rendering
	let gl: WebGL2RenderingContext | null = null;
	let shaderProgram: WebGLProgram | null = null;
	let mouseX = 0;
	let mouseY = 0;
	let isMouseDown = false;

	// Vertex shader source
	const vertexShaderSource = `#version 300 es
		in vec3 position;
		in float size;
		in vec3 color;
		
		uniform mat4 projectionMatrix;
		uniform mat4 modelViewMatrix;
		uniform float time;
		uniform float pointSize;
		
		out vec3 vColor;
		out float vAlpha;
		
		void main() {
			vec3 pos = position;
			
			// Add some gentle floating animation
			pos.y += sin(time * 0.001 + position.x * 0.01) * 2.0;
			pos.x += cos(time * 0.001 + position.z * 0.01) * 1.0;
			
			vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
			gl_Position = projectionMatrix * mvPosition;
			
			// Size based on distance and token metrics
			gl_PointSize = (size * pointSize) / -mvPosition.z;
			
			vColor = color;
			vAlpha = 1.0 - (length(mvPosition.xyz) / 1000.0);
		}
	`;

	// Fragment shader source
	const fragmentShaderSource = `#version 300 es
		precision highp float;
		
		in vec3 vColor;
		in float vAlpha;
		
		out vec4 fragColor;
		
		void main() {
			// Create circular particles
			vec2 center = gl_PointCoord - 0.5;
			float dist = length(center);
			
			if (dist > 0.5) {
				discard;
			}
			
			// Add glow effect
			float alpha = (1.0 - dist * 2.0) * vAlpha;
			alpha = pow(alpha, 0.8);
			
			fragColor = vec4(vColor, alpha);
		}
	`;

	onMount(() => {
		if (canvasRef) {
			initWebGL();
			initializeGalaxy();
			animate();
			setupEventListeners();
		}
	});

	onDestroy(() => {
		if (animationId) {
			cancelAnimationFrame(animationId);
		}
		cleanup();
	});

	function initWebGL() {
		gl = canvasRef.getContext('webgl2', {
			alpha: true,
			antialias: true,
			premultipliedAlpha: false
		});

		if (!gl) {
			console.warn('WebGL2 not supported, falling back to WebGL');
			gl = canvasRef.getContext('webgl', {
				alpha: true,
				antialias: true
			}) as WebGL2RenderingContext;
			if (!gl) {
				console.error('WebGL not supported');
				isWebGLSupported = false;
				return;
			}
		}

		isWebGLSupported = true;

		// Create shader program
		const vertexShader = createShader(gl!, gl!.VERTEX_SHADER, vertexShaderSource);
		const fragmentShader = createShader(gl!, gl!.FRAGMENT_SHADER, fragmentShaderSource);

		if (!vertexShader || !fragmentShader) {
			console.error('Failed to create shaders');
			return;
		}

		shaderProgram = createProgram(gl!, vertexShader, fragmentShader);
		if (!shaderProgram) {
			console.error('Failed to create shader program');
			return;
		}

		gl!.useProgram(shaderProgram);

		// Enable blending for alpha transparency
		gl!.enable(gl!.BLEND);
		gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);

		// Enable depth testing
		gl!.enable(gl!.DEPTH_TEST);
		gl!.depthFunc(gl!.LEQUAL);

		resizeCanvas();
	}

	function createShader(
		gl: WebGL2RenderingContext,
		type: number,
		source: string
	): WebGLShader | null {
		const shader = gl.createShader(type);
		if (!shader) return null;

		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}

		return shader;
	}

	function createProgram(
		gl: WebGL2RenderingContext,
		vertexShader: WebGLShader,
		fragmentShader: WebGLShader
	): WebGLProgram | null {
		const program = gl.createProgram();
		if (!program) return null;

		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error('Program linking error:', gl.getProgramInfoLog(program));
			gl.deleteProgram(program);
			return null;
		}

		return program;
	}

	function initializeGalaxy() {
		if (!tokens.length || !isWebGLSupported) return;

		tokens3D = tokens.slice(0, particleCount).map((token, index) => {
			const position = generatePosition(index, tokens.length);
			const metrics = {
				volume24h: Math.random() * 1000000,
				tvl: Math.random() * 5000000,
				priceChange24h: (Math.random() - 0.5) * 40,
				marketCap: Math.random() * 10000000
			};

			return {
				...token,
				position,
				velocity: {
					x: (Math.random() - 0.5) * 0.1,
					y: (Math.random() - 0.5) * 0.1,
					z: (Math.random() - 0.5) * 0.1
				},
				metrics,
				color: getTokenColor(token, metrics),
				size: getTokenSize(metrics),
				connections: generateConnections(index, tokens.length)
			};
		});
	}

	function generatePosition(index: number, total: number): { x: number; y: number; z: number } {
		switch (galaxyMode) {
			case 'scatter':
				return {
					x: (Math.random() - 0.5) * 800,
					y: (Math.random() - 0.5) * 600,
					z: (Math.random() - 0.5) * 400
				};

			case 'cluster':
				const clusterCount = 5;
				const cluster = Math.floor(index / (total / clusterCount));
				const clusterCenter = {
					x: ((cluster % 3) - 1) * 200,
					y: (Math.floor(cluster / 3) - 1) * 200,
					z: (Math.random() - 0.5) * 100
				};
				return {
					x: clusterCenter.x + (Math.random() - 0.5) * 150,
					y: clusterCenter.y + (Math.random() - 0.5) * 150,
					z: clusterCenter.z + (Math.random() - 0.5) * 100
				};

			case 'orbit':
				const radius = 100 + (index / total) * 300;
				const angle = (index / total) * Math.PI * 4;
				const height = (Math.random() - 0.5) * 100;
				return {
					x: Math.cos(angle) * radius,
					y: height,
					z: Math.sin(angle) * radius
				};

			case 'network':
				const networkSize = Math.sqrt(total);
				const row = Math.floor(index / networkSize);
				const col = index % networkSize;
				return {
					x: (col - networkSize / 2) * 100,
					y: (row - networkSize / 2) * 100,
					z: (Math.random() - 0.5) * 50
				};

			default:
				return { x: 0, y: 0, z: 0 };
		}
	}

	function getTokenColor(token: any, metrics: any): string {
		switch (colorMode) {
			case 'type':
				const typeColors = {
					VOI: '#8b5cf6',
					ARC200: '#3b82f6',
					ASA: '#10b981',
					default: '#6b7280'
				};
				return typeColors[token.type as keyof typeof typeColors] || typeColors.default;

			case 'performance':
				const change = metrics.priceChange24h;
				if (change > 10) return '#22c55e';
				if (change > 5) return '#84cc16';
				if (change > 0) return '#eab308';
				if (change > -5) return '#f97316';
				return '#ef4444';

			case 'volume':
				const volume = metrics.volume24h;
				if (volume > 500000) return '#8b5cf6';
				if (volume > 100000) return '#3b82f6';
				if (volume > 50000) return '#06b6d4';
				if (volume > 10000) return '#10b981';
				return '#6b7280';

			case 'tvl':
				const tvl = metrics.tvl;
				if (tvl > 1000000) return '#dc2626';
				if (tvl > 500000) return '#ea580c';
				if (tvl > 100000) return '#d97706';
				if (tvl > 50000) return '#ca8a04';
				return '#6b7280';

			default:
				return '#8b5cf6';
		}
	}

	function getTokenSize(metrics: any): number {
		const baseSize = 1.0;
		const volumeMultiplier = Math.log(metrics.volume24h + 1) / 15;
		const tvlMultiplier = Math.log(metrics.tvl + 1) / 15;
		return baseSize + Math.max(volumeMultiplier, tvlMultiplier);
	}

	function generateConnections(index: number, total: number): number[] {
		const connectionCount = Math.min(3, Math.floor(Math.random() * 5));
		const connections: number[] = [];

		for (let i = 0; i < connectionCount; i++) {
			let targetIndex;
			do {
				targetIndex = Math.floor(Math.random() * total);
			} while (targetIndex === index || connections.includes(targetIndex));

			connections.push(targetIndex);
		}

		return connections;
	}

	function animate() {
		if (!gl || !shaderProgram || !isWebGLSupported) return;

		// Clear canvas
		gl.viewport(0, 0, canvasRef.width, canvasRef.height);
		gl.clearColor(0.05, 0.05, 0.1, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		// Update camera and matrices
		updateCamera();

		// Create matrices
		const projectionMatrix = createPerspectiveMatrix(
			(45 * Math.PI) / 180,
			canvasRef.width / canvasRef.height,
			0.1,
			2000
		);

		const modelViewMatrix = createModelViewMatrix();

		// Set uniforms
		const projectionLocation = gl.getUniformLocation(shaderProgram, 'projectionMatrix');
		const modelViewLocation = gl.getUniformLocation(shaderProgram, 'modelViewMatrix');
		const timeLocation = gl.getUniformLocation(shaderProgram, 'time');
		const pointSizeLocation = gl.getUniformLocation(shaderProgram, 'pointSize');

		gl.uniformMatrix4fv(projectionLocation, false, projectionMatrix);
		gl.uniformMatrix4fv(modelViewLocation, false, modelViewMatrix);
		gl.uniform1f(timeLocation, Date.now() * animationSpeed);
		gl.uniform1f(pointSizeLocation, 50.0 * cameraControls.zoom);

		// Render tokens
		renderTokens();

		// Render connections if enabled
		if (showConnections) {
			renderConnections();
		}

		animationId = requestAnimationFrame(animate);
	}

	function updateCamera() {
		// Smooth camera movement
		// Add mouse interaction effects here
	}

	function createPerspectiveMatrix(
		fovy: number,
		aspect: number,
		near: number,
		far: number
	): Float32Array {
		const f = 1.0 / Math.tan(fovy / 2);
		const nf = 1 / (near - far);

		return new Float32Array([
			f / aspect,
			0,
			0,
			0,
			0,
			f,
			0,
			0,
			0,
			0,
			(far + near) * nf,
			-1,
			0,
			0,
			2 * far * near * nf,
			0
		]);
	}

	function createModelViewMatrix(): Float32Array {
		// Simple translation matrix for now
		return new Float32Array([
			1,
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0,
			1,
			0,
			-cameraControls.x,
			-cameraControls.y,
			-cameraControls.z,
			1
		]);
	}

	function renderTokens() {
		if (!gl || !tokens3D.length) return;

		// Create vertex data
		const vertices = new Float32Array(tokens3D.length * 3);
		const sizes = new Float32Array(tokens3D.length);
		const colors = new Float32Array(tokens3D.length * 3);

		tokens3D.forEach((token, index) => {
			const i = index * 3;
			vertices[i] = token.position.x;
			vertices[i + 1] = token.position.y;
			vertices[i + 2] = token.position.z;

			sizes[index] = token.size;

			const color = hexToRgb(token.color);
			colors[i] = color.r / 255;
			colors[i + 1] = color.g / 255;
			colors[i + 2] = color.b / 255;
		});

		// Create and bind buffers
		const positionBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

		const positionLocation = gl.getAttribLocation(shaderProgram!, 'position');
		gl.enableVertexAttribArray(positionLocation);
		gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

		// Size buffer
		const sizeBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);

		const sizeLocation = gl.getAttribLocation(shaderProgram!, 'size');
		gl.enableVertexAttribArray(sizeLocation);
		gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, 0, 0);

		// Color buffer
		const colorBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);

		const colorLocation = gl.getAttribLocation(shaderProgram!, 'color');
		gl.enableVertexAttribArray(colorLocation);
		gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

		// Draw points
		gl.drawArrays(gl.POINTS, 0, tokens3D.length);

		// Cleanup
		gl.deleteBuffer(positionBuffer);
		gl.deleteBuffer(sizeBuffer);
		gl.deleteBuffer(colorBuffer);
	}

	function renderConnections() {
		// Implement connection rendering if needed
	}

	function hexToRgb(hex: string): { r: number; g: number; b: number } {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result
			? {
					r: parseInt(result[1], 16),
					g: parseInt(result[2], 16),
					b: parseInt(result[3], 16)
				}
			: { r: 0, g: 0, b: 0 };
	}

	function setupEventListeners() {
		if (!containerRef || !canvasRef || typeof window === 'undefined') return;

		canvasRef.addEventListener('mousedown', handleMouseDown);
		canvasRef.addEventListener('mousemove', handleMouseMove);
		canvasRef.addEventListener('mouseup', handleMouseUp);
		canvasRef.addEventListener('wheel', handleWheel);
		canvasRef.addEventListener('click', handleClick);

		window.addEventListener('resize', resizeCanvas);
	}

	function handleMouseDown(event: MouseEvent) {
		isMouseDown = true;
		mouseX = event.clientX;
		mouseY = event.clientY;
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isMouseDown) return;

		const deltaX = event.clientX - mouseX;
		const deltaY = event.clientY - mouseY;

		cameraControls.rotationY += deltaX * 0.01;
		cameraControls.rotationX += deltaY * 0.01;

		mouseX = event.clientX;
		mouseY = event.clientY;
	}

	function handleMouseUp() {
		isMouseDown = false;
	}

	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		cameraControls.zoom += event.deltaY * 0.001;
		cameraControls.zoom = Math.max(0.1, Math.min(5, cameraControls.zoom));
	}

	function handleClick(event: MouseEvent) {
		// Implement token selection via ray casting
		const rect = canvasRef.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		// Simple distance-based selection for now
		let closestToken = null;
		let closestDistance = Infinity;

		tokens3D.forEach((token) => {
			const screenPos = projectToScreen(token.position);
			const distance = Math.sqrt((screenPos.x - x) ** 2 + (screenPos.y - y) ** 2);

			if (distance < closestDistance && distance < 0.1) {
				closestDistance = distance;
				closestToken = token;
			}
		});

		if (closestToken) {
			dispatch('tokenSelect', closestToken);
		}
	}

	function projectToScreen(position: { x: number; y: number; z: number }): {
		x: number;
		y: number;
	} {
		// Simple projection - implement proper matrix math for accuracy
		const distance = Math.sqrt(
			position.x ** 2 + position.y ** 2 + (position.z + cameraControls.z) ** 2
		);
		return {
			x: position.x / distance,
			y: position.y / distance
		};
	}

	function resizeCanvas() {
		if (!canvasRef || !containerRef || typeof window === 'undefined') return;

		const rect = containerRef.getBoundingClientRect();
		canvasRef.width = rect.width * window.devicePixelRatio;
		canvasRef.height = rect.height * window.devicePixelRatio;
		canvasRef.style.width = rect.width + 'px';
		canvasRef.style.height = rect.height + 'px';
	}

	function cleanup() {
		if (gl && shaderProgram) {
			gl.deleteProgram(shaderProgram);
		}
	}

	// Reactive updates
	$: if (tokens3D.length > 0 && (galaxyMode || colorMode)) {
		initializeGalaxy();
	}
</script>

<Card class="h-full">
	<!-- Controls -->
	<div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-600">
		<div>
			<h3 class="text-lg font-bold text-gray-900 dark:text-white">Token Galaxy</h3>
			<p class="text-sm text-gray-600 dark:text-gray-400">
				3D exploration of {tokens3D.length} tokens
			</p>
		</div>

		<div class="flex items-center gap-4">
			<!-- Galaxy mode -->
			<div class="flex items-center gap-2">
				<label class="text-sm text-gray-600 dark:text-gray-400">Layout:</label>
				<Select bind:value={galaxyMode} size="sm" class="w-32">
					<option value="scatter">Scatter</option>
					<option value="cluster">Clusters</option>
					<option value="orbit">Orbital</option>
					<option value="network">Network</option>
				</Select>
			</div>

			<!-- Color mode -->
			<div class="flex items-center gap-2">
				<label class="text-sm text-gray-600 dark:text-gray-400">Color:</label>
				<Select bind:value={colorMode} size="sm" class="w-32">
					<option value="type">Token Type</option>
					<option value="performance">Performance</option>
					<option value="volume">Volume</option>
					<option value="tvl">TVL</option>
				</Select>
			</div>

			<!-- Settings -->
			<Button size="sm" color="alternative">
				<i class="fas fa-cog"></i>
			</Button>
		</div>
	</div>

	<!-- Galaxy container -->
	<div class="relative flex-1" bind:this={containerRef}>
		{#if loading}
			<div
				class="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800"
				transition:fade
			>
				<div class="text-center">
					<i class="fas fa-spinner fa-spin text-3xl text-gray-400 mb-3"></i>
					<p class="text-gray-600 dark:text-gray-400">Loading token galaxy...</p>
				</div>
			</div>
		{:else if !isWebGLSupported}
			<div class="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
				<div class="text-center">
					<i class="fas fa-exclamation-triangle text-4xl text-gray-400 mb-4"></i>
					<h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
						WebGL Not Supported
					</h4>
					<p class="text-gray-600 dark:text-gray-400">
						Your browser doesn't support WebGL, which is required for the 3D galaxy view.
					</p>
				</div>
			</div>
		{:else}
			<canvas
				bind:this={canvasRef}
				class="w-full h-full bg-gradient-to-b from-gray-900 to-black cursor-grab active:cursor-grabbing"
				style="min-height: 500px;"
			></canvas>

			<!-- Instructions overlay -->
			<div
				class="absolute bottom-4 left-4 bg-black/70 text-white text-sm p-3 rounded-lg backdrop-blur-sm"
			>
				<div class="space-y-1">
					<div><i class="fas fa-mouse mr-2"></i>Click and drag to rotate</div>
					<div><i class="fas fa-scroll mr-2"></i>Scroll to zoom</div>
					<div><i class="fas fa-hand-pointer mr-2"></i>Click tokens to select</div>
				</div>
			</div>

			<!-- Color legend -->
			<div
				class="absolute top-4 right-4 bg-black/70 text-white text-sm p-3 rounded-lg backdrop-blur-sm"
			>
				<h5 class="font-semibold mb-2">Color Legend</h5>
				{#if colorMode === 'performance'}
					<div class="space-y-1">
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full bg-green-500"></div>
							<span>+10%+ gain</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full bg-yellow-500"></div>
							<span>0-10% gain</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full bg-orange-500"></div>
							<span>0-5% loss</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full bg-red-500"></div>
							<span>5%+ loss</span>
						</div>
					</div>
				{:else if colorMode === 'type'}
					<div class="space-y-1">
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full bg-purple-500"></div>
							<span>VOI</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full bg-blue-500"></div>
							<span>ARC200</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full bg-green-500"></div>
							<span>ASA</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Token info panel -->
	{#if selectedToken}
		<div
			class="p-4 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
			transition:slide
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div
						class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm"
					>
						{selectedToken.symbol.slice(0, 2)}
					</div>
					<div>
						<h4 class="font-semibold text-gray-900 dark:text-white">
							{selectedToken.symbol}
						</h4>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							{selectedToken.type} • {selectedToken.poolCount} pools
						</p>
					</div>
				</div>
				<Button
					size="sm"
					color="alternative"
					on:click={() => dispatch('tokenSelect', selectedToken)}
				>
					<i class="fas fa-external-link-alt mr-2"></i>
					View Details
				</Button>
			</div>
		</div>
	{/if}
</Card>
