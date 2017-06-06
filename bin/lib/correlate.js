// This module makes use of 'node-fetch' to acces SAPI

const debug = require('debug')('bin:lib:correlate');

const fetchContent = require('./fetchContent');

const ONTOLOGY = 'people';

const knownEntities = {
	'testOntology' : {
		'testOntology:name1' : 1,
		'testOntology:name2' : 10
	}
}; // ontology => { "ontology:name" : articleCount }

const allCoocs = {};

function getLatestEntitiesMentioned(afterSecs, beforeSecs) {
	return fetchContent.searchUnixTimeRange(afterSecs, beforeSecs)
		.then( searchResponse => searchResponse.sapiObj )
		.then( sapiObj => {
			const deltaEntities = {};
			if (! sapiObj.results ) {
				debug('updateCorrelations: no results');
			} else if( ! sapiObj.results[0] ) {
				debug('updateCorrelations: no results[0]');
			} else if( ! sapiObj.results[0].facets ) {
				debug('updateCorrelations: no results[0].facets');
			} else {
				sapiObj.results[0].facets.forEach( facet => {
					const ontology = facet.name;
					if (! knownEntities.hasOwnProperty(ontology)) {
						knownEntities[ontology] = {};
					}
					deltaEntities[ontology] = {};
					const ontologyEntities = knownEntities[ontology];
					facet.facetElements.forEach( element => {
						const entity = `${ontology}:${element.name}`;
						if (! ontologyEntities.hasOwnProperty(entity)) {
							ontologyEntities[entity] = 0;
						}
						ontologyEntities[entity] = ontologyEntities[entity] + element.count;
						deltaEntities[ontology][entity] = element.count;
					});
				});
			}
			return deltaEntities
		})
		;
}

function getAllEntityFacets(afterSecs, beforeSecs, entities) {
	if (! entities.hasOwnProperty(ONTOLOGY)) {
		entities[ONTOLOGY] = {};
	}
	debug(`getAllEntityFacets: num ${ONTOLOGY} entities=${Object.keys(entities[ONTOLOGY]).length}`);
	const promises = Object.keys(entities[ONTOLOGY]).map(entity => {
		return fetchContent.searchUnixTimeRange(afterSecs, beforeSecs, { constraints: [entity] } )
	});

	return Promise.all(promises)
		.then( searchResponses => {
			const entityFacets = {};
			for( let searchResponse of searchResponses ){
				const targetEntity = searchResponse.params.constraints[0];
				const      sapiObj = searchResponse.sapiObj;

				if (! sapiObj.results ) {
					debug('getAllEntityFacets: no results');
				} else if( ! sapiObj.results[0] ) {
					debug('getAllEntityFacets: no results[0]');
				} else if( ! sapiObj.results[0].facets ) {
					debug('getAllEntityFacets: no results[0].facets');
				} else {
					entityFacets[targetEntity] = [];
					for( let facet of sapiObj.results[0].facets ){
						const ontology = facet.name;
						if (ontology !== ONTOLOGY) { continue; }
						for( let element of facet.facetElements) {
							const entity = `${ontology}:${element.name}`;
							if( entity == targetEntity ) { continue; }
							entityFacets[targetEntity].push(entity);
						}
					}
				}
			}
			return entityFacets;
		})
		;
}

function updateAllCoocs( entityFacets ) {
	let countNewEntities = 0;

	for( let entity of Object.keys( entityFacets ) ){
		if ( ! allCoocs.hasOwnProperty(entity)) {
			allCoocs[entity] = {};
			countNewEntities++;
		}
		const coocs = entityFacets[entity];
		for( let coocEntity of coocs){
			if ( ! allCoocs.hasOwnProperty(coocEntity)) {
				allCoocs[coocEntity] = {};
				countNewEntities++;
			}
			allCoocs[coocEntity][entity] = true;
			allCoocs[entity][coocEntity] = true;
		}
	}
	debug(`updateAllCoocs: countNewEntities=${countNewEntities}`);
	return allCoocs;
}

function updateCorrelations(afterSecs, beforeSecs) {
	return getLatestEntitiesMentioned(afterSecs, beforeSecs)
		.then( deltaEntities => getAllEntityFacets(afterSecs, beforeSecs, deltaEntities) )
		.then(  entityFacets => updateAllCoocs(entityFacets) )
		// .then( ) // loop over each new pair of entities, to get all titles
		// .then( ) // iterate over pairs of entities to find connected islands
		// .then( ) // iterate over each island to find merkel chains
		// .then( ) // update main records
		;
}

module.exports = {
	updateCorrelations,
	knownEntities,
	allCoocs : function(){return allCoocs;},
};
