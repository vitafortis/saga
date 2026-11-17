<script lang="ts">
	import { Check, Clock, Flame, HardDrive, LoaderCircle } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { toast } from '#lib/client/state.svelte.ts';
	import { formatBytes } from '#lib/format.ts';
	import { EXPIRY_OPTIONS, type Settings } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Edited copy of the saved settings; reset whenever the saved ones change.
	let form = $state<Settings>(untrack(() => ({ ...data.settings })));
	$effect(() => {
		form = { ...data.settings };
	});
	let saving = $state(false);
	const dirty = $derived(form.defaultExpiry !== data.settings.defaultExpiry || form.defaultBurn !== data.settings.defaultBurn);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		try {
			await api.put('/api/settings', form);
			await invalidateAll();
			toast('success', 'Settings saved');
		} catch (err) {
			toast('error', 'Couldn’t save', errorMessage(err));
		}
		saving = false;
	}
</script>

<svelte:head><title>Settings · Saga</title></svelte:head>

<div class="max-w-3xl">
<section class="mb-6">
	<h1 class="text-xl font-semibold tracking-tight">Settings</h1>
	<p class="mt-1 text-[0.8125rem] text-muted-foreground">Defaults for new items, on every device and for uploads from scripts.</p>
</section>

<form class="card overflow-hidden" onsubmit={save}>
	<div class="divide-y divide-border">
		<div class="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
			<div class="flex flex-1 gap-3">
				<div class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Clock class="size-4" /></div>
				<div>
					<label for="expiry" class="text-sm font-medium">Default expiry</label>
					<p class="mt-0.5 text-xs text-muted-foreground">Preselected when you share, and used when a script doesn't send <span class="font-mono">expiry</span>.</p>
				</div>
			</div>
			<select id="expiry" class="input w-full sm:w-44" bind:value={form.defaultExpiry}>
				{#each EXPIRY_OPTIONS as o (o.value)}<option value={o.value}>{o.value === 'never' ? 'Never expire' : o.label}</option>{/each}
			</select>
		</div>

		<label class="flex cursor-pointer flex-col gap-3 p-5 sm:flex-row sm:items-center">
			<div class="flex flex-1 gap-3">
				<div class="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning"><Flame class="size-4" /></div>
				<div>
					<p class="text-sm font-medium">Delete after first open</p>
					<p class="mt-0.5 text-xs text-muted-foreground">Turned on by default. Scripts can still opt out with <span class="font-mono">burn=0</span>.</p>
				</div>
			</div>
			<span class="relative inline-flex h-5 w-9 shrink-0 items-center self-start sm:self-center">
				<input type="checkbox" class="peer sr-only" bind:checked={form.defaultBurn} />
				<span class="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-primary/30"></span>
				<span class="absolute left-0.5 size-4 rounded-full bg-white shadow-surface transition-transform peer-checked:translate-x-4"></span>
			</span>
		</label>
	</div>
	<div class="flex items-center justify-end gap-3 border-t border-border bg-surface px-5 py-3">
		{#if !dirty && !saving}<span class="flex items-center gap-1 text-xs text-muted-foreground"><Check class="size-3.5" />Saved</span>{/if}
		<button class="btn btn-primary" disabled={!dirty || saving}>
			{#if saving}<LoaderCircle class="animate-spin" />{/if}Save
		</button>
	</div>
</form>

<section class="mt-8">
	<h2 class="mb-3 text-sm font-semibold tracking-tight">Storage</h2>
	<div class="card grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
		{#each [{ label: 'Items', value: String(data.usage.count) }, { label: 'Stored', value: formatBytes(data.usage.bytes) }, { label: 'Largest file', value: formatBytes(data.maxFileBytes) }, { label: 'Largest paste', value: formatBytes(data.maxPasteBytes) }] as s, i (s.label)}
			<div class="p-4 {i >= 2 ? 'border-t border-border sm:border-t-0' : ''}">
				<p class="text-xs text-muted-foreground">{s.label}</p>
				<p class="mt-1 text-lg font-semibold tracking-tight tabular-nums">{s.value}</p>
			</div>
		{/each}
	</div>
	<p class="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
		<HardDrive class="size-3" />Size limits are set with <span class="font-mono">SAGA_MAX_FILE_MB</span> and <span class="font-mono">SAGA_MAX_PASTE_MB</span>.
	</p>
</section>
</div>
