<script lang="ts">
	let { size = 28 }: { size?: number } = $props();

	/** Saga's S: five pills handing off from one to the next, graded from ink to light. */
	const pills = [
		{ x: 16, y: 4, w: 40, h: 12, fill: 'fill-[#441b8c] dark:fill-[#795bce]' },
		{ x: 4, y: 10, w: 12, h: 22, fill: 'fill-[#573a9f] dark:fill-[#8c75da]' },
		{ x: 16, y: 26, w: 32, h: 12, fill: 'fill-[#6c56b3] dark:fill-[#9f8ee5]' },
		{ x: 48, y: 32, w: 12, h: 22, fill: 'fill-[#8370c6] dark:fill-[#b3a6ef]' },
		{ x: 8, y: 48, w: 40, h: 12, fill: 'fill-[#9a8bd9] dark:fill-[#c8bffa]' }
	];
</script>

<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" class="shrink-0">
	{#each pills as p, i (i)}
		<rect x={p.x} y={p.y} width={p.w} height={p.h} rx="6" class={p.fill} />
	{/each}
</svg>
