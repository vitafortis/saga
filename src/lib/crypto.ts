/**
 * End-to-end encryption, done in the browser or by sagacp; Saga only ever stores the result.
 *
 * The format is exactly what `openssl enc` writes, so anything encrypted here can be decrypted
 * with plain openssl (and the other way round):
 *
 *   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -in file.enc -out file
 *
 * Bytes: "Salted__", an 8-byte salt, then AES-256-CBC. Key and IV are 48 bytes of
 * PBKDF2-HMAC-SHA256(password, salt). Text is stored as single-line base64 of the same bytes
 * (`openssl enc -a -A`).
 */

export const ITERATIONS = 600_000;
/** The flags both sides use, for docs and error messages. */
export const OPENSSL_ARGS = `-aes-256-cbc -pbkdf2 -iter ${ITERATIONS} -md sha256`;

const MAGIC = new TextEncoder().encode('Salted__');
/** base64 of "Salted__": every encrypted paste starts with it. */
export const TEXT_PREFIX = 'U2FsdGVkX1';

export class WrongPasswordError extends Error {
	constructor() {
		super('Wrong password, or not something Saga encrypted');
	}
}

type Bytes = Uint8Array<ArrayBuffer>;

async function keyAndIv(password: string, salt: Bytes): Promise<{ key: CryptoKey; iv: Bytes }> {
	const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, 384));
	const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-CBC', false, ['encrypt', 'decrypt']);
	return { key, iv: bits.slice(32) };
}

export async function encrypt(data: Uint8Array, password: string): Promise<Uint8Array<ArrayBuffer>> {
	const salt = crypto.getRandomValues(new Uint8Array(8));
	const { key, iv } = await keyAndIv(password, salt);
	const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, data as Uint8Array<ArrayBuffer>));
	const out = new Uint8Array(16 + body.length);
	out.set(MAGIC);
	out.set(salt, 8);
	out.set(body, 16);
	return out;
}

/** Throws WrongPasswordError when the password is wrong (or the data isn't ours). */
export async function decrypt(data: Uint8Array, password: string): Promise<Uint8Array<ArrayBuffer>> {
	if (!isEncrypted(data)) throw new WrongPasswordError();
	const { key, iv } = await keyAndIv(password, data.slice(8, 16) as Bytes);
	try {
		return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, data.slice(16) as Bytes));
	} catch {
		throw new WrongPasswordError();
	}
}

export const isEncrypted = (data: Uint8Array) => data.length >= 32 && MAGIC.every((b, i) => data[i] === b);

export async function encryptText(text: string, password: string): Promise<string> {
	return toBase64(await encrypt(new TextEncoder().encode(text), password));
}

export async function decryptText(base64: string, password: string): Promise<string> {
	let bytes: Uint8Array;
	try {
		bytes = fromBase64(base64.trim());
	} catch {
		throw new WrongPasswordError();
	}
	const plain = await decrypt(bytes, password);
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(plain);
	} catch {
		// CBC padding passes by chance about once in 256 wrong passwords; the text check catches most of those.
		throw new WrongPasswordError();
	}
}

function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
}

function fromBase64(s: string): Uint8Array {
	const bin = atob(s);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
