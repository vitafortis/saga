<script lang="ts">
	import { Copy, KeyRound, Plus, ShieldCheck, Trash2, X } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { copy, toast } from '#lib/client/state.svelte.ts';
	import { relativeTime } from '#lib/format.ts';
	import type { ApiKey } from '#lib/types.ts';

	let { keys }: { keys: ApiKey[] } = $props();

	let naming = $state(false);
	let name = $state('');
	let created = $state<{ name: string; secret: string } | null>(null);

	const origin = $derived(page.data.origin as string);
	// Saves the key, then installs sagacp with it. Shown once, right after the key is made.
	const setup = $derived(
		created &&
			`mkdir -p ~/.config/saga ~/.local/bin && printf '%s\\n' '${created.secret}' > ~/.config/saga/token && chmod 600 ~/.config/saga/token && curl -fsSL -H "Authorization: Bearer ${created.secret}" ${origin}/api/v1/sagacp -o ~/.local/bin/sagacp && chmod +x ~/.local/bin/sagacp`
	);

	async function create(e: SubmitEvent) {
		e.preventDefault();
		try {
			const res = await api.post<{ key: ApiKey; secret: string }>('/api/keys', { name });
			created = { name: res.key.name, secret: res.secret };
			naming = false;
			name = '';
			invalidateAll();
		} catch (err) {
			toast('error', 'Couldn’t create key', errorMessage(err));
		}
	}

	async function revoke(key: ApiKey) {
		if (!confirm(`Revoke “${key.name}”? Anything using it stops working.`)) return;
		try {
			await api.del(`/api/keys/${key.id}`);
			invalidateAll();
		} catch (err) {
			toast('error', 'Couldn’t revoke', errorMessage(err));
		}
	}
</script>

<section class="mt-8">
	<div class="mb-3 flex items-center gap-3">
		<h2 class="text-sm font-semibold tracking-tight">API keys</h2>
		{#if !naming}<button class="btn btn-secondary btn-sm ml-auto" onclick={() => (naming = true)}><Plus />New key</button>{/if}
	</div>
	<p class="mb-3 text-xs text-muted-foreground">
		For <span class="font-mono">sagacp</span> and scripts. They work only on <span class="font-mono">/api/v1/</span>, and that's all they open.
	</p>

	{#if naming}
		<form class="card mb-3 flex items-center gap-2 p-2 pl-3" onsubmit={create} transition:slide={{ duration: 140 }}>
			<KeyRound class="size-4 shrink-0 text-primary" />
			<!-- svelte-ignore a11y_autofocus -->
			<input class="input h-8 flex-1 border-0 bg-transparent px-1 shadow-none focus:ring-0" placeholder="Where it's used, e.g. laptop" bind:value={name} maxlength="100" autofocus />
			<button class="btn btn-primary btn-sm">Create</button>
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => (naming = false)}>Cancel</button>
		</form>
	{/if}

	{#if created}
		<div class="card mb-3 overflow-hidden border-success/40" transition:slide={{ duration: 160 }}>
			<div class="flex items-center gap-2 border-b border-border px-4 py-2.5">
				<ShieldCheck class="size-4 text-success" />
				<p class="text-[0.8125rem] font-medium">“{created.name}” created. Copy it now: it won't be shown again.</p>
				<button class="btn btn-ghost btn-icon btn-sm ml-auto" onclick={() => (created = null)} aria-label="Dismiss"><X /></button>
			</div>
			<div class="space-y-3 p-4">
				<div class="flex items-center gap-2 rounded-lg border border-border bg-surface p-1 pl-3">
					<code class="min-w-0 flex-1 truncate font-mono text-xs">{created.secret}</code>
					<button class="btn btn-secondary btn-sm" onclick={() => copy(created!.secret, 'Key copied')}><Copy />Key</button>
				</div>
				<div>
					<p class="label">Set up sagacp on a machine (saves the key to <span class="font-mono">~/.config/saga/token</span>)</p>
					<div class="flex items-start gap-2 rounded-lg border border-border bg-surface p-1 pl-3">
						<code class="min-w-0 flex-1 py-1 font-mono text-[0.6875rem] break-all">{setup}</code>
						<button class="btn btn-primary btn-sm shrink-0" onclick={() => copy(setup!, 'Setup command copied')}><Copy />Copy</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if keys.length === 0}
		<div class="card px-4 py-6 text-center text-[0.8125rem] text-muted-foreground">No keys yet.</div>
	{:else}
		<div class="card divide-y divide-border overflow-hidden">
			{#each keys as key (key.id)}
				<div class="flex items-center gap-3 px-4 py-2.5">
					<KeyRound class="size-4 shrink-0 text-muted-foreground" />
					<div class="min-w-0 flex-1">
						<p class="truncate text-[0.8125rem] font-medium">{key.name}</p>
						<p class="truncate text-xs text-muted-foreground">
							<span class="font-mono">{key.prefix}…</span> · created {relativeTime(key.createdAt)} · {key.lastUsedAt ? `used ${relativeTime(key.lastUsedAt)}` : 'never used'}
						</p>
					</div>
					<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" onclick={() => revoke(key)} aria-label="Revoke {key.name}" title="Revoke"><Trash2 /></button>
				</div>
			{/each}
		</div>
	{/if}

	<p class="mt-3 rounded-lg bg-surface px-3 py-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
		<b class="font-medium text-foreground">Behind Pangolin (or other SSO):</b> add a resource rule that bypasses auth for the path
		<span class="font-mono text-foreground">/api/v1/*</span>, and nothing else. Saga checks the key on every request there.
	</p>
</section>
