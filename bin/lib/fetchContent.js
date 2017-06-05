// This module makes use of 'node-fetch' plus some extra data munging for a variety of content sources.

const fetch = require('node-fetch');
const debug = require('debug')('bin:lib:fetchContent');

const     extractUuid = require('./extract-uuid');
// const individualUUIDs = require('./individualUUIDs');

const CAPI_KEY = process.env.CAPI_KEY;
if (! CAPI_KEY ) {
	throw new Error('ERROR: CAPI_KEY not specified in env');
}

const CAPI_PATH = 'http://api.ft.com/enrichedcontent/';
const SAPI_PATH = 'http://api.ft.com/content/search/v1';

function constructSAPIQuery( overrides ) {
	const base = {
  	"queryString": "",
  	"queryContext" : {
         "curations" : [ "ARTICLES", "BLOGS" ]
		},
  	"resultContext" : {
			"maxResults" : "100",
			"offset" : "0",
			"aspects" : [ "title"],
			"sortOrder": "DESC",
			"sortField": "lastPublishDateTime",
			"facets" : {"names":[ "organisations", "people"], "maxElements":-1}
  	}
	}

	return Object.assign({}, base, overrides);
}

function article(uuid) {
	debug(`uuid=${uuid}`);
	const capiUrl = `${CAPI_PATH}${uuid}?apiKey=${CAPI_KEY}`;

	return fetch(capiUrl)
	.then( res   => res.text() )
	.then( text  => JSON.parse(text) )
	;
}

function searchByUUID(uuid) {
	debug(`uuid=${uuid}`);
	const sapiUrl = `${SAPI_PATH}?apiKey=${CAPI_KEY}`;
	const sapiQuery = constructSAPIQuery( {queryString: uuid} );

	debug(`searchByUUID: sapiQuery=${JSON.stringify(sapiQuery)}`);

	return fetch(sapiUrl, {
		 method: 'POST',
       body: JSON.stringify(sapiQuery),
		headers: {
			'Content-Type' : 'application/json',
		},
	})
	.then( res  => res.text() )
	.then( text => {
		debug(`searchByUUID: text=${text}`);
		return text;
	})
	.then( text => JSON.parse(text) )
	;
}


module.exports = {
	article,
	searchByUUID,
};
