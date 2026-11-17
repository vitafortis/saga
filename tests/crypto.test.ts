import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { decrypt, decryptText, encrypt, encryptText, OPENSSL_ARGS, TEXT_PREFIX, WrongPasswordError } from '../src/lib/crypto.ts';

const openssl = (args: string, input: Uint8Array | string) =>
	execFileSync('openssl', ['enc', ...OPENSSL_ARGS.split(' '), ...args.split(' ').filter(Boolean), '-pass', 'pass:hunter2 ü'], { input });

test('openssl decrypts what Saga encrypts', async () => {
	const data = new TextEncoder().encode('-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n');
	const out = openssl('-d', await encrypt(data, 'hunter2 ü'));
	assert.deepEqual(new Uint8Array(out), data);
	assert.equal(openssl('-d -a -A', await encryptText('line one\nline two', 'hunter2 ü')).toString(), 'line one\nline two');
});

test('Saga decrypts what openssl encrypts', async () => {
	const bytes = new Uint8Array(openssl('-salt', 'from the shell'));
	assert.equal(new TextDecoder().decode(await decrypt(bytes, 'hunter2 ü')), 'from the shell');
	const text = openssl('-salt -a -A', 'piped text').toString();
	assert.ok(text.startsWith(TEXT_PREFIX));
	assert.equal(await decryptText(text + '\n', 'hunter2 ü'), 'piped text');
});

test('a wrong password is refused', async () => {
	const text = await encryptText('secret', 'right');
	await assert.rejects(decryptText(text, 'wrong'), WrongPasswordError);
	await assert.rejects(decrypt(new TextEncoder().encode('not encrypted at all, just text'), 'x'), WrongPasswordError);
});
