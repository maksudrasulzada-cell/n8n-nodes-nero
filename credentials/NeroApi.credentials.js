'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.NeroApi = void 0;

/**
 * NERO API credential.
 *
 * The key comes from Settings → API in the NERO dashboard and is shown once. A
 * key may be bound to a single connected account: when a workspace holds two
 * pages of one network (two Instagram brands under one login), give each
 * workflow the key for its own page and no call can reach the sibling account.
 */
class NeroApi {
	constructor() {
		this.name = 'neroApi';
		this.displayName = 'NERO API';
		this.documentationUrl = 'https://github.com/maksudrasulzada-cell/n8n-nodes-nero';
		this.properties = [
			{
				displayName: 'API Key',
				name: 'apiKey',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				required: true,
				description:
					'From Settings → API in NERO. Starts with nero_. Shown once when created — if you lost it, revoke the key and generate a new one.',
			},
			{
				displayName: 'Base URL',
				name: 'baseUrl',
				type: 'string',
				default: 'https://app.aimedia.az',
				description:
					'Your NERO instance, with no trailing path. Only change this if you run NERO somewhere else.',
			},
		];
		this.authenticate = {
			type: 'generic',
			properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
		};
		// Cheapest authenticated GET in the API: it answers 401 on a bad key and
		// 200 on a good one without needing to know a contact or a channel.
		this.test = {
			request: {
				baseURL: '={{$credentials.baseUrl}}',
				url: '/api/v1/catalog',
				method: 'GET',
			},
		};
	}
}
exports.NeroApi = NeroApi;
