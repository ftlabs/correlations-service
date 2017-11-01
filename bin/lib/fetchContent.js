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
		    aspects : [ "title",  "lifecycle", "images"], // [ "title", "location", "summary", "lifecycle", "metadata"],
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

	queryString = queryString + ' and brand:-\"FirstFT\"'; // override to ensure we don't get firstFT articles (which are ARTICLES not BLOGS)

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
         "curations" : [ "ARTICLES" ] // dropping "BLOGS" to ensure more useful correlations
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

	return fetchResText(capiUrl)
	.then( text  => JSON.parse(text) )
	;
}

const CACHED_ARTICLE_IMAGE_URLS = {};

function articleImageUrl(uuid){
	// lookup the full article details,
	// then just return the image details: mainImage.members[0].binaryUrl

	if (CACHED_ARTICLE_IMAGE_URLS.hasOwnProperty( uuid )) {
		const imageUrl = CACHED_ARTICLE_IMAGE_URLS[uuid];
		debug(`articleImageUrl: uuid=${uuid}: cache hit: imageUrl=${imageUrl}`);
		return Promise.resolve( imageUrl );
	}

	return article(uuid)
	.then( json => {
			let imageUrl = null;
			if (! json.mainImage ) {
				debug(`articleImageUrl: uuid=${uuid}: no mainImage` );
			} else if (! json.mainImage.members) {
				debug(`articleImageUrl: uuid=${uuid}: no mainImage.members`);
			} else if (json.mainImage.members.length == 0) {
				debug(`articleImageUrl: uuid=${uuid}: empty mainImage.members`);
			} else if (! json.mainImage.members[0].binaryUrl) {
				debug(`articleImageUrl: uuid=${uuid}: no json.mainImage.members[0].binaryUrl`);
			} else {
				debug(`articleImageUrl: uuid=${uuid}: cache miss: imageUrl=${imageUrl}`);
				imageUrl = json.mainImage.members[0].binaryUrl;
			}
			CACHED_ARTICLE_IMAGE_URLS[uuid] = imageUrl
			return imageUrl;
	});
}

const FetchTimings = {};

function recordFetchTiming( method, timing, resOk, status, statusText ){
	if (!FetchTimings.hasOwnProperty(method)) {
		FetchTimings[method] = [];
	}
	FetchTimings[method].push({
		timing,
		resOk,
		status,
		statusText
	});
}

function summariseFetchTimings(history){
	const summary = {};
	Object.keys(FetchTimings).forEach( method => {
		const totalCount = FetchTimings[method].length;
		history = (history)? history : totalCount;
		const recentFew = FetchTimings[method].slice(- history)
		const count = recentFew.length;
		let statusesNotOk = [];
		let numOk = 0;
		let numNotOk = 0;
		let sum = 0;
		let max = 0;
		let min = -1;
		recentFew.forEach( item => {
			if (item.resOk) {
				numOk = numOk + 1;
			} else {
				numNotOk = numNotOk + 1;
				statusesNotOk.push({ status: item.status, statusText: item.statusText});
			}

			sum = sum + item.timing
			max = Math.max(max, item.timing);
			min = (min == -1)? item.timing : Math.min(min, item.timing);
		});
		summary[method] = {
			totalCount : FetchTimings[method].length,
			count,
			mean : sum / count,
			max,
			min,
			numOk,
			numNotOk,
			statusesNotOk,
		};
	});

	return summary;
}

function fetchWithTiming(url, options={}) {
	const startMillis = Date.now();
	return fetch(url, options)
	.then( res => {
		const endMillis = Date.now();
		const timing = endMillis - startMillis;
		return { res, timing };
	})
}

function fetchResText(url, options){
	return fetchWithTiming(url, options)
	.then(resWithTiming => {
		const method = (options && options.method == 'POST')? 'POST' : 'GET';
		const res = resWithTiming.res;
		const resOk = (res && res.ok);
		const timing = resWithTiming.timing;
		recordFetchTiming( method, timing, resOk, res.status, res.statusText);
		if(resOk){
			return res;
		} else {
			throw new Error(`fetchResText: res not ok: res.status=${res['status']}, res.statusText=${res['statusText']}, url=${url}, options=${JSON.stringify(options)}`);
		}
	})
	.then( res  => res.text() )
	;
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

	return fetchResText(sapiUrl, options)
	.then( text => {
		let sapiObj;
		try {
		 	sapiObj = JSON.parse(text);
		}
		catch( err ){
			throw new Error(`JSON.parse: err=${err},
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
		return { params }; // NB, no sapiObj...
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
		queryString: rephraseEntityForQueryString(entity),
		ontology: pieces[0],
	});
}

function tmeIdToV2( tmeId ){
	const url = tmeIdToV2Url( tmeId );
	debug(`tmeIdToV2: tmeId=${tmeId}, url=${url}`);
	return fetchResText(url)
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

function v2ApiCall( apiUrl ){
	const url = `${apiUrl}?apiKey=${CAPI_KEY}`;
	debug(`v2ApiCall: url=${url}`);
	return fetchResText(url)
	.then( text => {
		debug(`v2ApiCall: text=${text}`);
		return text;
	})
	.then( text  => JSON.parse(text) )
	.catch( err => {
		debug(`v2ApiCall: err=${err}`);
	})
	;
}

module.exports = {
	article,
	articleImageUrl,
	searchByUUID,
	searchUnixTimeRange,
	searchByEntityWithFacets,
	tmeIdToV2,
	v2ApiCall,
	summariseFetchTimings,
};
