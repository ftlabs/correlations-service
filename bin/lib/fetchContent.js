// This module makes use of 'node-fetch' to acces SAPI

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

function constructSAPIQuery( params ) {

	const defaults = {
		queryString : "",
	   maxResults : 1,
		     offset : 0,
		    aspects : [ "title"], // [ "title", "location", "summary", "lifecycle", "metadata"],
		constraints : [],
		   ontology : "people",
	};

	const combined = Object.assign({}, defaults, params);

	let queryString = combined.queryString;
	if (queryString == '' && combined.constraints.length > 0 ) {
		queryString = combined.constraints.join(' and ');
	}

	const full = {
  	"queryString": queryString,
  	"queryContext" : {
         "curations" : [ "ARTICLES", "BLOGS" ]
		},
  	"resultContext" : {
			"maxResults" : `${combined.maxResults}`,
		 	    "offset" : `${combined.offset}`,
			   "aspects" : combined.aspects,
			 "sortOrder" : "DESC",
			 "sortField" : "lastPublishDateTime",
			    "facets" : {"names":[combined.ontology], "maxElements":-1}
  	}
	}

	return full;
}

function article(uuid) {
	debug(`uuid=${uuid}`);
	const capiUrl = `${CAPI_PATH}${uuid}?apiKey=${CAPI_KEY}`;

	return fetch(capiUrl)
	.then( res   => res.text() )
	.then( text  => JSON.parse(text) )
	;
}

function search(params) {
	const sapiUrl = `${SAPI_PATH}?apiKey=${CAPI_KEY}`;
	const sapiQuery = constructSAPIQuery( params );
	debug(`search: sapiQuery=${JSON.stringify(sapiQuery)}`);

	return fetch(sapiUrl, {
		 method: 'POST',
       body: JSON.stringify(sapiQuery),
		headers: {
			'Content-Type' : 'application/json',
		},
	})
	.catch( err => {
		console.log(`ERROR: search: fetch: err=${err}.`);
	})
	.then( res  => res.text() )
	.then( text => {
		let sapiObj;
		try {
		 	sapiObj = JSON.parse(text);
		}
		catch( e ){
			console.log(`ERROR: search: e=${e},
				text=${text},
				params=${params}`);
		}
		return {
			params,
			sapiObj
		};
	} )
	;
}

function searchByUUID(uuid) {
	return search({queryString: uuid});
}

function unixTimeToIsoTime(unixTime){
	const date = new Date(0);
	date.setUTCSeconds(unixTime);
	const isoTime = date.toISOString().replace('.000Z', 'Z');
	return isoTime;
}

function searchUnixTimeRange(afterSecs, beforeSecs, params={} ) {
	// into this form: 2017-05-29T10:00:00Z
	const  afterIsotime = unixTimeToIsoTime( afterSecs);
	const beforeIsotime = unixTimeToIsoTime(beforeSecs);
	const timeConstraints = [
		`lastPublishDateTime:>${afterIsotime}`,
		`lastPublishDateTime:<${beforeIsotime}`
	];

	if (! params.hasOwnProperty('constraints')) {
		params.constraints = [];
	}

	params.constraints = params.constraints.concat( timeConstraints );

	return search( params );
}

module.exports = {
	article,
	searchByUUID,
	searchUnixTimeRange,
};
