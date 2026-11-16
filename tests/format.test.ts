import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBytes, groupCode, relativeTime } from '../src/lib/format.ts';

test('formatBytes', () => {
	assert.equal(formatBytes(0), '0 B');
	assert.equal(formatBytes(1536), '1.5 KB');
	assert.equal(formatBytes(300 * 1024 * 1024), '300 MB');
});

test('groupCode splits into fours', () => {
	assert.equal(groupCode('12345678'), '1234 5678');
	assert.equal(groupCode('123456789'), '1234 5678 9');
});

test('relativeTime', () => {
	const now = Date.now();
	assert.equal(relativeTime(now + 3 * 3_600_000, now), 'in 3 hours');
	assert.equal(relativeTime(now - 5 * 60_000, now), '5 minutes ago');
});
