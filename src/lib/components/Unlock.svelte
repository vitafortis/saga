<script lang="ts">
	import { LoaderCircle, Lock, LockOpen } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { errorMessage } from '#lib/client/api.ts';
	import { toast } from '#lib/client/state.svelte.ts';
	import { WrongPasswordError } from '#lib/crypto.ts';

	/** Asks for the password of an encrypted item; `onunlock` throws (and the form stays) when it's wrong. */
	let { action = 'Unlock', onunlock, children }: { action?: string; onunlock: (password: string) => Promise<void>; children?: Snippet } = $props();
	let password = $state('');
	let busy = $state(false);
	let wrong = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		wrong = false;
		try {
			await onunlock(password);
		} catch (err) {
			if (err instanceof WrongPasswordError) wrong = true;
			else toast('error', 'Couldn’t open', errorMessage(err));
		}
		busy = false;
	}
</script>

<div class="card px-6 py-12 text-center">
	<div class="mx-auto grid size-12 place-items-center rounded-xl bg-primary-soft text-primary"><Lock class="size-6" /></div>
	<h2 class="mt-4 font-semibold tracking-tight">Encrypted</h2>
	<p class="mx-auto mt-1 max-w-sm text-[0.8125rem] text-muted-foreground">
		{#if children}{@render children()}{:else}Enter the password it was shared with. It's decrypted here, in your browser.{/if}
	</p>
	<form class="mx-auto mt-5 flex max-w-sm gap-2" onsubmit={submit}>
		<!-- svelte-ignore a11y_autofocus -->
		<input class="input flex-1" type="password" autocomplete="current-password" placeholder="Password" bind:value={password} autofocus aria-invalid={wrong} />
		<button class="btn btn-primary" disabled={!password || busy}>
			{#if busy}<LoaderCircle class="animate-spin" />{:else}<LockOpen />{/if}{action}
		</button>
	</form>
	{#if wrong}<p class="mt-2 text-xs text-danger">Wrong password.</p>{/if}
</div>
