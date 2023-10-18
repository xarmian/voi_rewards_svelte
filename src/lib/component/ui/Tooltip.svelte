<script lang="ts">
	export let title = '';
	let isHovered = false;
	let x: number;
	let y: number;

	export let delay = 1000;

	let started = false; // to prevent multiple timeouts

	function mouseOver(event: any) {
		if (started) return;
		started = true;
		const tooltip = document.querySelector('.tooltip-container') as HTMLElement;
		const tooltipWidth = tooltip.offsetWidth;
		const tooltipHeight = tooltip.offsetHeight;
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;
		const margin = 5;
		setTimeout(() => {
			if (!started) return;
			started = false;
			isHovered = true;
			if (event.pageX + tooltipWidth + margin <= screenWidth) {
				x = event.pageX + margin;
			} else {
				x = screenWidth - tooltipWidth - margin - tooltipWidth;
			}

			if (event.pageY + tooltipHeight + margin <= screenHeight) {
				y = event.pageY + margin;
			} else {
				y = screenHeight - tooltipHeight - margin;
			}
		}, delay);
	}
	function mouseMove(event: any) {
		// x = event.pageX + 5;
		// y = event.pageY + 5;
	}
	function mouseLeave() {
		isHovered = false;
		started = false;
	}
	function mouseFocus() {}
</script>

<div
	class="tooltip-container"
	role="tooltip"
	on:mouseover={mouseOver}
	on:mouseleave={mouseLeave}
	on:mousemove={mouseMove}
	on:focus={mouseFocus}
>
	<slot />
</div>

{#if isHovered}
	<div style="top: {y}px; left: {x}px;" class="tooltip">{title}</div>
{/if}

<style>
	.tooltip {
		border: 1px solid #ddd;
		box-shadow: 1px 1px 1px #ddd;
		background: white;
		border-radius: 4px;
		padding: 4px;
		position: absolute;
	}
</style>
