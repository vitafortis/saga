<script lang="ts">
	import { Download, Flame, Lock, LockOpen } from '@lucide/svelte';
	import ItemHeader from '#lib/components/ItemHeader.svelte';
	import TextView from '#lib/components/TextView.svelte';
	import Unlock from '#lib/components/Unlock.svelte';
	import { statusMessage, UNREACHABLE } from '#lib/client/api.ts';
	import { saveBytes } from '#lib/client/files.ts';
	import { decrypt } from '#lib/crypto.ts';
	import { formatBytes } from '#lib/format.ts';
	import { TEXT_PREVIEW_BYTES } from '#lib/media.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let burned = $state(false);
	const src = $derived(`/file/${data.item.code}/download?inline`);

	// Encrypted: fetched once (a burn file is deleted then), kept in memory for retries, decrypted here.
	let cipher: Uint8Array | null = null;
	let decrypted = $state(false);
	async function unlock(password: string) {
		if (!cipher) {
			const res = await fetch(`/file/${data.item.code}/download`, { method: data.item.burn ? 'POST' : 'GET' }).catch(() => {
				throw new Error(UNREACHABLE);
			});
			if (!res.ok) throw new Error(statusMessage(res.status));
			cipher = new Uint8Array(await res.arrayBuffer());
			burned = data.item.burn;
		}
		saveBytes(await decrypt(cipher, password), data.item.name, data.item.mime);
		decrypted = true;
	}
</script>

<svelte:head><title>{data.item.name} · Saga</title></svelte:head>

<ItemHeader item={data.item} collection={data.collection} />

{#if data.item.encrypted}
	{#if decrypted}
		<div class="card flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
			<div class="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success"><LockOpen class="size-5" /></div>
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium">{data.item.name}</p>
				<p class="mt-0.5 text-xs text-muted-foreground">
					Decrypted and saved to your downloads.{#if burned} It's now deleted from the server.{/if}
				</p>
			</div>
			<button class="btn btn-secondary" onclick={() => (decrypted = false)}><Download />Again</button>
		</div>
	{:else}
		<Unlock action={data.item.burn && !burned ? 'Download, delete and decrypt' : 'Decrypt and download'} onunlock={unlock}>
			<span class="inline-flex items-center gap-1"><Lock class="size-3" />{data.item.name} · {formatBytes(data.item.size)}</span><br />
			{#if burned}
				Deleted from the server, but still on this page: try the password again, or
				<button class="text-primary hover:underline" onclick={() => cipher && saveBytes(cipher as Uint8Array<ArrayBuffer>, `${data.item.name}.enc`)}>save the encrypted file</button>.
			{:else if data.item.burn}
				It's deleted from the server when downloaded, but stays on this page so you can retry the password.
			{:else}
				Decrypted in your browser with the password it was shared with.
			{/if}
		</Unlock>
	{/if}
{:else}
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
	{:else if data.preview === 'pdf'}
		<iframe {src} title={data.item.name} class="h-[75vh] w-full border-b border-border bg-surface"></iframe>
	{:else if data.text}
		<div class="border-b border-border">
			<TextView content={data.text.text}>
				{#snippet note()}{#if data.text?.truncated} · first {formatBytes(TEXT_PREVIEW_BYTES)} shown; download for the rest{/if}{/snippet}
			</TextView>
		</div>
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
{/if}
