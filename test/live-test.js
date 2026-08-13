'use strict';

/**
 * Live test: run the node's own execute() against a real NERO workspace, so the
 * parameter names are checked by the API rather than by another copy of my
 * assumptions. Read-only operations only — it never sends a message.
 *
 * Run: NERO_KEY=nero_… node test/live-test.js [baseUrl]
 */

const { Nero } = require('../index.js');

const KEY = process.env.NERO_KEY;
const BASE = process.argv[2] || 'https://app.aimedia.az';
if (!KEY) {
	console.error('NERO_KEY is required');
	process.exit(1);
}

/** The same contract n8n's helper offers, backed by fetch. */
async function request(_self, _cred, o) {
	const url = new URL(o.url);
	for (const [k, v] of Object.entries(o.qs || {})) url.searchParams.set(k, String(v));
	const res = await fetch(url, {
		method: o.method,
		headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
		body: o.body ? JSON.stringify(o.body) : undefined,
	});
	return { statusCode: res.status, body: await res.json().catch(() => ({})) };
}

function ctx(params) {
	return {
		getInputData: () => [{ json: {} }],
		getCredentials: async () => ({ apiKey: KEY, baseUrl: BASE }),
		continueOnFail: () => false,
		getNodeParameter: (name, _i, fallback) =>
			name in params ? params[name] : fallback !== undefined ? fallback : undefined,
		helpers: { httpRequestWithAuthentication: { call: request } },
	};
}

(async () => {
	const cases = [
		[
			'catalog · search',
			{ resource: 'catalog', operation: 'search', q: '', catalogOptions: { limit: 3 } },
		],
		[
			'contact · getFields (unknown contact)',
			{
				resource: 'contact',
				operation: 'getFields',
				channel: 'instagram',
				externalId: '999999999999',
			},
		],
	];

	for (const [name, params] of cases) {
		try {
			const out = await Nero.prototype.execute.call(ctx(params));
			const json = out[0][0].json;
			console.log(`ok    ${name} →`, JSON.stringify(json).slice(0, 200));
		} catch (e) {
			console.log(`FAIL  ${name} → ${e.message}`);
			process.exitCode = 1;
		}
	}

	// A key bound to an Instagram account must refuse another network outright,
	// rather than quietly acting on something.
	try {
		await Nero.prototype.execute.call(
			ctx({
				resource: 'contact',
				operation: 'getFields',
				channel: 'whatsapp',
				externalId: '999999999999',
			}),
		);
		console.log('FAIL  bound key was allowed onto another network');
		process.exitCode = 1;
	} catch (e) {
		console.log(`ok    bound key refuses another network → ${e.message}`);
	}
})();
