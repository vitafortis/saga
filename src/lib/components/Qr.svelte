<script lang="ts">
	import QRCode from 'qrcode';

	let { value, size = 168 }: { value: string; size?: number } = $props();
	let svg = $state('');

	$effect(() => {
		// Dark modules on white whatever the theme: phone cameras read that best.
		QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#141218', light: '#ffffff' } }).then(
			(s) => (svg = s)
		);
	});
</script>

<div class="overflow-hidden rounded-lg bg-white p-1.5 shadow-surface [&_svg]:block [&_svg]:size-full" style="width:{size}px;height:{size}px" aria-label="QR code for {value}" role="img">
	{@html svg}
</div>
