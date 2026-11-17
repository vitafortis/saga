<script lang="ts">
	import { Copy, Download, Eye, FileCode, Flame, LoaderCircle } from '@lucide/svelte';
	import ItemHeader from '#lib/components/ItemHeader.svelte';
	import TextView from '#lib/components/TextView.svelte';
	import Unlock from '#lib/components/Unlock.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { saveBytes } from '#lib/client/files.ts';
	import { copy, toast } from '#lib/client/state.svelte.ts';
	import { decryptText } from '#lib/crypto.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let revealed = $state<string | null>(null);
	let opening = $state(false);
	// Encrypted: the server's text is ciphertext; what's shown is what the password unlocks.
	let plain = $state<string | null>(null);
	const content = $derived(data.item.encrypted ? plain : (data.content ?? revealed));
	const fileName = $derived(data.item.name ? (/\.\w{1,8}$/.test(data.item.name) ? data.item.name : `${data.item.name}.txt`) : `${data.item.code}.txt`);

	async function reveal() {
		opening = true;
		try {
			revealed = (await api.post<{ content: string }>(`/api/items/${data.item.code}/open`)).content;
		} catch (err) {
			toast('error', 'Couldn’t open', errorMessage(err));
		}
		opening = false;
	}

	// A burn paste is opened (and deleted) once; its ciphertext stays here so a mistyped password can be retried.
	async function unlock(password: string) {
		if (data.content === null && revealed === null) {
			try {
				revealed = (await api.post<{ content: string }>(`/api/items/${data.item.code}/open`)).content;
			} catch (err) {
				toast('error', 'Couldn’t open', errorMessage(err));
				return;
			}
		}
		plain = await decryptText(data.content ?? revealed ?? '', password);
	}

	// Revealed burn pastes are gone from the server, so download from what we have.
	const download = () => saveBytes(content ?? '', fileName, 'text/plain');
</script>

<svelte:head><title>{data.item.name || 'Paste'} · Saga</title></svelte:head>

<ItemHeader item={data.item} collection={data.collection}>
	{#snippet actions()}
		{#if content !== null}
			<button class="btn btn-primary btn-sm" onclick={() => copy(content ?? '', 'Text copied')}><Copy />Copy</button>
			{#if !data.item.burn && !data.item.encrypted}
				<a class="btn btn-secondary btn-sm" href="/paste/{data.item.code}/raw" target="_blank" rel="noreferrer"><FileCode />Raw</a>
			{/if}
			<button class="btn btn-secondary btn-icon btn-sm" onclick={download} aria-label="Download" title="Download"><Download /></button>
		{/if}
	{/snippet}
</ItemHeader>

{#if data.item.encrypted && plain === null}
	<Unlock action={data.item.burn && revealed === null ? 'Open and unlock' : 'Unlock'} onunlock={unlock}>
		{#if data.item.burn && revealed === null}
			It's deleted from the server when opened, but stays on this page, so you can retry the password.
		{:else if revealed !== null}
			Deleted from the server; it's only on this page now.
			<button class="text-primary hover:underline" onclick={() => saveBytes(revealed ?? '', `${fileName}.b64.enc`)}>Save the encrypted text</button> to try later.
		{:else}
			Enter the password it was shared with. It's decrypted here, in your browser.
		{/if}
	</Unlock>
{:else if content === null}
	<div class="card px-6 py-12 text-center">
		<div class="mx-auto grid size-12 place-items-center rounded-xl bg-warning/10 text-warning"><Flame class="size-6" /></div>
		<h2 class="mt-4 font-semibold tracking-tight">This paste can be read once</h2>
		<p class="mx-auto mt-1 max-w-sm text-[0.8125rem] text-muted-foreground">It's deleted as soon as you open it. Copy what you need before leaving the page.</p>
		<button class="btn btn-primary mt-5" onclick={reveal} disabled={opening}>
			{#if opening}<LoaderCircle class="animate-spin" />{:else}<Eye />{/if}Open and delete
		</button>
	</div>
{:else}
	{#if revealed !== null}
		<p class="mb-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
			<Flame class="size-3.5" />This paste has been deleted from the server. It stays here until you leave the page.
		</p>
	{/if}
	<div class="card overflow-hidden"><TextView content={content ?? ''} /></div>
{/if}
