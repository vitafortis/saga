<script lang="ts" module>
	/** Why the password can't be used yet, or null when it can. */
	export function passwordProblem(password: string, confirm: string): string | null {
		if (password.length < 8) return 'Use at least 8 characters';
		if (password !== confirm) return 'The passwords don’t match';
		return null;
	}
</script>

<script lang="ts">
	import { KeyRound } from '@lucide/svelte';

	/** Password and confirmation for encrypting, with what it means to lose it. */
	let { password = $bindable(''), confirm = $bindable(''), disabled = false }: { password?: string; confirm?: string; disabled?: boolean } = $props();
	const problem = $derived(confirm || password.length >= 8 ? passwordProblem(password, confirm) : null);
</script>

<div class="flex flex-col gap-2 sm:flex-row sm:items-start">
	<div class="relative flex-1">
		<KeyRound class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
		<!-- svelte-ignore a11y_autofocus -->
		<input class="input h-8 pl-8 text-[0.8125rem]" type="password" autocomplete="new-password" placeholder="Password" bind:value={password} {disabled} autofocus />
	</div>
	<input class="input h-8 flex-1 text-[0.8125rem]" type="password" autocomplete="new-password" placeholder="Confirm password" bind:value={confirm} {disabled} />
</div>
<p class="mt-1.5 text-[0.6875rem] {problem ? 'text-danger' : 'text-muted-foreground'}">
	{#if problem}
		{problem}.
	{:else}
		Encrypted on this device; Saga never sees the password. If it's lost, so is the file.
	{/if}
</p>
