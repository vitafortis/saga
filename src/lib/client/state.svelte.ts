type Toast = { id: number; kind: 'info' | 'success' | 'error'; title: string; body?: string };

let nextToast = 1;
export const toasts = $state<Toast[]>([]);

export function toast(kind: Toast['kind'], title: string, body?: string) {
	const id = nextToast++;
	toasts.push({ id, kind, title, body });
	setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500);
}

export function dismiss(id: number) {
	const i = toasts.findIndex((t) => t.id === id);
	if (i !== -1) toasts.splice(i, 1);
}

export const theme = $state<{ value: 'dark' | 'light' }>({ value: 'dark' });

export function setTheme(value: 'dark' | 'light') {
	theme.value = value;
	document.documentElement.dataset.theme = value;
	try {
		localStorage.setItem('saga-theme', value);
	} catch {}
}

export async function copy(text: string, what = 'Copied') {
	try {
		await navigator.clipboard.writeText(text);
		toast('success', what);
	} catch {
		// Plain-http pages (LAN by IP) have no clipboard API.
		const ta = Object.assign(document.createElement('textarea'), { value: text });
		document.body.append(ta);
		ta.select();
		const ok = document.execCommand('copy');
		ta.remove();
		toast(ok ? 'success' : 'error', ok ? what : 'Copy failed');
	}
}
