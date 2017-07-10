// This module makes use of 'node-fetch' to acces SAPI

const debug = require('debug')('bin:lib:v1v2');
const fetchContent = require('./fetchContent');

const STORE = {}; // {entity : variations}
const STORE_ERRORS = {}; // {entity : variationsWithError}

function fetchVariationsOfEntityFromCache( entity ){

	let promise;

	if (! STORE.hasOwnProperty(entity) && ! STORE_ERRORS.hasOwnProperty( entity )) {

		promise = fetchLatestVariationsOfEntity( entity )
			.then( variations => {
				if (variations.hasOwnProperty('error')) {
					STORE_ERRORS[entity] = variations;
				} else  {
					STORE[entity] = variations;
				}
				debug(`fetchVariationsOfEntityFromCache: cache miss for entity=${entity}`)
			})
			;

	} else {
		promise = new Promise( (resolve) => resolve(
			debug(`fetchVariationsOfEntityFromCache: cache hit for entity=${entity}`)
		) );
	}

	return promise
	.then( () => {
		const variations = (STORE.hasOwnProperty(entity)) ? STORE[entity] : STORE_ERRORS[entity];
		return variations;
	})
	;
}

function fetchLatestVariationsOfEntity( entity ){
	const entityPieces = entity.split(':');
	const ontology = entityPieces[0];
	let ontologyWithId, ontologyWithoutId;
	if (ontology.match(/Id$/)) {
		ontologyWithId = ontology;
		ontologyWithoutId = ontology.replace(/Id$/, '')
	} else {
		ontologyWithId = ontology + 'Id';
		ontologyWithoutId = ontology;
	}

	const variations = {
		given : {
			entity,
			ontology,
			ontologyWithId,
			ontologyWithoutId
		},
	};

	return fetchContent.searchByEntityWithFacets(entity)
	.then(searchRes => {
		if (!searchRes.sapiObj) {
			console.log(`ERROR: fetchLatestVariationsOfEntity: entity=${entity}: no searchRes.sapiObj`);
		} else if (!searchRes.sapiObj.results) {
			console.log(`ERROR: fetchLatestVariationsOfEntity: entity=${entity}: no searchRes.sapiObj.results`);
		} else if (!searchRes.sapiObj.results[0].facets) {
			console.log(`ERROR: fetchLatestVariationsOfEntity: entity=${entity}: no searchRes.sapiObj.results[0].facets`);
		} else {
			for( let facet of searchRes.sapiObj.results[0].facets ){
				if( facet.name == ontologyWithId ){
					variations['v1TME'] = facet.facetElements[0].name;
				} else if(facet.name == ontologyWithoutId){
					variations['v1'] = facet.facetElements[0].name;
				}
			}
		}
		if (!variations.hasOwnProperty('v1TME')) {
			throw `no v1 TME found for entity=${entity}, searchRes=${JSON.stringify(searchRes)}`;
		}
		return variations['v1TME'];
	})
	.then( v1TME => fetchContent.tmeIdToV2(v1TME) )
	.then( v2Info => {
		debug( `fetchLatestVariationsOfEntity: v2Info=${JSON.stringify(v2Info)}`);
		if (!v2Info.hasOwnProperty('concordances')) {
			console.log(`ERROR: fetchLatestVariationsOfEntity: v2Info=${JSON.stringify(v2Info)}: no v2Info.concordances`);
		} else if (!v2Info.concordances.length > 0) {
			console.log(`ERROR: fetchLatestVariationsOfEntity: v2Info=${JSON.stringify(v2Info)}: v2Info.concordances.length ! > 1`);
		} else if (!v2Info.concordances[0].hasOwnProperty('concept') ) {
			console.log(`ERROR: fetchLatestVariationsOfEntity: v2Info=${JSON.stringify(v2Info)}: no v2Info.concordances[0].concept`);
		}  else if (!v2Info.concordances[0].concept.hasOwnProperty('id') ) {
			console.log(`ERROR: fetchLatestVariationsOfEntity: v2Info=${JSON.stringify(v2Info)}: no v2Info.concordances[0].concept.id`);
		} else {
			variations['v2Id'    ] = v2Info.concordances[0].concept.id;
			variations['v2ApiUrl'] = v2Info.concordances[0].concept.apiUrl;
			variations['v2Stuff'] = { v2Info };
		}
		if( !variations.hasOwnProperty('v2Id')) {
			throw `no v2Id found for v2Info=${JSON.stringify(v2Info)}`;
		}

		return variations['v2Id'];
	})
	.then( v2Id => fetchContent.v2ApiCall(variations['v2Id']) )
	.then( v2IdDetails => {
		if (! v2IdDetails.hasOwnProperty('prefLabel')) {
			console.log(`ERROR: fetchLatestVariationsOfEntity: v2IdDetails=${JSON.stringify(v2IdDetails)}: no v2IdDetails.prefLabel`);
		} else {
			variations['v2PrefLabel'] = v2IdDetails.prefLabel;
			variations['v2Stuff']['v2IdDetails'] = v2IdDetails;
		}
		if (! variations.hasOwnProperty('v2PrefLabel')) {
			throw `no v2PrefLabel found for v2IdDetails=${JSON.stringify(v2IdDetails)}`;
		}
		return variations;
	})
	.catch( err => {
		variations['error'] = err;
		return variations;
	})
	;
}

function fetchVariationsOfEntities( entities ){
	debug(`fetchVariationsOfEntities: entities=${JSON.stringify(entities)}`);
	const promises = [];
	const spreadMillis = 5000;

	entities.forEach((entity,index) => {
		const delay = (index / entities.length) * spreadMillis;
		const promise = new Promise( (resolve) => setTimeout(() => resolve(
				fetchVariationsOfEntityFromCache(entity)
			), delay)
		);
		promises.push( promise );
	});

	return Promise.all(promises);
}

module.exports = {
	fetchVariationsOfEntity : fetchVariationsOfEntityFromCache,
	fetchVariationsOfEntities,
	store        : function() { return STORE; },
	store_errors : function() { return STORE_ERRORS; },
};
