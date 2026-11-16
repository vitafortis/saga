<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import Logo from '#lib/components/Logo.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		busy = true;
		try {
			await api.post('/api/auth/login', { password });
			await invalidateAll();
			goto(data.next);
		} catch (err) {
			error = errorMessage(err);
		}
		busy = false;
	}
</script>

<svelte:head><title>Sign in · Saga</title></svelte:head>

<div class="grid place-items-center pt-6 sm:pt-12">
	<div class="card relative w-full max-w-sm p-7 shadow-surface-lg">
		<div class="mb-6 flex flex-col items-center text-center">
			<Logo size={44} />
			<h1 class="mt-4 text-lg font-semibold tracking-tight">Sign in to share</h1>
			<p class="mt-1 text-[0.8125rem] text-muted-foreground">Opening a code doesn't need a password.</p>
		</div>
		<form onsubmit={submit}>
			<label class="label" for="pw">Password</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input id="pw" class="input" type="password" autocomplete="current-password" autofocus bind:value={password} required />
			<button class="btn btn-primary mt-5 h-9 w-full" disabled={busy}>
				{#if busy}<LoaderCircle class="animate-spin" />{/if}Sign in
			</button>
		</form>
		{#if error}<p class="mt-3 text-center text-xs text-danger">{error}</p>{/if}
	</div>
</div>
