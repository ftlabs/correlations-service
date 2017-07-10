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

const CONCORDANCES_PATH = 'http://api.ft.com/concordances';
function tmeIdToV2Url( tmeId ){
	return `${CONCORDANCES_PATH}?identifierValue=${tmeId}&authority=http://api.ft.com/system/FT-TME&apiKey=${CAPI_KEY}`;
}

// NB: should only match basic ontology values, maybe with Id suffix, e.g. people and peopleId,
// and *not* other constraint fields such as lastPublishDateTime
const EntityRegex = /^([a-z]+(?:Id)?):(.+)$/;
function rephraseEntityForQueryString(item){
	const match = EntityRegex.exec(item);
	if (match) {
		return match[1] + ':\"' + match[2] + '\"';
	} else {
		return item;
	}
}

// const valid facetNames = [
//   "authors",
//   "authorsId",
//   "brand",
//   "brandId",
//   "category",
//   "format",
//   "genre",
//   "genreId",
//   "icb",
//   "icbId",
//   "iptc",
//   "iptcId",
//   "organisations",
//   "organisationsId",
//   "people",
//   "peopleId",
//   "primarySection",
//   "primarySectionId",
//   "primaryTheme",
//   "primaryThemeId",
//   "regions",
//   "regionsId",
//   "sections",
//   "sectionsId",
//   "specialReports",
//   "specialReportsId",
//   "subjects",
//   "subjectsId",
//   "topics",
//   "topicsId"
// ];

function constructSAPIQuery( params ) {

	const defaults = {
		queryString : "",
	   maxResults : 1,
		     offset : 0,
		    aspects : [ "title",  "lifecycle"], // [ "title", "location", "summary", "lifecycle", "metadata"],
		constraints : [],
		   ontology : "people",
	};

	const combined = Object.assign({}, defaults, params);

	let queryString = combined.queryString;
	if (queryString == '' && combined.constraints.length > 0 ) {
		// NB: not promises...
		queryString = combined
		.constraints
		.map(c => { return rephraseEntityForQueryString(c); })
		.join(' and ');
	}

	// for whichever ontology we pick,
	// make sure we have the with and without Id variations for the facets.
	const facets = [combined.ontology];
	if (combined.ontology.match(/Id$/)) {
		facets.push( combined.ontology.replace(/Id$/, ''));
	} else {
		facets.push( combined.ontology + 'Id' );
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
			    "facets" : {"names":facets, "maxElements":-1}
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

const MAX_ATTEMPTS = 5;

function makeFetchAttempts(address, options, attempt = 0){
  if(attempt < MAX_ATTEMPTS){
    return new Promise( (resolve, reject) => {
      fetch(address, options)
      .then(res => {
        if(res && res.ok){
          return res;
        } else {
					console.log(`ERROR: makeFetchAttempts: res not fab: attempt=${attempt}, options=${JSON.stringify(options)}`);
          makeFetchAttempts(address, options, attempt + 1)
            .then(result => resolve(result))
          ;
        }
      })
      .then(res => resolve(res) )
			.catch( err => {
				console.log(`ERROR: makeFetchAttempts: catch: attempt=${attempt}, options=${JSON.stringify(options)}`);
				makeFetchAttempts(address, options, attempt + 1)
					.then(result => resolve(result))
				;
			})
    })
  } else {
      return Promise.reject(`makeFetchAttempts: Request failed too many times(${MAX_ATTEMPTS})`);
  }
}

function search(params) {
	const sapiUrl = `${SAPI_PATH}?apiKey=${CAPI_KEY}`;
	const sapiQuery = constructSAPIQuery( params );
	const options = {
		 method: 'POST',
       body: JSON.stringify(sapiQuery),
		headers: {
			'Content-Type' : 'application/json',
		}
	};
	debug(`search: sapiQuery=${JSON.stringify(sapiQuery)}`);

	return makeFetchAttempts(sapiUrl, options)
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
	.catch( err => {
		console.log(`ERROR: search: err=${err}.`);
	})
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

function searchByEntityWithFacets( entity ){
	const pieces = entity.split(':');
	return search({
		queryString: entity,
		ontology: pieces[0],
	});
}

function tmeIdToV2( tmeId ){
	const url = tmeIdToV2Url( tmeId );
	debug(`tmeIdToV2: tmeId=${tmeId}, url=${url}`);
	return fetch(url)
	.then( res   => res.text() )
	.then( text => {
		debug(`tmeIdToV2: text=${text}`);
		return text;
	})
	.then( text  => JSON.parse(text) )
	.catch( err => {
		debug(`tmeIdToV2: err=${err}`);
	})
	;
}

module.exports = {
	article,
	searchByUUID,
	searchUnixTimeRange,
	searchByEntityWithFacets,
	tmeIdToV2,
};
