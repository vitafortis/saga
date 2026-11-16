<script lang="ts">
	import { Download, Flame } from '@lucide/svelte';
	import ItemHeader from '#lib/components/ItemHeader.svelte';
	import { formatBytes } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let burned = $state(false);
	const src = $derived(`/file/${data.item.code}/download?inline`);
</script>

<svelte:head><title>{data.item.name} · Saga</title></svelte:head>

<ItemHeader item={data.item} />

<div class="card overflow-hidden">
	{#if data.preview === 'image'}
		<div class="dot-grid grid place-items-center border-b border-border bg-surface p-4">
			<img {src} alt={data.item.name} class="max-h-[65vh] max-w-full rounded-lg shadow-surface" />
		</div>
	{:else if data.preview === 'video'}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video {src} controls preload="metadata" class="max-h-[65vh] w-full border-b border-border bg-black"></video>
	{:else if data.preview === 'audio'}
		<div class="border-b border-border bg-surface p-5"><audio {src} controls preload="metadata" class="w-full"></audio></div>
	{/if}

	<div class="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium">{data.item.name}</p>
			<p class="mt-0.5 text-xs text-muted-foreground">{formatBytes(data.item.size)} · {data.item.mime}</p>
		</div>
		{#if data.item.burn}
			{#if burned}
				<p class="flex items-center gap-2 text-xs text-warning"><Flame class="size-3.5" />Downloading. The file is now deleted from the server.</p>
			{:else}
				<!-- A real form post: the browser saves the response as a download, without holding it in memory. -->
				<form method="POST" action="/file/{data.item.code}/download" onsubmit={() => setTimeout(() => (burned = true))}>
					<button class="btn btn-primary"><Download />Download and delete</button>
				</form>
			{/if}
		{:else}
			<a class="btn btn-primary" href="/file/{data.item.code}/download" download={data.item.name}><Download />Download</a>
		{/if}
	</div>
</div>
