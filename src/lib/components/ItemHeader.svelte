<script lang="ts">
	import { ChevronLeft, Clock, Eye, File as FileIcon, FileText, Flame, FolderOpen, HardDriveDownload, Link, LoaderCircle, Lock, QrCode, Trash2 } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { copy, toast } from '#lib/client/state.svelte.ts';
	import { formatBytes, groupCode, relativeTime } from '#lib/format.ts';
	import type { Collection, Item } from '#lib/types.ts';
	import Qr from './Qr.svelte';

	let { item, collection = null, actions }: { item: Item; collection?: Collection | null; actions?: Snippet } = $props();
	let showQr = $state(false);
	const url = $derived(`${page.data.origin}/${item.kind}/${item.code}`);

	// A copy in the NAS folder (Settings → Backups); burn items aren't, as a copy would outlive their one open.
	let saving = $state(false);
	async function saveToNas() {
		saving = true;
		try {
			const { path } = await api.post<{ path: string }>(`/api/items/${item.code}/save`);
			toast('success', 'Saved to NAS', path);
		} catch (err) {
			toast('error', 'Couldn’t save', errorMessage(err));
		}
		saving = false;
	}

	async function remove() {
		try {
			await api.del(`/api/items/${item.code}`);
			toast('success', 'Deleted');
			goto(collection ? `/collection/${collection.code}` : '/', { invalidateAll: true });
		} catch (err) {
			toast('error', 'Couldn’t delete', errorMessage(err));
		}
	}
</script>

{#if collection}
	<a href="/collection/{collection.code}" class="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
		<ChevronLeft class="size-3.5" /><FolderOpen class="size-3.5" />{collection.name}
	</a>
{/if}
<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start">
	<div class="flex min-w-0 flex-1 items-start gap-3">
		<div class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary [&_svg]:size-5">
			{#if item.kind === 'paste'}<FileText />{:else}<FileIcon />{/if}
		</div>
		<div class="min-w-0">
			<h1 class="truncate text-lg font-semibold tracking-tight">{item.name || 'Untitled paste'}</h1>
			<p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				<button class="font-mono tracking-wider hover:text-foreground" onclick={() => copy(item.code, 'Code copied')} title="Copy code">{groupCode(item.code)}</button>
				<span>·</span><span>{formatBytes(item.size)}</span>
				<span>·</span><span title={new Date(item.createdAt).toLocaleString()}>{relativeTime(item.createdAt)}</span>
				<span class="inline-flex items-center gap-1"><Clock class="size-3" />{item.expiresAt ? `expires ${relativeTime(item.expiresAt)}` : 'never expires'}</span>
				{#if item.views}<span class="inline-flex items-center gap-1"><Eye class="size-3" />{item.views}</span>{/if}
				{#if item.encrypted}<span class="badge badge-primary"><Lock />Encrypted</span>{/if}
				{#if item.burn}<span class="badge badge-warning"><Flame />Deleted after first open</span>{/if}
				{#if item.path}<span class="badge font-mono">{item.path}{item.mode ? ` · ${item.mode}` : ''}</span>{/if}
			</p>
		</div>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		{@render actions?.()}
		{#if page.data.backups && page.data.authed && !item.burn}
			<button class="btn btn-secondary btn-icon btn-sm" onclick={saveToNas} disabled={saving} aria-label="Save to NAS" title="Save a copy to the NAS">
				{#if saving}<LoaderCircle class="animate-spin" />{:else}<HardDriveDownload />{/if}
			</button>
		{/if}
		<button class="btn btn-secondary btn-sm" onclick={() => copy(url, 'Link copied')}><Link />Link</button>
		<button class="btn btn-secondary btn-icon btn-sm {showQr ? 'bg-accent' : ''}" onclick={() => (showQr = !showQr)} aria-label="QR code" title="QR code"><QrCode /></button>
		{#if page.data.authed}
			<button class="btn btn-danger-outline btn-icon btn-sm" onclick={remove} aria-label="Delete" title="Delete"><Trash2 /></button>
		{/if}
	</div>
</div>

{#if showQr}
	<div transition:slide={{ duration: 160 }} class="mb-4">
		<div class="card flex items-center gap-5 p-4">
			<Qr value={url} size={132} />
			<div class="min-w-0 text-[0.8125rem]">
				<p class="font-medium">Open on another device</p>
				<p class="mt-1 text-muted-foreground">Scan this, or type <span class="font-mono text-foreground">{groupCode(item.code)}</span> into Saga.</p>
				<p class="mt-2 truncate font-mono text-xs text-muted-foreground">{url}</p>
			</div>
		</div>
	</div>
{/if}
