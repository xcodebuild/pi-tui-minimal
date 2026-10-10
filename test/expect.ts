import assert from "node:assert/strict";

export function expect(actual: unknown) {
	return {
		toEqual(expected: unknown) {
			assert.deepEqual(actual, expected);
		},
		toBe(expected: unknown) {
			assert.equal(actual, expected);
		},
		toBeUndefined() {
			assert.equal(actual, undefined);
		},
		toMatchObject(expected: Record<string, unknown>) {
			assert.ok(actual && typeof actual === "object");
			for (const [key, value] of Object.entries(expected)) {
				assert.deepEqual((actual as Record<string, unknown>)[key], value);
			}
		},
		toBeGreaterThan(n: number) {
			assert.ok(Number(actual) > n);
		},
		toBeLessThanOrEqual(n: number) {
			assert.ok(Number(actual) <= n);
		},
		toContain(part: string) {
			assert.ok(String(actual).includes(part), `expected ${JSON.stringify(actual)} to contain ${part}`);
		},
		toMatch(pattern: RegExp) {
			assert.match(String(actual), pattern);
		},
		toBeTypeOf(typeName: string) {
			assert.equal(typeof actual, typeName);
		},
		toBeTruthy() {
			assert.ok(actual);
		},
		toHaveProperty(key: string) {
			assert.ok(actual !== null && typeof actual === "object" && key in actual);
		},
		not: {
			toThrow() {
				if (typeof actual === "function") {
					actual();
				}
			},
			toBe(expected: unknown) {
				assert.notEqual(actual, expected);
			},
			toMatch(pattern: RegExp) {
				assert.doesNotMatch(String(actual), pattern);
			},
		},
	};
}
