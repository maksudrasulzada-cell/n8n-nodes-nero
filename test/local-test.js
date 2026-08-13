'use strict';

/**
 * Offline test: drive the node's execute() with a fake n8n context and assert on
 * the request it would have sent.
 *
 * The real risk in a node like this is a parameter name that does not match the
 * API — it type-checks fine, loads fine, and fails only against a live workspace.
 * So every operation is exercised here and the resulting method/url/body/qs is
 * compared against what the route handlers actually parse.
 *
 * Run: npm test
 */

const assert = require('assert');
const { Nero } = require('../index.js');

const BASE = 'https://app.aimedia.az';

/** Build a fake IExecuteFunctions that records the single request it is asked to make. */
function ctx(params, { items = [{ json: {} }], continueOnFail = false, response } = {}) {
	const sent = [];
	const self = {
		getInputData: () => items,
		getCredentials: async () => ({ apiKey: 'nero_test', baseUrl: BASE }),
		continueOnFail: () => continueOnFail,
		getNodeParameter(name, _i, fallback) {
			if (name in params) return params[name];
			if (fallback !== undefined) return fallback;
			throw new Error(`test: parameter "${name}" was read but not provided`);
		},
		helpers: {
			httpRequestWithAuthentication: {
				call: async (_self, _cred, options) => {
					sent.push(options);
					return response || { statusCode: 200, body: { ok: true } };
				},
			},
		},
	};
	return { self, sent };
}

async function run(params, opts) {
	const { self, sent } = ctx(params, opts);
	const out = await Nero.prototype.execute.call(self);
	return { req: sent[0], out: out[0] };
}

let passed = 0;
async function test(name, fn) {
	await fn();
	passed++;
	console.log(`  ok  ${name}`);
}

(async () => {
	console.log('NERO node — request building\n');

	// ---- Message ----
	await test('send: text DM', async () => {
		const { req } = await run({
			resource: 'message',
			operation: 'send',
			channel: 'instagram',
			to: '1854086092189079',
			text: 'Salam',
			buttons: {},
			channelId: '',
		});
		assert.strictEqual(req.method, 'POST');
		assert.strictEqual(req.url, BASE + '/api/v1/messages/send');
		assert.deepStrictEqual(req.body, {
			channel: 'instagram',
			to: '1854086092189079',
			text: 'Salam',
			buttons: undefined,
		});
		assert.ok(!('channelId' in req.body), 'an empty channelId must not be sent');
	});

	await test('send: buttons are shaped as the API parses them', async () => {
		const { req } = await run({
			resource: 'message',
			operation: 'send',
			channel: 'instagram',
			to: 'x',
			text: 'Seçin',
			channelId: '',
			buttons: {
				button: [
					{ title: 'Qiymət', payload: 'PRICE', url: '' },
					{ title: 'Sayt', url: 'https://aimedia.az', payload: '' },
					{ title: '   ', url: 'https://ignored' },
				],
			},
		});
		assert.deepStrictEqual(req.body.buttons, [
			{ title: 'Qiymət', payload: 'PRICE' },
			{ title: 'Sayt', url: 'https://aimedia.az' },
		]);
	});

	await test('send: channelId is forwarded when given', async () => {
		const { req } = await run({
			resource: 'message',
			operation: 'send',
			channel: 'instagram',
			to: 'x',
			text: 'hi',
			buttons: {},
			channelId: 'cfe61a6b-275c-4d66-8d74-7733a30f649c',
		});
		assert.strictEqual(req.body.channelId, 'cfe61a6b-275c-4d66-8d74-7733a30f649c');
	});

	await test('sendAttachment: url + type', async () => {
		const { req } = await run({
			resource: 'message',
			operation: 'sendAttachment',
			to: 'x',
			attachmentUrl: 'https://cdn/a.mp3',
			attachmentType: 'audio',
			channelId: '',
		});
		assert.deepStrictEqual(req.body, {
			channel: 'instagram',
			to: 'x',
			attachmentUrl: 'https://cdn/a.mp3',
			attachmentType: 'audio',
		});
	});

	await test('replyComment: sends commentId, not privateReplyCommentId', async () => {
		const { req } = await run({
			resource: 'message',
			operation: 'replyComment',
			commentId: '17900000000000000',
			text: 'Yazdıq sizə',
			channelId: '',
		});
		assert.strictEqual(req.body.commentId, '17900000000000000');
		assert.ok(!('privateReplyCommentId' in req.body));
	});

	await test('privateReply: sends privateReplyCommentId, not commentId', async () => {
		const { req } = await run({
			resource: 'message',
			operation: 'privateReply',
			commentId: '17900000000000000',
			text: 'Salam',
			buttons: {},
			channelId: '',
		});
		assert.strictEqual(req.body.privateReplyCommentId, '17900000000000000');
		assert.ok(!('commentId' in req.body));
	});

	await test('senderAction: its own endpoint', async () => {
		const { req } = await run({
			resource: 'message',
			operation: 'senderAction',
			to: 'x',
			action: 'typing_on',
		});
		assert.strictEqual(req.url, BASE + '/api/v1/messages/action');
		assert.deepStrictEqual(req.body, { channel: 'instagram', to: 'x', action: 'typing_on' });
	});

	// ---- Contact ----
	await test('setFields: field rows become a fields object', async () => {
		const { req } = await run({
			resource: 'contact',
			operation: 'setFields',
			channel: 'instagram',
			externalId: 'x',
			fieldsMode: 'ui',
			fieldsUi: {
				field: [
					{ name: 'sifaris', value: '2 xalça' },
					{ name: 'unvan', value: '' },
					{ name: '  ', value: 'ignored' },
				],
			},
		});
		assert.strictEqual(req.url, BASE + '/api/v1/contacts/fields');
		// An empty value must arrive as null — that is what CLEARS a field.
		assert.deepStrictEqual(req.body.fields, { sifaris: '2 xalça', unvan: null });
	});

	await test('setFields: JSON mode accepts a string', async () => {
		const { req } = await run({
			resource: 'contact',
			operation: 'setFields',
			channel: 'instagram',
			externalId: 'x',
			fieldsMode: 'json',
			fieldsJson: '{"sifaris":"1 pərdə"}',
		});
		assert.deepStrictEqual(req.body.fields, { sifaris: '1 pərdə' });
	});

	await test('setFields: JSON mode rejects an array', async () => {
		await assert.rejects(
			run({
				resource: 'contact',
				operation: 'setFields',
				channel: 'instagram',
				externalId: 'x',
				fieldsMode: 'json',
				fieldsJson: '["nope"]',
			}),
			/must be an object/,
		);
	});

	await test('getFields: GET with query string, no body', async () => {
		const { req } = await run({
			resource: 'contact',
			operation: 'getFields',
			channel: 'instagram',
			externalId: 'abc',
		});
		assert.strictEqual(req.method, 'GET');
		assert.deepStrictEqual(req.qs, { externalId: 'abc', channel: 'instagram' });
		assert.strictEqual(req.body, undefined);
	});

	await test('lookup: the API calls the id "id", not "externalId"', async () => {
		const { req } = await run({
			resource: 'contact',
			operation: 'lookup',
			channel: 'instagram',
			externalId: 'abc',
			profileFields: 'username,name',
		});
		assert.strictEqual(req.url, BASE + '/api/v1/contacts/lookup');
		assert.deepStrictEqual(req.body, { channel: 'instagram', id: 'abc', fields: 'username,name' });
	});

	// ---- Conversation ----
	await test('setBot: minutes only when pausing, and only when > 0', async () => {
		const paused = await run({
			resource: 'conversation',
			operation: 'setBot',
			channel: 'instagram',
			externalId: 'x',
			paused: true,
			minutes: 30,
		});
		assert.deepStrictEqual(paused.req.body, {
			channel: 'instagram',
			externalId: 'x',
			paused: true,
			minutes: 30,
		});

		const zero = await run({
			resource: 'conversation',
			operation: 'setBot',
			channel: 'instagram',
			externalId: 'x',
			paused: true,
			minutes: 0,
		});
		assert.ok(!('minutes' in zero.req.body), '0 means "until resumed" — do not send it');

		const resumed = await run({
			resource: 'conversation',
			operation: 'setBot',
			channel: 'instagram',
			externalId: 'x',
			paused: false,
			minutes: 30,
		});
		assert.strictEqual(resumed.req.body.paused, false);
		assert.ok(!('minutes' in resumed.req.body));
	});

	// ---- Catalog ----
	await test('catalog: a zero price bound is never sent', async () => {
		const { req } = await run({
			resource: 'catalog',
			operation: 'search',
			q: 'xalça',
			catalogOptions: { min_price: 0, max_price: 0, status: 'active', limit: 10 },
		});
		assert.strictEqual(req.method, 'GET');
		assert.deepStrictEqual(req.qs, { q: 'xalça', status: 'active', limit: 10 });
	});

	await test('catalog: bounds are sent when real', async () => {
		const { req } = await run({
			resource: 'catalog',
			operation: 'search',
			q: '',
			catalogOptions: { max_price: 100000, category: 'Xalça' },
		});
		assert.deepStrictEqual(req.qs, { category: 'Xalça', max_price: 100000 });
	});

	// ---- Errors ----
	await test('409 with options names the accounts', async () => {
		await assert.rejects(
			run(
				{ resource: 'catalog', operation: 'search', q: '', catalogOptions: {} },
				{
					response: {
						statusCode: 409,
						body: {
							error: 'this workspace has 2 connected instagram accounts',
							options: [
								{ id: 'aaa', name: 'proxalcayuma1' },
								{ id: 'bbb', name: 'deyerxalcayuma' },
							],
						},
					},
				},
			),
			/proxalcayuma1 \(aaa\), deyerxalcayuma \(bbb\)/,
		);
	});

	await test('a thrown 401 still surfaces the API message', async () => {
		const { self } = ctx(
			{ resource: 'catalog', operation: 'search', q: '', catalogOptions: {} },
			{},
		);
		self.helpers.httpRequestWithAuthentication.call = async () => {
			const err = new Error('Request failed with status code 401');
			err.response = { body: { error: 'invalid api key' } };
			throw err;
		};
		await assert.rejects(Nero.prototype.execute.call(self), /invalid api key/);
	});

	await test('continueOnFail keeps the item instead of failing the run', async () => {
		const { out } = await run(
			{ resource: 'catalog', operation: 'search', q: '', catalogOptions: {} },
			{ continueOnFail: true, response: { statusCode: 500, body: { error: 'boom' } } },
		);
		assert.deepStrictEqual(out, [{ json: { error: 'boom' }, pairedItem: { item: 0 } }]);
	});

	await test('every item is processed, and paired', async () => {
		const { self, sent } = ctx(
			{
				resource: 'message',
				operation: 'send',
				channel: 'instagram',
				to: 'x',
				text: 'hi',
				buttons: {},
				channelId: '',
			},
			{ items: [{ json: {} }, { json: {} }, { json: {} }] },
		);
		const out = await Nero.prototype.execute.call(self);
		assert.strictEqual(sent.length, 3);
		assert.deepStrictEqual(
			out[0].map((o) => o.pairedItem.item),
			[0, 1, 2],
		);
	});

	// ---- Description sanity ----
	await test('description: no property is defined twice for the same view', async () => {
		const node = new Nero();
		const seen = new Map();
		for (const p of node.description.properties) {
			const key = p.name + '|' + JSON.stringify(p.displayOptions || {});
			assert.ok(!seen.has(key), `duplicate property "${p.name}" with identical displayOptions`);
			seen.set(key, true);
		}
		// Every operation the switch handles must be offered in the UI, and vice versa.
		const ops = node.description.properties
			.filter((p) => p.name === 'operation')
			.flatMap((p) => p.options.map((o) => o.value));
		for (const expected of [
			'send',
			'sendAttachment',
			'replyComment',
			'privateReply',
			'senderAction',
			'setFields',
			'getFields',
			'lookup',
			'setBot',
			'search',
		]) {
			assert.ok(ops.includes(expected), `operation "${expected}" is missing from the UI`);
		}
	});

	console.log(`\n${passed} tests passed`);
})().catch((e) => {
	console.error('\nFAILED:', e.message);
	process.exit(1);
});
