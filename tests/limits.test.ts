import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Limiter } from '../src/lib/server/limits.ts';

test('Limiter blocks after max hits per key', () => {
	const l = new Limiter(2, 60_000);
	l.hit('a');
	assert.equal(l.blocked('a'), false);
	l.hit('a');
	assert.equal(l.blocked('a'), true);
	assert.equal(l.blocked('b'), false);
});

test('Limiter window resets', () => {
	const l = new Limiter(1, -1);
	l.hit('a');
	assert.equal(l.blocked('a'), false);
});
