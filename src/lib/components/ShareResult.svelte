<script lang="ts">
	import { Check, Copy, ExternalLink, Flame, Plus } from '@lucide/svelte';
	import { fly } from 'svelte/transition';
	import { copy } from '#lib/client/state.svelte.ts';
	import { formatBytes, groupCode, relativeTime } from '#lib/format.ts';
	import type { Item } from '#lib/types.ts';
	import Qr from './Qr.svelte';

	let { item, url, onnew }: { item: Item; url: string; onnew: () => void } = $props();
</script>

<div class="card overflow-hidden" in:fly={{ y: 8, duration: 200 }}>
	<div class="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-start sm:p-7">
		<Qr value={url} />
		<div class="min-w-0 flex-1 text-center sm:text-left">
			<p class="flex items-center justify-center gap-1.5 text-xs font-medium text-success sm:justify-start">
				<Check class="size-3.5" />{item.kind === 'paste' ? 'Paste' : 'File'} shared
			</p>
			<button
				class="mt-2 font-mono text-4xl font-semibold tracking-[0.08em] tabular-nums hover:text-primary sm:text-5xl"
				onclick={() => copy(item.code, 'Code copied')}
				title="Copy code">{groupCode(item.code)}</button
			>
			<p class="mt-2 truncate text-[0.8125rem] text-muted-foreground">
				{item.name || 'Untitled'} · {formatBytes(item.size)} · {item.expiresAt ? `expires ${relativeTime(item.expiresAt)}` : 'never expires'}
			</p>
			{#if item.burn}
				<p class="mt-2"><span class="badge badge-warning"><Flame />Deleted after first open</span></p>
			{/if}
			<div class="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface p-1 pl-3">
				<span class="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted-foreground">{url}</span>
				<button class="btn btn-secondary btn-sm" onclick={() => copy(url, 'Link copied')}><Copy />Copy link</button>
			</div>
			<div class="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
				<a class="btn btn-secondary btn-sm" href="/{item.kind}/{item.code}"><ExternalLink />Open</a>
				<button class="btn btn-primary btn-sm" onclick={onnew}><Plus />Share another</button>
			</div>
		</div>
	</div>
	<p class="border-t border-border bg-surface px-6 py-2.5 text-center text-[0.6875rem] text-muted-foreground sm:text-left">
		On the other device, scan the code or type <span class="font-mono text-foreground">{groupCode(item.code)}</span> into the box at the top of Saga.
	</p>
</div>
