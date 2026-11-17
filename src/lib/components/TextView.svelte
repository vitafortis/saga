<script lang="ts">
	import { WrapText } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	/** Text with line numbers and a wrap toggle: pastes, and text files on their page. */
	let { content, note }: { content: string; note?: Snippet } = $props();
	let wrap = $state(false);
	const lines = $derived(content.split('\n').length);
	const numbers = $derived(Array.from({ length: lines }, (_, i) => i + 1).join('\n'));
</script>

<div class="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-1.5 text-xs text-muted-foreground">
	<span class="truncate tabular-nums">{lines} {lines === 1 ? 'line' : 'lines'}{@render note?.()}</span>
	<button class="btn btn-ghost btn-sm {wrap ? 'text-foreground' : ''}" onclick={() => (wrap = !wrap)} aria-pressed={wrap}><WrapText />Wrap</button>
</div>
<div class="flex max-h-[75vh] overflow-auto font-mono text-[0.8125rem] leading-relaxed">
	{#if !wrap}
		<pre aria-hidden="true" class="sticky left-0 shrink-0 border-r border-border bg-card px-3 py-3 text-right text-muted-foreground/60 select-none">{numbers}</pre>
	{/if}
	<pre class="min-w-0 flex-1 px-4 py-3 {wrap ? 'break-words whitespace-pre-wrap' : ''}">{content}</pre>
</div>
