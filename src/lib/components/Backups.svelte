<script lang="ts">
	import { Archive, DatabaseBackup, LoaderCircle, TriangleAlert } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { toast } from '#lib/client/state.svelte.ts';
	import { formatBytes, relativeTime } from '#lib/format.ts';
	import type { BackupStatus } from '#lib/types.ts';

	let { status }: { status: BackupStatus } = $props();
	let running = $state(false);

	async function backUp() {
		running = true;
		try {
			await api.post('/api/backups');
			toast('success', 'Backup written');
			invalidateAll();
		} catch (err) {
			toast('error', 'Backup failed', errorMessage(err));
		}
		running = false;
	}
</script>

<section class="mt-8">
	<div class="mb-3 flex items-center gap-3">
		<h2 class="text-sm font-semibold tracking-tight">Backups</h2>
		{#if status.enabled}
			<button class="btn btn-secondary btn-sm ml-auto" onclick={backUp} disabled={running || status.running}>
				{#if running || status.running}<LoaderCircle class="animate-spin" />{:else}<DatabaseBackup />{/if}Back up now
			</button>
		{/if}
	</div>

	{#if !status.enabled}
		<div class="card px-4 py-5 text-[0.8125rem] text-muted-foreground">
			<p class="font-medium text-foreground">Off</p>
			<p class="mt-1 text-xs leading-relaxed">
				Mount a NAS share into the container (NFS or SMB; examples in <span class="font-mono">compose.yaml</span>) and set
				<span class="font-mono">SAGA_BACKUP_DIR</span> to it. Saga then takes full snapshots on a schedule, and items and collections get a
				<b class="font-medium text-foreground">Save to NAS</b> button.
			</p>
		</div>
	{:else}
		<p class="mb-3 text-xs text-muted-foreground">
			Full snapshots (database, files and session key) in <span class="font-mono">{status.dir}/snapshots</span>,
			{status.everyHours ? `every ${status.everyHours === 24 ? 'day' : `${status.everyHours} hours`}` : 'only when you ask'}, keeping the last {status.keep}.
			Saved copies go in <span class="font-mono">{status.dir}/saved</span>. Encrypted items stay encrypted.
		</p>
		{#if status.lastError}
			<p class="mb-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
				<TriangleAlert class="mt-px size-3.5 shrink-0" />Last backup failed: {status.lastError}
			</p>
		{/if}
		{#if status.snapshots.length === 0}
			<div class="card px-4 py-6 text-center text-[0.8125rem] text-muted-foreground">No snapshots yet.</div>
		{:else}
			<div class="card divide-y divide-border overflow-hidden">
				{#each status.snapshots as s (s.name)}
					<div class="flex items-center gap-3 px-4 py-2.5">
						<Archive class="size-4 shrink-0 text-muted-foreground" />
						<p class="min-w-0 flex-1 truncate font-mono text-xs">{s.name}</p>
						<span class="text-xs text-muted-foreground tabular-nums">{formatBytes(s.size)}</span>
						<span class="w-24 text-right text-xs text-muted-foreground" title={new Date(s.createdAt).toLocaleString()}>{relativeTime(s.createdAt)}</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</section>
