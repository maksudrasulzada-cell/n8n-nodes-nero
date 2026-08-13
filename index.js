'use strict';

// n8n loads this package from the "n8n" block in package.json; this file exists
// so the node can be required directly from a test or a script.
const { Nero } = require('./nodes/Nero/Nero.node');
const { NeroApi } = require('./credentials/NeroApi.credentials');

module.exports = { Nero, NeroApi };
