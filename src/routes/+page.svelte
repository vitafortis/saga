<script lang="ts">
	import {
		Clock,
		Infinity as Forever,
		Copy,
		Download,
		File as FileIcon,
		FileArchive,
		FileAudio,
		FileCode,
		FileImage,
		FileText,
		FileVideo,
		Flame,
		FolderOpen,
		FolderPlus,
		LoaderCircle,
		Lock,
		LogIn,
		Search,
		Send,
		Trash2,
		Upload,
		X
	} from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import CodeJump from '#lib/components/CodeJump.svelte';
	import PasswordFields, { passwordProblem } from '#lib/components/PasswordFields.svelte';
	import ShareResult from '#lib/components/ShareResult.svelte';
	import { api, errorMessage, readBytes, uploadFile } from '#lib/client/api.ts';
	import { droppedFiles, folderMessage } from '#lib/client/files.ts';
	import { copy, toast } from '#lib/client/state.svelte.ts';
	import { encrypt, encryptText } from '#lib/crypto.ts';
	import { formatBytes, groupCode, relativeTime } from '#lib/format.ts';
	import { canPreview, mediaKind } from '#lib/media.ts';
	import { EXPIRY_OPTIONS, type Item } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Shared = { item: Item; url: string };

	let tab = $state<'text' | 'file'>('text');
	let title = $state('');
	let content = $state('');
	let files = $state<File[]>([]);
	// Start from the saved defaults (Settings); later changes to them don't reset a draft.
	let expiry = $state<string>(untrack(() => data.settings.defaultExpiry));
	let burn = $state(untrack(() => data.settings.defaultBurn));
	// End-to-end: encrypted here before upload (see crypto.ts).
	let locked = $state(false);
	let password = $state('');
	let confirm = $state('');
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

	const canSubmit = $derived(
		!busy && (tab === 'text' ? content.trim() !== '' : files.length > 0) && (!locked || !passwordProblem(password, confirm))
	);
	const tooBig = $derived(files.filter((f) => f.size > data.maxFileBytes));

	function reset() {
		results = [];
		title = '';
		content = '';
		files = [];
		progress = 0;
		expiry = data.settings.defaultExpiry;
		burn = data.settings.defaultBurn;
		locked = false;
		password = confirm = '';
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
				const text = locked ? await encryptText(content, password) : content;
				results = [await api.post<Shared>('/api/pastes', { content: text, title, expiry, burn, encrypted: locked })];
			} else {
				if (tooBig.length) throw new Error(`${tooBig[0].name} is over ${formatBytes(data.maxFileBytes)}`);
				const out: Shared[] = [];
				const total = files.reduce((n, f) => n + f.size, 0) || 1;
				let sent = 0;
				for (const file of files) {
					const q = new URLSearchParams({ name: file.name, expiry, burn: burn ? '1' : '0', encrypted: locked ? '1' : '0' });
					// Held in memory to encrypt: fine for keys and documents, slow for huge videos.
					const body = locked ? new File([await encrypt(await readBytes(file), password)], file.name, { type: file.type }) : file;
					const up = uploadFile<Shared>(body, `/api/files?${q}`, (f) => (progress = (sent + f * file.size) / total));
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

	// New collection: just a name here; files are added on its page.
	let naming = $state(false);
	let collectionName = $state('');
	async function createCollection(e: SubmitEvent) {
		e.preventDefault();
		try {
			const { collection } = await api.post<{ collection: { code: string } }>('/api/collections', { name: collectionName });
			goto(`/collection/${collection.code}`);
		} catch (err) {
			toast('error', 'Couldn’t create', errorMessage(err));
		}
	}

	// The Recent index: filter by kind, then search name, code (spaces optional) and type.
	let kind = $state<'all' | 'paste' | 'file'>('all');
	let query = $state('');
	const counts = $derived({
		all: data.items.length,
		paste: data.items.filter((i) => i.kind === 'paste').length,
		file: data.items.filter((i) => i.kind === 'file').length
	});
	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const digits = q.replace(/\s/g, '');
		return data.items.filter(
			(i) =>
				(kind === 'all' || i.kind === kind) &&
				(!q || i.name.toLowerCase().includes(q) || i.mime.includes(q) || (/^\d+$/.test(digits) && i.code.includes(digits)))
		);
	});
	// Ticked rows in Recent, for downloading, keeping or deleting several at once.
	const selected = new SvelteSet<string>();
	const picked = $derived(data.items.filter((i) => selected.has(i.code)));
	const allShown = $derived(shown.length > 0 && shown.every((i) => selected.has(i.code)));
	$effect(() => {
		// Drop codes that have gone (deleted, expired) so the count stays honest.
		const live = new Set(data.items.map((i) => i.code));
		for (const code of untrack(() => [...selected])) if (!live.has(code)) selected.delete(code);
	});
	function toggleAll() {
		if (allShown) for (const i of shown) selected.delete(i.code);
		else for (const i of shown) selected.add(i.code);
	}
	const pickedBurn = $derived(picked.filter((i) => i.burn));
	const downloadUrl = $derived(`/download?codes=${picked.map((i) => i.code).join(',')}`);

	/** Clears the expiry: the item stays until it's deleted. */
	async function keep(items: Item[]) {
		const due = items.filter((i) => i.expiresAt);
		try {
			for (const i of due) await api.patch(`/api/items/${i.code}`, { expiry: 'never' });
			toast('success', due.length === 1 ? 'Kept' : `Kept ${due.length} items`, 'They won’t expire now.');
		} catch (err) {
			toast('error', 'Couldn’t keep', errorMessage(err));
		}
		invalidateAll();
	}

	async function removeMany(items: Item[]) {
		if (!window.confirm(`Delete ${items.length} ${items.length === 1 ? 'item' : 'items'}? This can’t be undone.`)) return;
		try {
			for (const i of items) await api.del(`/api/items/${i.code}`);
			selected.clear();
		} catch (err) {
			toast('error', 'Couldn’t delete', errorMessage(err));
		}
		invalidateAll();
	}

	const ICONS = { image: FileImage, video: FileVideo, audio: FileAudio, archive: FileArchive, text: FileCode, other: FileIcon };
	// Burn items can't be fetched without using them up, so they never get a thumbnail.
	const thumb = (i: Item) => i.kind === 'file' && !i.burn && !i.encrypted && mediaKind(i.mime) === 'image' && canPreview(i.mime);
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
		const { files, folders } = droppedFiles(e.dataTransfer);
		if (folders.length) toast('error', 'Can’t share a folder', folderMessage(folders));
		addFiles(files);
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

			{#if locked}
				<div class="border-t border-border bg-surface px-4 pt-3 sm:px-5"><PasswordFields bind:password bind:confirm disabled={busy} /></div>
			{/if}
			<div class="flex flex-wrap items-center gap-x-4 gap-y-3 bg-surface px-4 py-3 sm:px-5 {locked ? '' : 'border-t border-border'}">
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
				<label class="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-muted-foreground select-none">
					<input type="checkbox" class="size-4 accent-[var(--primary)]" bind:checked={locked} />
					<Lock class="size-4 {locked ? 'text-primary' : ''}" />Encrypt
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
		<div class="mb-3 flex items-center gap-3">
			<h2 class="text-sm font-semibold tracking-tight">Collections</h2>
			<span class="hidden text-xs text-muted-foreground sm:inline">Config files and the like, installed with one command</span>
			{#if !naming}
				<button class="btn btn-secondary btn-sm ml-auto" onclick={() => (naming = true)}><FolderPlus />New collection</button>
			{/if}
		</div>
		{#if naming}
			<form class="card mb-3 flex items-center gap-2 p-2 pl-3" onsubmit={createCollection}>
				<FolderPlus class="size-4 shrink-0 text-primary" />
				<!-- svelte-ignore a11y_autofocus -->
				<input class="input h-8 flex-1 border-0 bg-transparent px-1 shadow-none focus:ring-0" placeholder="Name, e.g. New Proxmox node" bind:value={collectionName} maxlength="200" autofocus />
				<button class="btn btn-primary btn-sm" disabled={!collectionName.trim()}>Create</button>
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => ((naming = false), (collectionName = ''))}>Cancel</button>
			</form>
		{/if}
		{#if data.collections.length}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{#each data.collections as col (col.code)}
					<a href="/collection/{col.code}" class="card group flex items-start gap-3 p-4 transition-colors hover:border-primary/40">
						<div class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><FolderOpen class="size-4" /></div>
						<div class="min-w-0">
							<p class="truncate text-[0.8125rem] font-medium group-hover:text-primary">{col.name}</p>
							<p class="mt-0.5 truncate text-xs text-muted-foreground">
								{col.count} {col.count === 1 ? 'file' : 'files'} · {formatBytes(col.size)} · <span class="font-mono">{groupCode(col.code)}</span>
							</p>
							{#if col.description}<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{col.description}</p>{/if}
						</div>
					</a>
				{/each}
			</div>
		{:else if !naming}
			<button class="card dot-grid w-full px-4 py-6 text-center text-[0.8125rem] text-muted-foreground hover:text-foreground" onclick={() => (naming = true)}>
				Group dotfiles, configs and keys for setting up a machine.
			</button>
		{/if}
	</section>

	<section class="mt-10">
		<div class="mb-3 flex flex-wrap items-center gap-3">
			<h2 class="text-sm font-semibold tracking-tight">Recent</h2>
			<div class="flex rounded-lg border border-border bg-surface p-0.5">
				{#each [{ id: 'all', label: 'All' }, { id: 'paste', label: 'Text' }, { id: 'file', label: 'Files' }] as f (f.id)}
					<button
						class="flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors {kind === f.id
							? 'bg-card text-foreground shadow-surface'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (kind = f.id as typeof kind)}
						aria-pressed={kind === f.id}
					>
						{f.label}<span class="tabular-nums opacity-60">{counts[f.id as typeof kind]}</span>
					</button>
				{/each}
			</div>
			<div class="relative ml-auto w-full sm:w-64">
				<Search class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<input class="input h-8 pl-8 text-[0.8125rem]" type="search" placeholder="Search names, codes, types" bind:value={query} />
			</div>
		</div>
		{#if data.items.length === 0}
			<div class="card dot-grid px-4 py-10 text-center text-[0.8125rem] text-muted-foreground">Nothing shared yet.</div>
		{:else if shown.length === 0}
			<div class="card px-4 py-10 text-center text-[0.8125rem] text-muted-foreground">
				Nothing matches.
				<button class="ml-1 text-primary hover:underline" onclick={() => ((query = ''), (kind = 'all'))}>Clear filters</button>
			</div>
		{:else}
			<div class="card divide-y divide-border overflow-hidden">
				<div class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 bg-surface px-4 py-2">
					<input type="checkbox" class="size-4 accent-[var(--primary)]" checked={allShown} onchange={toggleAll} aria-label="Select all shown" />
					{#if selected.size}
						<span class="text-xs font-medium">{selected.size} selected</span>
						<button class="text-xs text-muted-foreground hover:text-foreground" onclick={() => selected.clear()}>Clear</button>
						<div class="ml-auto flex flex-wrap items-center gap-2">
							{#if pickedBurn.length}
								<a class="btn btn-secondary btn-sm opacity-50" aria-disabled="true" title="Items deleted after first open can only be downloaded on their own. Untick them to download the rest." href={null}><Download />Download</a>
							{:else}
								<a class="btn btn-secondary btn-sm" href={downloadUrl} download title="Download as one .tar.gz"><Download />Download</a>
							{/if}
							{#if picked.some((i) => i.expiresAt)}
								<button class="btn btn-secondary btn-sm" onclick={() => keep(picked)} title="Cancel the expiry so they stay"><Forever />Keep</button>
							{/if}
							<button class="btn btn-danger-outline btn-sm" onclick={() => removeMany(picked)}><Trash2 />Delete</button>
						</div>
					{:else}
						<span class="text-xs text-muted-foreground">Select to download, keep or delete several at once</span>
					{/if}
				</div>
				{#each shown as item (item.code)}
					{@const Icon = item.kind === 'paste' ? FileText : ICONS[mediaKind(item.mime)]}
					<div class="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface {selected.has(item.code) ? 'bg-primary-soft/50' : ''}">
						<input
							type="checkbox"
							class="size-4 shrink-0 accent-[var(--primary)]"
							checked={selected.has(item.code)}
							onchange={(e) => (e.currentTarget.checked ? selected.add(item.code) : selected.delete(item.code))}
							aria-label="Select {item.name || 'Untitled paste'}"
						/>
						<a href="/{item.kind}/{item.code}" class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground [&_svg]:size-4" tabindex="-1">
							{#if thumb(item)}
								<img src="/file/{item.code}/download?inline" alt="" loading="lazy" class="size-full object-cover" />
							{:else}
								<Icon />
							{/if}
						</a>
						<a href="/{item.kind}/{item.code}" class="min-w-0 flex-1">
							<p class="truncate text-[0.8125rem] font-medium">{item.name || 'Untitled paste'}</p>
							<p class="truncate text-xs text-muted-foreground">
								<span class="font-mono">{groupCode(item.code)}</span> · {formatBytes(item.size)} · {relativeTime(item.createdAt)}
								{#if item.views}· {item.views} {item.views === 1 ? 'view' : 'views'}{/if}
							</p>
						</a>
						{#if item.encrypted}<span class="badge badge-primary" title="Encrypted with a password"><Lock />Encrypted</span>{/if}
						{#if item.burn}<span class="badge badge-warning" title="Deleted after first open"><Flame />Once</span>{/if}
						{#if item.expiresAt}
							<button
								class="hidden w-28 justify-end text-right text-xs text-muted-foreground hover:text-primary sm:flex"
								onclick={() => keep([item])}
								title="Keep: cancel the expiry so it stays"
							>
								<span class="group-hover:hidden">expires {relativeTime(item.expiresAt)}</span>
								<span class="hidden items-center gap-1 group-hover:inline-flex"><Forever class="size-3" />Keep</span>
							</button>
						{:else}
							<span class="hidden w-28 text-right text-xs text-muted-foreground sm:block">never expires</span>
						{/if}
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
			{#if shown.length !== data.items.length}
				<p class="mt-2 text-[0.6875rem] text-muted-foreground">Showing {shown.length} of {data.items.length}</p>
			{/if}
		{/if}
	</section>
{/if}
