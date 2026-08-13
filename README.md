# n8n-nodes-nero

An n8n community node for [NERO](https://app.aimedia.az) — the inbox behind AI Media's Instagram, Messenger, WhatsApp and Telegram bots.

It replaces the stack of HTTP Request nodes a bot workflow needs. Every operation maps 1:1 onto an endpoint under `/api/v1`; the node supplies the parameter names, the validation and the error messages.

## Install

n8n → **Settings → Community nodes → Install** → `n8n-nodes-nero`

## Credential

**NERO API** takes two things:

| Field | Value |
|---|---|
| API Key | From **Settings → API** in NERO. Starts with `nero_`, shown once. |
| Base URL | `https://app.aimedia.az` (only change it if you self-host NERO elsewhere) |

Use **Test** — it calls the catalogue endpoint, so a wrong key fails immediately rather than on your first customer.

### Two brands under one login

A key can be **bound to one connected account**. When a workspace holds two Instagram pages, give each workflow the key for its own page: every call it makes resolves to that account, it cannot reach the sibling page, and you never have to thread a channel id through the request body.

With an unbound key the node still works — NERO follows the customer's own conversation. It refuses, with both account names in the error, only when nothing in the call identifies which account is meant.

## Operations

### Message

| Operation | Endpoint | Notes |
|---|---|---|
| Send | `POST /api/v1/messages/send` | Text DM on any channel. Optional buttons. |
| Send Attachment | `POST /api/v1/messages/send` | Image / video / audio / file by public URL. Instagram. |
| Reply to Comment | `POST /api/v1/messages/send` | Public reply under an Instagram comment. |
| Private Reply to Comment | `POST /api/v1/messages/send` | Opens a DM from a comment. Meta allows this once per comment. |
| Sender Action | `POST /api/v1/messages/action` | `typing_on` / `typing_off` / `mark_seen`. Instagram. |

**To** is the customer's id on that network. NERO forwards it to your webhook as `contactExternalId`, so it is usually `{{ $json.body.contactExternalId }}`.

### Contact

| Operation | Endpoint | Notes |
|---|---|---|
| Set Fields | `POST /api/v1/contacts/fields` | Record what the bot collected. An empty value **clears** the field. |
| Get Fields | `GET /api/v1/contacts/fields` | Reads back the collected answers plus `botPaused`. Answers `found: false` — not 404 — for an unknown contact. |
| Lookup Profile | `POST /api/v1/contacts/lookup` | Instagram username / name / picture. |

Every field name you send becomes starrable in **Settings → Pipeline**, so the Orders and Complaints views can be built out of the questions your bot already asks. Keep the spelling stable — a new spelling is a new field.

### Conversation

| Operation | Endpoint | Notes |
|---|---|---|
| Pause / Resume Bot | `POST /api/v1/conversations/bot` | Same switch as human takeover in the inbox. Minutes `0` = until someone resumes it. |

Pair it with **Get Fields**: check `botPaused` before replying, so the bot stays quiet while an agent is typing.

### Catalog

| Operation | Endpoint | Notes |
|---|---|---|
| Search | `GET /api/v1/catalog` | Status defaults to **active**, so a sold item is never offered again. Only fields marked bot-visible are returned. |

## Use as an AI tool

The node is exposed as a tool, so an AI Agent can call it directly — for example to write the order it just agreed, or to pause itself when the customer asks for a human.

## Tests

```bash
npm test
```

Drives `execute()` with a fake n8n context and asserts on the request that would have been sent — the parameter names are checked, not assumed.

Against a real workspace (read-only, never sends a message):

```bash
NERO_KEY=nero_... node test/live-test.js
```

## Licence

MIT
