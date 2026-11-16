<script lang="ts">
	import { Clock, Copy, File as FileIcon, FileText, Flame, LoaderCircle, LogIn, Send, Trash2, Upload, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import CodeJump from '#lib/components/CodeJump.svelte';
	import ShareResult from '#lib/components/ShareResult.svelte';
	import { api, errorMessage, uploadFile } from '#lib/client/api.ts';
	import { copy, toast } from '#lib/client/state.svelte.ts';
	import { formatBytes, groupCode, relativeTime } from '#lib/format.ts';
	import { EXPIRY_OPTIONS, type Item } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Shared = { item: Item; url: string };

	let tab = $state<'text' | 'file'>('text');
	let title = $state('');
	let content = $state('');
	let files = $state<File[]>([]);
	let expiry = $state('1d');
	let burn = $state(false);
	let busy = $state(false);
	let progress = $state(0);
	let abort: (() => void) | null = null;
	let results = $state<Shared[]>([]);
	let dragging = $state(0);
	// Set after hydration so the server-rendered label matches.
	let mod = $state('Ctrl');
	onMount(() => {
		if (/Mac|iPhone|iPad/.test(navigator.userAgent)) mod = '⌘';
	});

	const canSubmit = $derived(!busy && (tab === 'text' ? content.trim() !== '' : files.length > 0));
	const tooBig = $derived(files.filter((f) => f.size > data.maxFileBytes));

	function reset() {
		results = [];
		title = '';
		content = '';
		files = [];
		progress = 0;
	}

	function addFiles(list: FileList | File[] | null | undefined) {
		if (!list?.length) return;
		files = [...files, ...Array.from(list)];
		tab = 'file';
		results = [];
	}

	async function submit() {
		if (!canSubmit) return;
		busy = true;
		try {
			if (tab === 'text') {
				results = [await api.post<Shared>('/api/pastes', { content, title, expiry, burn })];
			} else {
				if (tooBig.length) throw new Error(`${tooBig[0].name} is over ${formatBytes(data.maxFileBytes)}`);
				const out: Shared[] = [];
				const total = files.reduce((n, f) => n + f.size, 0) || 1;
				let sent = 0;
				for (const file of files) {
					const up = uploadFile(file, { expiry, burn }, (f) => (progress = (sent + f * file.size) / total));
					abort = up.abort;
					out.push(await up.done);
					sent += file.size;
				}
				results = out;
			}
			invalidateAll();
		} catch (err) {
			toast('error', 'Couldn’t share', errorMessage(err));
		} finally {
			busy = false;
			abort = null;
			progress = 0;
		}
	}

	async function remove(item: Item) {
		try {
			await api.del(`/api/items/${item.code}`);
			invalidateAll();
		} catch (err) {
			toast('error', 'Couldn’t delete', errorMessage(err));
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && data.authed) {
			e.preventDefault();
			submit();
		}
	}

	// Pasting files (a screenshot, files copied in Finder/Explorer) anywhere stages them.
	function onPaste(e: ClipboardEvent) {
		if (!data.authed || busy || !e.clipboardData?.files.length) return;
		e.preventDefault();
		addFiles(e.clipboardData.files);
	}

	const isFileDrag = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
</script>

<svelte:head><title>Saga</title></svelte:head>

<svelte:window
	onkeydown={onKeydown}
	onpaste={onPaste}
	ondragenter={(e) => isFileDrag(e) && data.authed && dragging++}
	ondragleave={(e) => isFileDrag(e) && data.authed && (dragging = Math.max(0, dragging - 1))}
	ondragover={(e) => isFileDrag(e) && data.authed && e.preventDefault()}
	ondrop={(e) => {
		if (!isFileDrag(e) || !data.authed) return;
		e.preventDefault();
		dragging = 0;
		addFiles(e.dataTransfer?.files);
	}}
/>

{#if !data.authed}
	<section class="mx-auto mt-4 max-w-md text-center sm:mt-12">
		<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Open a shared item</h1>
		<p class="mt-2 text-[0.8125rem] text-muted-foreground">Type the code from the other device.</p>
		<div class="mt-7"><CodeJump large /></div>
		<a class="btn btn-ghost btn-sm mt-6" href="/login"><LogIn />Sign in to share</a>
	</section>
{:else}
	<section class="mb-6">
		<h1 class="text-xl font-semibold tracking-tight">Share something</h1>
		<p class="mt-1 text-[0.8125rem] text-muted-foreground">Text or files, with a short code to open them on another device.</p>
	</section>

	{#if results.length === 1}
		<ShareResult item={results[0].item} url={results[0].url} onnew={reset} />
	{:else if results.length > 1}
		<div class="card overflow-hidden">
			<div class="flex items-center justify-between border-b border-border px-5 py-3">
				<p class="text-[0.8125rem] font-medium">{results.length} files shared</p>
				<button class="btn btn-primary btn-sm" onclick={reset}>Share more</button>
			</div>
			{#each results as r (r.item.code)}
				<div class="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-0">
					<span class="font-mono text-sm font-semibold tracking-wider">{groupCode(r.item.code)}</span>
					<a class="min-w-0 flex-1 truncate text-[0.8125rem] hover:underline" href="/file/{r.item.code}">{r.item.name}</a>
					<button class="btn btn-secondary btn-sm" onclick={() => copy(r.url, 'Link copied')}><Copy />Link</button>
				</div>
			{/each}
		</div>
	{:else}
		<div class="card overflow-hidden">
			<div class="flex items-center gap-1 border-b border-border px-3 pt-3">
				{#each [{ id: 'text', label: 'Text', icon: FileText }, { id: 'file', label: 'Files', icon: Upload }] as t (t.id)}
					<button
						class="-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-[0.8125rem] font-medium transition-colors [&_svg]:size-4 {tab === t.id
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
						onclick={() => (tab = t.id as 'text' | 'file')}
					>
						<t.icon />{t.label}
						{#if t.id === 'file' && files.length}<span class="badge badge-primary">{files.length}</span>{/if}
					</button>
				{/each}
			</div>

			<div class="p-4 sm:p-5">
				{#if tab === 'text'}
					<input class="input mb-3" placeholder="Title (optional)" maxlength="200" bind:value={title} />
					<!-- svelte-ignore a11y_autofocus -->
					<textarea
						class="input block h-auto min-h-72 resize-y py-2.5 font-mono text-[0.8125rem] leading-relaxed"
						placeholder="Paste or type anything…"
						spellcheck="false"
						autofocus
						bind:value={content}
					></textarea>
					<p class="mt-1.5 text-right text-[0.6875rem] text-muted-foreground tabular-nums">
						{content ? `${content.split('\n').length} lines · ${formatBytes(new Blob([content]).size)}` : ''}
					</p>
				{:else}
					<label
						class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors {dragging
							? 'border-primary bg-primary-soft'
							: 'border-border hover:border-primary/50 hover:bg-surface'}"
					>
						<input type="file" multiple class="sr-only" onchange={(e) => addFiles(e.currentTarget.files)} />
						<div class="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary"><Upload class="size-5" /></div>
						<p class="mt-3 text-sm font-medium">Drop files, paste, or <span class="text-primary">browse</span></p>
						<p class="mt-1 text-xs text-muted-foreground">Up to {formatBytes(data.maxFileBytes)} each</p>
					</label>
					{#if files.length}
						<ul class="mt-3 divide-y divide-border rounded-lg border border-border">
							{#each files as file, i (i)}
								<li class="flex items-center gap-3 px-3 py-2">
									<FileIcon class="size-4 shrink-0 text-muted-foreground" />
									<span class="min-w-0 flex-1 truncate text-[0.8125rem]">{file.name}</span>
									<span class="text-xs tabular-nums {file.size > data.maxFileBytes ? 'text-danger' : 'text-muted-foreground'}">{formatBytes(file.size)}</span>
									<button
										class="btn btn-ghost btn-icon btn-sm"
										disabled={busy}
										onclick={() => (files = files.filter((_, j) => j !== i))}
										aria-label="Remove {file.name}"><X /></button
									>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border bg-surface px-4 py-3 sm:px-5">
				<label class="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
					<Clock class="size-4" />Expires
					<select class="input h-8 w-auto py-0 text-[0.8125rem]" bind:value={expiry}>
						{#each EXPIRY_OPTIONS as o (o.value)}<option value={o.value}>{o.value === 'never' ? 'Never' : `in ${o.label}`}</option>{/each}
					</select>
				</label>
				<label class="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-muted-foreground select-none">
					<input type="checkbox" class="size-4 accent-[var(--primary)]" bind:checked={burn} />
					<Flame class="size-4 {burn ? 'text-warning' : ''}" />Delete after first open
				</label>
				<div class="flex-1"></div>
				{#if busy && tab === 'file'}
					<div class="flex items-center gap-2">
						<div class="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
							<div class="h-full bg-primary transition-[width]" style="width:{Math.round(progress * 100)}%"></div>
						</div>
						<span class="w-9 text-xs text-muted-foreground tabular-nums">{Math.round(progress * 100)}%</span>
						<button class="btn btn-ghost btn-sm" onclick={() => abort?.()}>Cancel</button>
					</div>
				{/if}
				<button class="btn btn-primary" disabled={!canSubmit} onclick={submit}>
					{#if busy}<LoaderCircle class="animate-spin" />{:else}<Send />{/if}Share
					<span class="kbd ml-1 hidden bg-transparent sm:inline-flex">{mod}↵</span>
				</button>
			</div>
		</div>
	{/if}

	<section class="mt-10">
		<h2 class="mb-3 text-sm font-semibold tracking-tight">Recent</h2>
		{#if data.items.length === 0}
			<div class="card dot-grid px-4 py-10 text-center text-[0.8125rem] text-muted-foreground">Nothing shared yet.</div>
		{:else}
			<div class="card divide-y divide-border overflow-hidden">
				{#each data.items as item (item.code)}
					<div class="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface">
						<div class="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
							{#if item.kind === 'paste'}<FileText />{:else}<FileIcon />{/if}
						</div>
						<a href="/{item.kind}/{item.code}" class="min-w-0 flex-1">
							<p class="truncate text-[0.8125rem] font-medium">{item.name || 'Untitled paste'}</p>
							<p class="truncate text-xs text-muted-foreground">
								<span class="font-mono">{groupCode(item.code)}</span> · {formatBytes(item.size)} · {relativeTime(item.createdAt)}
								{#if item.views}· {item.views} {item.views === 1 ? 'view' : 'views'}{/if}
							</p>
						</a>
						{#if item.burn}<span class="badge badge-warning" title="Deleted after first open"><Flame />Once</span>{/if}
						<span class="hidden w-28 text-right text-xs text-muted-foreground sm:block">
							{item.expiresAt ? `expires ${relativeTime(item.expiresAt)}` : 'never expires'}
						</span>
						<button
							class="btn btn-ghost btn-icon btn-sm"
							onclick={() => copy(`${page.data.origin}/${item.kind}/${item.code}`, 'Link copied')}
							aria-label="Copy link"
							title="Copy link"><Copy /></button
						>
						<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" onclick={() => remove(item)} aria-label="Delete" title="Delete"><Trash2 /></button>
					</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}
