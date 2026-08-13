'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Nero = void 0;

/**
 * NERO — n8n action node for the NERO inbox API (app.aimedia.az).
 *
 * Replaces the stack of HTTP Request nodes a bot workflow needs: send a DM, reply
 * to a comment, record what the bot collected, pause itself for a human, read the
 * catalogue. Every operation maps 1:1 onto an endpoint under /api/v1 — the node
 * adds the parameter names, the validation and the error messages, nothing else.
 *
 * Depends on nothing but n8n's own request helper, so it does not break on n8n
 * updates the way nodes pinned to internal packages do.
 */

const CHANNELS = [
	{ name: 'Instagram', value: 'instagram' },
	{ name: 'Messenger', value: 'messenger' },
	{ name: 'Telegram', value: 'telegram' },
	{ name: 'WhatsApp', value: 'whatsapp' },
];

/** Turn the buttons fixedCollection into the array the API expects. */
function buildButtons(raw) {
	const list = (raw && raw.button) || [];
	const out = [];
	for (const b of list) {
		const title = (b.title || '').trim();
		if (!title) continue;
		const one = { title };
		if (b.url) one.url = b.url;
		if (b.payload) one.payload = b.payload;
		out.push(one);
	}
	return out.length ? out : undefined;
}

/**
 * Collected fields, from either input mode.
 * A value left empty is sent as null on purpose: that is how the API clears a
 * field, so a workflow can retract an answer the bot got wrong.
 */
function buildFields(mode, ui, json) {
	if (mode === 'json') {
		const parsed = typeof json === 'string' ? JSON.parse(json) : json;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('Fields (JSON) must be an object, e.g. {"sifaris": "2 xalca"}');
		}
		return parsed;
	}
	const out = {};
	for (const f of (ui && ui.field) || []) {
		const key = (f.name || '').trim();
		if (!key) continue;
		out[key] = f.value === '' || f.value === undefined ? null : f.value;
	}
	return out;
}

/** The API's own error text, with the ambiguous-account case spelled out. */
function apiMessage(data, fallback) {
	let message = (data && data.error) || fallback;
	// The one error a workflow author will actually hit: two accounts of one
	// network and nothing saying which. Name them.
	if (data && Array.isArray(data.options) && data.options.length) {
		const names = data.options.map((o) => `${o.name || o.id} (${o.id})`).join(', ');
		message += ` — accounts: ${names}`;
	}
	return message;
}

/** Dig the response body out of whatever error shape n8n threw. */
function errorBody(error) {
	if (!error) return null;
	const candidates = [
		error.response && error.response.body,
		error.response && error.response.data,
		error.cause && error.cause.response && error.cause.response.body,
		error.cause && error.cause.error,
		error.error,
	];
	for (const c of candidates) {
		if (c && typeof c === 'object') return c;
		if (typeof c === 'string') {
			try {
				const parsed = JSON.parse(c);
				if (parsed && typeof parsed === 'object') return parsed;
			} catch (e) { /* not JSON — keep looking */ }
		}
	}
	return null;
}

class Nero {
	constructor() {
		this.description = {
			displayName: 'aimedia.az',
			name: 'nero',
			icon: 'file:aimedia.png',
			group: ['output'],
			version: 1,
			subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
			description: 'Send messages and manage contacts in the NERO inbox',
			defaults: { name: 'aimedia.az' },
			inputs: ['main'],
			outputs: ['main'],
			// Lets an AI Agent call these operations directly as tools, so the model
			// can record an order or pause itself without a separate branch.
			usableAsTool: true,
			credentials: [{ name: 'neroApi', required: true }],
			properties: [
				{
					displayName: 'Resource',
					name: 'resource',
					type: 'options',
					noDataExpression: true,
					default: 'message',
					options: [
						{ name: 'Message', value: 'message' },
						{ name: 'Contact', value: 'contact' },
						{ name: 'Conversation', value: 'conversation' },
						{ name: 'Catalog', value: 'catalog' },
					],
				},

				// ---------------- Message ----------------
				{
					displayName: 'Operation',
					name: 'operation',
					type: 'options',
					noDataExpression: true,
					displayOptions: { show: { resource: ['message'] } },
					default: 'send',
					options: [
						{ name: 'Send', value: 'send', description: 'Send a text message', action: 'Send a message' },
						{
							name: 'Send Attachment',
							value: 'sendAttachment',
							description: 'Send an image, video, audio or file by URL',
							action: 'Send an attachment',
						},
						{
							name: 'Reply to Comment',
							value: 'replyComment',
							description: 'Reply publicly under an Instagram comment',
							action: 'Reply to a comment',
						},
						{
							name: 'Private Reply to Comment',
							value: 'privateReply',
							description: 'Open a DM from an Instagram comment (once per comment)',
							action: 'Send a private reply',
						},
						{
							name: 'Sender Action',
							value: 'senderAction',
							description: 'Show typing, or mark the conversation as seen',
							action: 'Send a sender action',
						},
					],
				},
				{
					displayName: 'Channel',
					name: 'channel',
					type: 'options',
					options: CHANNELS,
					default: 'instagram',
					required: true,
					displayOptions: { show: { resource: ['message'], operation: ['send'] } },
				},
				{
					displayName: 'To',
					name: 'to',
					type: 'string',
					default: '',
					required: true,
					placeholder: '={{ $json.body.contactExternalId }}',
					description:
						"The customer's id on that network (IGSID, chat id, phone). NERO forwards it as contactExternalId.",
					displayOptions: {
						show: { resource: ['message'], operation: ['send', 'sendAttachment', 'senderAction'] },
					},
				},
				{
					displayName: 'Text',
					name: 'text',
					type: 'string',
					typeOptions: { rows: 3 },
					default: '',
					required: true,
					displayOptions: {
						show: { resource: ['message'], operation: ['send', 'replyComment', 'privateReply'] },
					},
				},
				{
					displayName: 'Comment ID',
					name: 'commentId',
					type: 'string',
					default: '',
					required: true,
					description: 'The Instagram comment to answer',
					displayOptions: {
						show: { resource: ['message'], operation: ['replyComment', 'privateReply'] },
					},
				},
				{
					displayName: 'Attachment URL',
					name: 'attachmentUrl',
					type: 'string',
					default: '',
					required: true,
					description: 'A publicly reachable URL. Meta fetches it itself, so it cannot be a local path.',
					displayOptions: { show: { resource: ['message'], operation: ['sendAttachment'] } },
				},
				{
					displayName: 'Attachment Type',
					name: 'attachmentType',
					type: 'options',
					options: [
						{ name: 'Image', value: 'image' },
						{ name: 'Video', value: 'video' },
						{ name: 'Audio', value: 'audio' },
						{ name: 'File', value: 'file' },
					],
					default: 'image',
					displayOptions: { show: { resource: ['message'], operation: ['sendAttachment'] } },
				},
				{
					displayName: 'Action',
					name: 'action',
					type: 'options',
					options: [
						{ name: 'Typing On', value: 'typing_on' },
						{ name: 'Typing Off', value: 'typing_off' },
						{ name: 'Mark Seen', value: 'mark_seen' },
					],
					default: 'typing_on',
					description: 'Instagram only',
					displayOptions: { show: { resource: ['message'], operation: ['senderAction'] } },
				},
				{
					displayName: 'Buttons',
					name: 'buttons',
					type: 'fixedCollection',
					typeOptions: { multipleValues: true },
					default: {},
					placeholder: 'Add button',
					description: 'Quick replies. Give a URL for a link button, or a payload for a postback.',
					displayOptions: {
						show: { resource: ['message'], operation: ['send', 'privateReply'] },
					},
					options: [
						{
							name: 'button',
							displayName: 'Button',
							values: [
								{ displayName: 'Title', name: 'title', type: 'string', default: '' },
								{ displayName: 'URL', name: 'url', type: 'string', default: '' },
								{ displayName: 'Payload', name: 'payload', type: 'string', default: '' },
							],
						},
					],
				},

				// ---------------- Contact ----------------
				{
					displayName: 'Operation',
					name: 'operation',
					type: 'options',
					noDataExpression: true,
					displayOptions: { show: { resource: ['contact'] } },
					default: 'setFields',
					options: [
						{
							name: 'Set Fields',
							value: 'setFields',
							description: 'Record what the bot collected (order, address, service…)',
							action: 'Set contact fields',
						},
						{
							name: 'Get Fields',
							value: 'getFields',
							description: 'Read back what is known, including whether a human took over',
							action: 'Get contact fields',
						},
						{
							name: 'Lookup Profile',
							value: 'lookup',
							description: "Fetch the customer's Instagram username / name / picture",
							action: 'Look up a profile',
						},
					],
				},
				// Shared by Contact and Conversation: one definition rather than one per
				// resource, so there is a single place the value can come from.
				{
					displayName: 'Channel',
					name: 'channel',
					type: 'options',
					options: CHANNELS,
					default: 'instagram',
					description:
						'Which network this customer is on. With two accounts of one network connected, this plus the External ID is what tells them apart.',
					displayOptions: { show: { resource: ['contact', 'conversation'] } },
				},
				{
					displayName: 'External ID',
					name: 'externalId',
					type: 'string',
					default: '',
					required: true,
					placeholder: '={{ $json.body.contactExternalId }}',
					description: "The customer's id on that network",
					displayOptions: { show: { resource: ['contact', 'conversation'] } },
				},
				{
					displayName: 'Profile Fields',
					name: 'profileFields',
					type: 'string',
					default: 'username',
					description: 'Comma-separated Instagram profile fields, e.g. username,name,profile_pic',
					displayOptions: { show: { resource: ['contact'], operation: ['lookup'] } },
				},
				{
					displayName: 'Fields Input',
					name: 'fieldsMode',
					type: 'options',
					options: [
						{ name: 'Fields Below', value: 'ui' },
						{ name: 'JSON', value: 'json' },
					],
					default: 'ui',
					displayOptions: { show: { resource: ['contact'], operation: ['setFields'] } },
				},
				{
					displayName: 'Fields',
					name: 'fieldsUi',
					type: 'fixedCollection',
					typeOptions: { multipleValues: true },
					default: {},
					placeholder: 'Add field',
					description:
						'Each name becomes starrable in Settings → Pipeline, so Orders and Complaints can be built out of the questions the bot already asks. Leave a value empty to clear it.',
					displayOptions: {
						show: { resource: ['contact'], operation: ['setFields'], fieldsMode: ['ui'] },
					},
					options: [
						{
							name: 'field',
							displayName: 'Field',
							values: [
								{
									displayName: 'Name',
									name: 'name',
									type: 'string',
									default: '',
									placeholder: 'sifaris',
									description: 'Keep this spelling stable — a new spelling is a new field',
								},
								{ displayName: 'Value', name: 'value', type: 'string', default: '' },
							],
						},
					],
				},
				{
					displayName: 'Fields (JSON)',
					name: 'fieldsJson',
					type: 'json',
					default: '{\n  "sifaris": ""\n}',
					displayOptions: {
						show: { resource: ['contact'], operation: ['setFields'], fieldsMode: ['json'] },
					},
				},

				// ---------------- Conversation ----------------
				{
					displayName: 'Operation',
					name: 'operation',
					type: 'options',
					noDataExpression: true,
					displayOptions: { show: { resource: ['conversation'] } },
					default: 'setBot',
					options: [
						{
							name: 'Pause / Resume Bot',
							value: 'setBot',
							description: 'Hand the conversation to a human, or take it back',
							action: 'Pause or resume the bot',
						},
					],
				},
				{
					displayName: 'Paused',
					name: 'paused',
					type: 'boolean',
					default: true,
					description: 'Whether the bot should stay quiet on this conversation',
					displayOptions: { show: { resource: ['conversation'], operation: ['setBot'] } },
				},
				{
					displayName: 'Minutes',
					name: 'minutes',
					type: 'number',
					default: 0,
					description: 'Resume automatically after this many minutes. 0 = until someone resumes it.',
					displayOptions: {
						show: { resource: ['conversation'], operation: ['setBot'], paused: [true] },
					},
				},

				// ---------------- Catalog ----------------
				{
					displayName: 'Operation',
					name: 'operation',
					type: 'options',
					noDataExpression: true,
					displayOptions: { show: { resource: ['catalog'] } },
					default: 'search',
					options: [
						{
							name: 'Search',
							value: 'search',
							description: 'What this workspace sells, for the bot to quote',
							action: 'Search the catalog',
						},
					],
				},
				{
					displayName: 'Search',
					name: 'q',
					type: 'string',
					default: '',
					description: 'Free text match on the item name',
					displayOptions: { show: { resource: ['catalog'] } },
				},
				{
					displayName: 'Options',
					name: 'catalogOptions',
					type: 'collection',
					placeholder: 'Add option',
					default: {},
					displayOptions: { show: { resource: ['catalog'] } },
					options: [
						{ displayName: 'Category', name: 'category', type: 'string', default: '' },
						{
							displayName: 'Kind',
							name: 'kind',
							type: 'options',
							options: [
								{ name: 'Offering (Standing Price)', value: 'offering' },
								{ name: 'Unit (One-Off, Until Sold)', value: 'unit' },
							],
							default: 'offering',
						},
						{
							displayName: 'Status',
							name: 'status',
							type: 'options',
							options: [
								{ name: 'Active', value: 'active' },
								{ name: 'Reserved', value: 'reserved' },
								{ name: 'Sold', value: 'sold' },
								{ name: 'Hidden', value: 'hidden' },
								{ name: 'All', value: 'all' },
							],
							default: 'active',
							description: 'Defaults to Active, so a sold item is never offered again',
						},
						{ displayName: 'Min Price', name: 'min_price', type: 'number', default: 0 },
						{ displayName: 'Max Price', name: 'max_price', type: 'number', default: 0 },
						{
							displayName: 'Limit',
							name: 'limit',
							type: 'number',
							typeOptions: { minValue: 1, maxValue: 200 },
							default: 50,
						},
					],
				},

				// ---------------- Shared ----------------
				{
					displayName: 'Channel ID',
					name: 'channelId',
					type: 'string',
					default: '',
					description:
						'Only needed when the workspace has two accounts of one network AND the API key is not bound to one of them. Leave empty otherwise — NERO follows the customer.',
					displayOptions: { show: { resource: ['message'], operation: ['send', 'sendAttachment'] } },
				},
			],
		};
	}

	async execute() {
		const items = this.getInputData();
		const out = [];

		const creds = await this.getCredentials('neroApi');
		const base = String((creds && creds.baseUrl) || 'https://app.aimedia.az').replace(/\/+$/, '');

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i);
				const operation = this.getNodeParameter('operation', i);

				let method = 'POST';
				let path = '';
				let body;
				let qs;

				if (resource === 'message') {
					if (operation === 'senderAction') {
						path = '/api/v1/messages/action';
						body = {
							channel: 'instagram',
							to: this.getNodeParameter('to', i),
							action: this.getNodeParameter('action', i),
						};
					} else {
						path = '/api/v1/messages/send';
						const channelId = this.getNodeParameter('channelId', i, '');
						if (operation === 'send') {
							body = {
								channel: this.getNodeParameter('channel', i),
								to: this.getNodeParameter('to', i),
								text: this.getNodeParameter('text', i),
								buttons: buildButtons(this.getNodeParameter('buttons', i, {})),
							};
						} else if (operation === 'sendAttachment') {
							body = {
								channel: 'instagram',
								to: this.getNodeParameter('to', i),
								attachmentUrl: this.getNodeParameter('attachmentUrl', i),
								attachmentType: this.getNodeParameter('attachmentType', i),
							};
						} else if (operation === 'replyComment') {
							body = {
								channel: 'instagram',
								commentId: this.getNodeParameter('commentId', i),
								text: this.getNodeParameter('text', i),
							};
						} else if (operation === 'privateReply') {
							body = {
								channel: 'instagram',
								privateReplyCommentId: this.getNodeParameter('commentId', i),
								text: this.getNodeParameter('text', i),
								buttons: buildButtons(this.getNodeParameter('buttons', i, {})),
							};
						}
						if (channelId) body.channelId = channelId;
					}
				} else if (resource === 'contact') {
					const channel = this.getNodeParameter('channel', i);
					const externalId = this.getNodeParameter('externalId', i);
					if (operation === 'getFields') {
						method = 'GET';
						path = '/api/v1/contacts/fields';
						qs = { externalId, channel };
					} else if (operation === 'setFields') {
						path = '/api/v1/contacts/fields';
						body = {
							channel,
							externalId,
							fields: buildFields(
								this.getNodeParameter('fieldsMode', i),
								this.getNodeParameter('fieldsUi', i, {}),
								this.getNodeParameter('fieldsJson', i, '{}'),
							),
						};
					} else if (operation === 'lookup') {
						path = '/api/v1/contacts/lookup';
						body = {
							channel: 'instagram',
							id: externalId,
							fields: this.getNodeParameter('profileFields', i, 'username'),
						};
					}
				} else if (resource === 'conversation') {
					path = '/api/v1/conversations/bot';
					const paused = this.getNodeParameter('paused', i);
					body = {
						channel: this.getNodeParameter('channel', i),
						externalId: this.getNodeParameter('externalId', i),
						paused,
					};
					if (paused) {
						const minutes = this.getNodeParameter('minutes', i, 0);
						if (minutes > 0) body.minutes = minutes;
					}
				} else if (resource === 'catalog') {
					method = 'GET';
					path = '/api/v1/catalog';
					const opts = this.getNodeParameter('catalogOptions', i, {});
					qs = {};
					const q = this.getNodeParameter('q', i, '');
					if (q) qs.q = q;
					for (const key of ['category', 'kind', 'status', 'limit']) {
						if (opts[key] !== undefined && opts[key] !== '') qs[key] = opts[key];
					}
					// 0 is a meaningful number everywhere else, but as a price bound it
					// means "no bound" — sending it would filter the catalogue to nothing.
					for (const key of ['min_price', 'max_price']) {
						if (opts[key]) qs[key] = opts[key];
					}
				}

				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'neroApi', {
					method,
					url: base + path,
					body,
					qs,
					json: true,
					returnFullResponse: true,
					// Handled below, so a 409 can explain itself instead of surfacing as
					// an opaque "request failed".
					ignoreHttpStatusErrors: true,
				});

				const status = response.statusCode;
				const data = response.body;

				if (status >= 400) throw new Error(apiMessage(data, `NERO returned ${status}`));

				out.push({ json: data, pairedItem: { item: i } });
			} catch (error) {
				// Depending on the n8n version the helper either returns the 4xx (when
				// it honours ignoreHttpStatusErrors) or throws it. Read the API's own
				// message out of both shapes rather than surfacing "request failed".
				const thrownBody = errorBody(error);
				const message = thrownBody ? apiMessage(thrownBody, error.message) : error.message;
				if (this.continueOnFail()) {
					out.push({ json: { error: message }, pairedItem: { item: i } });
					continue;
				}
				throw new Error(message);
			}
		}

		return [out];
	}
}
exports.Nero = Nero;
