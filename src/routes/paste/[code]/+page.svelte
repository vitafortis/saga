<script lang="ts">
	import { Copy, Download, Eye, FileCode, Flame, LoaderCircle, WrapText } from '@lucide/svelte';
	import ItemHeader from '#lib/components/ItemHeader.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { copy, toast } from '#lib/client/state.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let revealed = $state<string | null>(null);
	let opening = $state(false);
	let wrap = $state(false);
	const content = $derived(data.content ?? revealed);
	const lines = $derived(content === null ? 0 : content.split('\n').length);
	const numbers = $derived(Array.from({ length: lines }, (_, i) => i + 1).join('\n'));
	const fileName = $derived(data.item.name ? (/\.\w{1,8}$/.test(data.item.name) ? data.item.name : `${data.item.name}.txt`) : `${data.item.code}.txt`);

	async function reveal() {
		opening = true;
		try {
			revealed = (await api.post<{ content: string }>(`/api/items/${data.item.code}/open`)).content;
		} catch (err) {
			toast('error', 'Couldn’t open', errorMessage(err));
		}
		opening = false;
	}

	// Revealed burn pastes are gone from the server, so download from what we have.
	function download() {
		const a = Object.assign(document.createElement('a'), {
			href: URL.createObjectURL(new Blob([content ?? ''], { type: 'text/plain' })),
			download: fileName
		});
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<svelte:head><title>{data.item.name || 'Paste'} · Saga</title></svelte:head>

<ItemHeader item={data.item}>
	{#snippet actions()}
		{#if content !== null}
			<button class="btn btn-primary btn-sm" onclick={() => copy(content ?? '', 'Text copied')}><Copy />Copy</button>
			{#if !data.item.burn}
				<a class="btn btn-secondary btn-sm" href="/paste/{data.item.code}/raw" target="_blank" rel="noreferrer"><FileCode />Raw</a>
			{/if}
			<button class="btn btn-secondary btn-icon btn-sm" onclick={download} aria-label="Download" title="Download"><Download /></button>
		{/if}
	{/snippet}
</ItemHeader>

{#if content === null}
	<div class="card px-6 py-12 text-center">
		<div class="mx-auto grid size-12 place-items-center rounded-xl bg-warning/10 text-warning"><Flame class="size-6" /></div>
		<h2 class="mt-4 font-semibold tracking-tight">This paste can be read once</h2>
		<p class="mx-auto mt-1 max-w-sm text-[0.8125rem] text-muted-foreground">It's deleted as soon as you open it. Copy what you need before leaving the page.</p>
		<button class="btn btn-primary mt-5" onclick={reveal} disabled={opening}>
			{#if opening}<LoaderCircle class="animate-spin" />{:else}<Eye />{/if}Open and delete
		</button>
	</div>
{:else}
	{#if revealed !== null}
		<p class="mb-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
			<Flame class="size-3.5" />This paste has been deleted from the server. It stays here until you leave the page.
		</p>
	{/if}
	<div class="card overflow-hidden">
		<div class="flex items-center justify-between border-b border-border bg-surface px-4 py-1.5 text-xs text-muted-foreground">
			<span class="tabular-nums">{lines} {lines === 1 ? 'line' : 'lines'}</span>
			<button class="btn btn-ghost btn-sm {wrap ? 'text-foreground' : ''}" onclick={() => (wrap = !wrap)} aria-pressed={wrap}><WrapText />Wrap</button>
		</div>
		<div class="flex max-h-[75vh] overflow-auto font-mono text-[0.8125rem] leading-relaxed">
			{#if !wrap}
				<pre aria-hidden="true" class="sticky left-0 shrink-0 border-r border-border bg-card px-3 py-3 text-right text-muted-foreground/60 select-none">{numbers}</pre>
			{/if}
			<pre class="min-w-0 flex-1 px-4 py-3 {wrap ? 'break-words whitespace-pre-wrap' : ''}">{content}</pre>
		</div>
	</div>
{/if}
