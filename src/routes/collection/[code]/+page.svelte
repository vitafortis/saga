<script lang="ts">
	import {
		Check,
		Copy,
		Download,
		File as FileIcon,
		FilePlus,
		FileText,
		FolderOpen,
		HardDriveDownload,
		Link,
		LoaderCircle,
		Lock,
		Pencil,
		QrCode,
		Terminal,
		Trash2,
		Upload,
		X
	} from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import PasswordFields, { passwordProblem } from '#lib/components/PasswordFields.svelte';
	import Qr from '#lib/components/Qr.svelte';
	import { api, errorMessage, readBytes, uploadFile } from '#lib/client/api.ts';
	import { droppedFiles, folderMessage } from '#lib/client/files.ts';
	import { copy, toast } from '#lib/client/state.svelte.ts';
	import { encrypt, encryptText } from '#lib/crypto.ts';
	import { formatBytes, groupCode, relativeTime } from '#lib/format.ts';
	import type { Item } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const c = $derived(data.collection);
	const url = $derived(`${page.data.origin}/collection/${c.code}`);
	const authed = $derived(page.data.authed);

	let showQr = $state(false);

	// Install command: run, preview, or as root (for /etc and other system paths).
	let mode = $state<'run' | 'dry' | 'root'>('run');
	// Through /api/v1 with an API key, so it works on machines outside the SSO (see Settings).
	const script = $derived(`${page.data.origin}/api/v1/collections/${c.code}/install.sh`);
	const command = $derived(`sagacp --install ${c.code}${mode === 'dry' ? ' --dry-run' : mode === 'root' ? ' --root' : ''}`);
	const curlCommand = $derived(
		`curl -fsSL -H "Authorization: Bearer $(cat ~/.config/saga/token)" ${script} | ${mode === 'dry' ? 'sh -s -- --dry-run' : mode === 'root' ? 'sudo sh' : 'sh'}`
	);
	const placed = $derived(data.items.filter((i) => i.path));
	const needsRoot = $derived(placed.some((i) => !i.path!.startsWith('~/')));
	const hasHome = $derived(placed.some((i) => i.path!.startsWith('~/')));
	const placedEncrypted = $derived(placed.some((i) => i.encrypted));

	// New files (uploads and text) can be encrypted here first; install.sh asks for the password.
	let locked = $state(false);
	let password = $state('');
	let confirmPw = $state('');
	const lockProblem = $derived(locked ? passwordProblem(password, confirmPw) : null);

	let savingNas = $state(false);
	async function saveToNas() {
		savingNas = true;
		try {
			const { path } = await api.post<{ path: string }>(`/api/collections/${c.code}/save`);
			toast('success', 'Saved to NAS', path);
		} catch (err) {
			toast('error', 'Couldn’t save', errorMessage(err));
		}
		savingNas = false;
	}

	// Name and description, edited in place.
	let editingInfo = $state(false);
	let info = $state({ name: '', description: '' });
	function editInfo() {
		info = { name: c.name, description: c.description };
		editingInfo = true;
	}
	async function saveInfo(e: SubmitEvent) {
		e.preventDefault();
		try {
			await api.patch(`/api/collections/${c.code}`, info);
			editingInfo = false;
			invalidateAll();
		} catch (err) {
			toast('error', 'Couldn’t save', errorMessage(err));
		}
	}

	async function removeCollection() {
		if (!confirm(`Delete “${c.name}” and its ${data.items.length} ${data.items.length === 1 ? 'file' : 'files'}?`)) return;
		try {
			await api.del(`/api/collections/${c.code}`);
			toast('success', 'Collection deleted');
			goto('/', { invalidateAll: true });
		} catch (err) {
			toast('error', 'Couldn’t delete', errorMessage(err));
		}
	}

	// The editor: a new text file, or an existing item (text gets its content; files only name/path/mode).
	type Draft = { code: string | null; kind: 'paste' | 'file'; name: string; path: string; mode: string; content: string; encrypted: boolean };
	let draft = $state<Draft | null>(null);
	let saving = $state(false);

	function newText() {
		draft = { code: null, kind: 'paste', name: '', path: '', mode: '', content: '', encrypted: false };
	}

	async function edit(item: Item) {
		const content = item.kind === 'paste' && !item.encrypted ? await fetch(`/paste/${item.code}/raw`).then((r) => r.text()) : '';
		draft = { code: item.code, kind: item.kind, name: item.name, path: item.path ?? '', mode: item.mode ?? '', content, encrypted: item.encrypted };
	}

	async function saveDraft(e: SubmitEvent) {
		e.preventDefault();
		if (!draft) return;
		if (!draft.code && lockProblem) return toast('error', 'Check the password', lockProblem);
		saving = true;
		try {
			const body = { name: draft.name, path: draft.path, mode: draft.mode, ...(draft.kind === 'paste' && !draft.encrypted ? { content: draft.content } : {}) };
			if (draft.code) await api.patch(`/api/items/${draft.code}`, body);
			else if (locked) await api.post(`/api/collections/${c.code}/items`, { ...body, content: await encryptText(draft.content, password), encrypted: true });
			else await api.post(`/api/collections/${c.code}/items`, body);
			draft = null;
			invalidateAll();
		} catch (err) {
			toast('error', 'Couldn’t save', errorMessage(err));
		}
		saving = false;
	}

	async function removeItem(item: Item) {
		try {
			await api.del(`/api/items/${item.code}`);
			invalidateAll();
		} catch (err) {
			toast('error', 'Couldn’t remove', errorMessage(err));
		}
	}

	// Uploads: from the button or dropped anywhere on the page.
	let uploading = $state<{ name: string; progress: number } | null>(null);
	let dragging = $state(0);
	async function upload(list: FileList | File[] | null | undefined) {
		if (!list?.length || !authed) return;
		if (lockProblem) return toast('error', 'Check the password', lockProblem);
		try {
			for (const file of Array.from(list)) {
				uploading = { name: file.name, progress: 0 };
				const q = new URLSearchParams({ name: file.name, encrypted: locked ? '1' : '0' });
				const body = locked ? new File([await encrypt(await readBytes(file), password)], file.name, { type: file.type }) : file;
				await uploadFile(body, `/api/collections/${c.code}/items?${q}`, (f) => uploading && (uploading.progress = f)).done;
			}
			toast('success', list.length === 1 ? 'File added' : `${list.length} files added`, 'Set a target path to include it in the install script.');
		} catch (err) {
			toast('error', 'Upload failed', errorMessage(err));
		}
		uploading = null;
		invalidateAll();
	}
	const isFileDrag = (e: DragEvent) => !!authed && !!e.dataTransfer?.types.includes('Files');
</script>

<svelte:head><title>{c.name} · Saga</title></svelte:head>

<svelte:window
	ondragenter={(e) => isFileDrag(e) && dragging++}
	ondragleave={(e) => isFileDrag(e) && (dragging = Math.max(0, dragging - 1))}
	ondragover={(e) => isFileDrag(e) && e.preventDefault()}
	ondrop={(e) => {
		if (!isFileDrag(e)) return;
		e.preventDefault();
		dragging = 0;
		const { files, folders } = droppedFiles(e.dataTransfer);
		if (folders.length) toast('error', 'Can’t add a folder', folderMessage(folders));
		upload(files);
	}}
/>

{#if dragging}
	<div class="pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-primary-soft backdrop-blur-sm">
		<p class="flex items-center gap-2 text-sm font-medium text-primary"><Upload class="size-4" />Drop to add to {c.name}</p>
	</div>
{/if}

<!-- Header -->
<div class="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start">
	<div class="flex min-w-0 flex-1 items-start gap-3">
		<div class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><FolderOpen class="size-5" /></div>
		{#if editingInfo}
			<form class="min-w-0 flex-1" onsubmit={saveInfo}>
				<!-- svelte-ignore a11y_autofocus -->
				<input class="input font-semibold" bind:value={info.name} placeholder="Name" maxlength="200" autofocus />
				<textarea class="input mt-2 h-auto min-h-16 py-2 text-[0.8125rem]" bind:value={info.description} placeholder="What it's for (optional)" maxlength="2000"></textarea>
				<div class="mt-2 flex gap-2">
					<button class="btn btn-primary btn-sm"><Check />Save</button>
					<button type="button" class="btn btn-ghost btn-sm" onclick={() => (editingInfo = false)}>Cancel</button>
				</div>
			</form>
		{:else}
			<div class="min-w-0">
				<h1 class="flex items-center gap-2 text-lg font-semibold tracking-tight">
					<span class="truncate">{c.name}</span>
					{#if authed}
						<button class="btn btn-ghost btn-icon btn-sm shrink-0" onclick={editInfo} aria-label="Rename" title="Rename"><Pencil /></button>
					{/if}
				</h1>
				{#if c.description}<p class="mt-0.5 text-[0.8125rem] whitespace-pre-line text-muted-foreground">{c.description}</p>{/if}
				<p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
					<button class="font-mono tracking-wider hover:text-foreground" onclick={() => copy(c.code, 'Code copied')} title="Copy code">{groupCode(c.code)}</button>
					<span>·</span><span>{c.count} {c.count === 1 ? 'file' : 'files'}</span>
					<span>·</span><span>{formatBytes(c.size)}</span>
					<span>·</span><span>updated {relativeTime(c.updatedAt)}</span>
				</p>
			</div>
		{/if}
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<a class="btn btn-secondary btn-sm" href="/collection/{c.code}/archive" download><Download />.tar.gz</a>
		{#if page.data.backups && authed}
			<button class="btn btn-secondary btn-sm" onclick={saveToNas} disabled={savingNas} title="Copy the files to the NAS, at their target paths">
				{#if savingNas}<LoaderCircle class="animate-spin" />{:else}<HardDriveDownload />{/if}Save to NAS
			</button>
		{/if}
		<button class="btn btn-secondary btn-sm" onclick={() => copy(url, 'Link copied')}><Link />Link</button>
		<button class="btn btn-secondary btn-icon btn-sm {showQr ? 'bg-accent' : ''}" onclick={() => (showQr = !showQr)} aria-label="QR code" title="QR code"><QrCode /></button>
		{#if authed}
			<button class="btn btn-danger-outline btn-icon btn-sm" onclick={removeCollection} aria-label="Delete collection" title="Delete collection"><Trash2 /></button>
		{/if}
	</div>
</div>

{#if showQr}
	<div transition:slide={{ duration: 160 }} class="mb-4">
		<div class="card flex items-center gap-5 p-4">
			<Qr value={url} size={132} />
			<div class="min-w-0 text-[0.8125rem]">
				<p class="font-medium">Open on another device</p>
				<p class="mt-1 text-muted-foreground">Scan this, or type <span class="font-mono text-foreground">{groupCode(c.code)}</span> into Saga.</p>
			</div>
		</div>
	</div>
{/if}

<!-- Install -->
<div class="card mb-5 overflow-hidden">
	<div class="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
		<p class="flex items-center gap-2 text-[0.8125rem] font-medium"><Terminal class="size-4 text-primary" />Set up a machine</p>
		<div class="ml-auto flex rounded-lg border border-border bg-surface p-0.5">
			{#each [{ id: 'run', label: 'Install' }, { id: 'dry', label: 'Preview' }, { id: 'root', label: 'As root' }] as m (m.id)}
				<button
					class="h-6 rounded-md px-2.5 text-xs font-medium transition-colors {mode === m.id ? 'bg-card text-foreground shadow-surface' : 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (mode = m.id as typeof mode)}
					aria-pressed={mode === m.id}>{m.label}</button
				>
			{/each}
		</div>
	</div>
	<div class="flex items-center gap-2 bg-surface p-3">
		<code class="min-w-0 flex-1 overflow-x-auto rounded-md px-1 py-1 font-mono text-xs whitespace-nowrap">{command}</code>
		<button class="btn btn-primary btn-sm shrink-0" onclick={() => copy(command, 'Command copied')}><Copy />Copy</button>
	</div>
	<div class="flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
		<span class="shrink-0 text-[0.6875rem] text-muted-foreground">No sagacp?</span>
		<code class="min-w-0 flex-1 overflow-x-auto font-mono text-[0.6875rem] whitespace-nowrap text-muted-foreground">{curlCommand}</code>
		<button class="btn btn-ghost btn-icon btn-sm shrink-0" onclick={() => copy(curlCommand, 'Command copied')} aria-label="Copy curl command"><Copy /></button>
	</div>
	<p class="border-t border-border px-4 py-2 text-[0.6875rem] text-muted-foreground">
		{#if placed.length === 0}
			Nothing to install yet: give files a target path, like <span class="font-mono">~/.bashrc</span> or <span class="font-mono">/etc/hosts</span>.
		{:else}
			Writes {placed.length} {placed.length === 1 ? 'file' : 'files'}{data.items.length > placed.length ? ` (${data.items.length - placed.length} without a path are skipped)` : ''}. Changed files are kept as
			<span class="font-mono">.saga-bak</span>.
			{#if needsRoot}System paths need <b class="font-medium text-foreground">As root</b>{#if hasHome}, where <span class="font-mono">~</span> is root's home{/if}.{/if}
			{#if placedEncrypted}Asks for the password of encrypted files (needs openssl).{/if}
			Needs an API key (Settings).
			<a class="text-primary hover:underline" href="/collection/{c.code}/install.sh" target="_blank" rel="noreferrer">View script</a>
		{/if}
	</p>
</div>

<!-- Editor -->
{#if draft}
	<form transition:slide={{ duration: 160 }} class="card mb-5 overflow-hidden" onsubmit={saveDraft}>
		<div class="flex items-center justify-between border-b border-border px-4 py-2.5">
			<p class="text-[0.8125rem] font-medium">{draft.code ? `Edit ${draft.name}` : locked ? 'New encrypted text file' : 'New text file'}</p>
			<button type="button" class="btn btn-ghost btn-icon btn-sm" onclick={() => (draft = null)} aria-label="Close"><X /></button>
		</div>
		<div class="grid gap-3 p-4 sm:grid-cols-[1fr_2fr_6rem]">
			<div>
				<label class="label" for="d-name">Name</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input id="d-name" class="input" bind:value={draft.name} placeholder="config.yaml" required autofocus />
			</div>
			<div>
				<label class="label" for="d-path">Target path</label>
				<input id="d-path" class="input font-mono text-[0.8125rem]" bind:value={draft.path} placeholder="~/.config/app/config.yaml (optional)" />
			</div>
			<div>
				<label class="label" for="d-mode">Mode</label>
				<input id="d-mode" class="input font-mono text-[0.8125rem]" bind:value={draft.mode} placeholder="644" maxlength="4" inputmode="numeric" />
			</div>
			{#if draft.encrypted}
				<p class="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-3">
					<Lock class="size-3.5 text-primary" />Encrypted: Saga can't show or edit the contents. To change them, remove it and add it again.
				</p>
			{:else if draft.kind === 'paste'}
				<textarea
					class="input h-auto min-h-64 resize-y py-2.5 font-mono text-[0.8125rem] leading-relaxed sm:col-span-3"
					bind:value={draft.content}
					spellcheck="false"
					placeholder="File contents"
				></textarea>
			{/if}
		</div>
		<div class="flex justify-end gap-2 border-t border-border bg-surface px-4 py-3">
			<button type="button" class="btn btn-ghost" onclick={() => (draft = null)}>Cancel</button>
			<button class="btn btn-primary" disabled={saving}>{#if saving}<LoaderCircle class="animate-spin" />{/if}Save</button>
		</div>
	</form>
{/if}

<!-- Files -->
<div class="mb-3 flex items-center gap-2">
	<h2 class="text-sm font-semibold tracking-tight">Files</h2>
	{#if authed}
		<div class="ml-auto flex gap-2">
			<label class="mr-1 flex cursor-pointer items-center gap-2 text-[0.8125rem] text-muted-foreground select-none" title="Encrypt new files and uploads with a password">
				<input type="checkbox" class="size-4 accent-[var(--primary)]" bind:checked={locked} />
				<Lock class="size-4 {locked ? 'text-primary' : ''}" />Encrypt
			</label>
			<button class="btn btn-secondary btn-sm" onclick={newText}><FilePlus />New text file</button>
			<label class="btn btn-primary btn-sm cursor-pointer">
				{#if uploading}<LoaderCircle class="animate-spin" />{Math.round(uploading.progress * 100)}%{:else}<Upload />Upload{/if}
				<input type="file" multiple class="sr-only" disabled={!!uploading} onchange={(e) => upload(e.currentTarget.files)} />
			</label>
		</div>
	{/if}
</div>

{#if locked}
	<div transition:slide={{ duration: 160 }} class="card mb-3 p-3"><PasswordFields bind:password bind:confirm={confirmPw} /></div>
{/if}

{#if data.items.length === 0}
	<div class="card dot-grid px-4 py-12 text-center text-[0.8125rem] text-muted-foreground">
		No files yet.{#if authed} Add a text file, upload, or drop files here.{/if}
	</div>
{:else}
	<div class="card divide-y divide-border overflow-hidden">
		{#each data.items as item (item.code)}
			<div class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface">
				<div class="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
					{#if item.kind === 'paste'}<FileText />{:else}<FileIcon />{/if}
				</div>
				<a href="/{item.kind}/{item.code}" class="min-w-0 flex-1">
					<p class="truncate text-[0.8125rem] font-medium">{item.name}</p>
					<p class="truncate font-mono text-xs {item.path ? 'text-muted-foreground' : 'text-muted-foreground/60 italic'}">{item.path ?? 'no target path'}</p>
				</a>
				{#if item.encrypted}<span class="badge badge-primary" title="Encrypted"><Lock /></span>{/if}
				{#if item.mode}<span class="badge font-mono">{item.mode}</span>{/if}
				<span class="hidden w-16 text-right text-xs text-muted-foreground tabular-nums sm:block">{formatBytes(item.size)}</span>
				{#if authed}
					<button class="btn btn-ghost btn-icon btn-sm" onclick={() => edit(item)} aria-label="Edit {item.name}" title="Edit"><Pencil /></button>
				{/if}
				<a
					class="btn btn-ghost btn-icon btn-sm"
					href={item.kind === 'paste' ? `/paste/${item.code}/raw?download` : `/file/${item.code}/download`}
					download
					aria-label="Download {item.name}"
					title="Download"><Download /></a
				>
				{#if authed}
					<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" onclick={() => removeItem(item)} aria-label="Remove {item.name}" title="Remove"><Trash2 /></button>
				{/if}
			</div>
		{/each}
	</div>
{/if}
