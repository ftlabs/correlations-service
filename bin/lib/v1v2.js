const debug = require('debug')('bin:lib:v1v2');
const fetchContent = require('./fetchContent');
const directly     = require('./directly'); 	// trying Rhys' https://github.com/wheresrhys/directly
const V1V2_CONCURRENCE = (process.env.hasOwnProperty('V1V2_CONCURRENCE'))? process.env.V1V2_CONCURRENCE : 4;

const STORE = {}; // {entity : variations}
const STORE_ERRORS = {}; // {entity : variationsWithError}

// 'variations' refers to the assorted values for an entity from v1 and v2

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
	let ontologyWithId, ontologyWithoutId, hadId;
	if (ontology.match(/Id$/)) {
		ontologyWithId = ontology;
		ontologyWithoutId = ontology.replace(/Id$/, '');
		hadId = true;
	} else {
		ontologyWithId = ontology + 'Id';
		ontologyWithoutId = ontology;
		hadId = false;
	}
	let value = entityPieces[1];

	const variations = {
		given : {
			entity,
			ontology,
			ontologyWithId,
			ontologyWithoutId,
			hadId,
			value,
		},
	}

	return fetchContent.v2ApiCall(variations.given.value)
	.then( v2IdDetails => {
		if (! v2IdDetails.hasOwnProperty('prefLabel')) {
			console.log(`WARNING: fetchLatestVariationsOfEntity: entity=${entity}: v2IdDetails=${JSON.stringify(v2IdDetails)}: no v2IdDetails.prefLabel`);
		} else {
			variations['v2PrefLabel'] = v2IdDetails.prefLabel;
			variations['v2Stuff'] = {};
			variations['v2Stuff']['v2IdDetails'] = v2IdDetails;
		}
		if (! variations.hasOwnProperty('v2PrefLabel')) {
			throw `no v2PrefLabel found for entity=${entity}: v2IdDetails=${JSON.stringify(v2IdDetails)}`;
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
	debug(`fetchVariationsOfEntities: entities.length=${entities.length}, entities=${JSON.stringify(entities)}`);
	const entityPromisers = entities.map( entity => {
		return function () {
			return fetchVariationsOfEntityFromCache(entity)
			.catch( err => {
				console.log( `ERROR: fetchVariationsOfEntities: promise for entity=${entity}, err=${err}`);
				return;
			})
			;
		}
	});

	return directly(V1V2_CONCURRENCE, entityPromisers);
}

function fetchPrefLabelsOfEntities( entities ){
	return fetchVariationsOfEntities( entities )
	.then( variationsList => {
		const entityToPrefLabel = {};
		variationsList.map( variation => {
			if ( variation.hasOwnProperty('v2PrefLabel') ) {
				entityToPrefLabel[variation.given.entity] = variation.v2PrefLabel;
			} else {
				const entity = variation.given.entity;
				const entityPieces = entity.split(':');
				const ontology = entityPieces[0];
				const value = entityPieces[1];
				if (! ontology.endsWith('Id')) { // assume the value part of the entity is the prefLabel for if the ontology does not end with 'Id'.
					entityToPrefLabel[entity] = value;
				}
			}
		});

		return entityToPrefLabel;
	})
}

module.exports = {
	fetchVariationsOfEntity : fetchVariationsOfEntityFromCache,
	fetchVariationsOfEntities,
	fetchPrefLabelsOfEntities,
	store        : function() { return STORE; },
	store_errors : function() { return STORE_ERRORS; },
};
