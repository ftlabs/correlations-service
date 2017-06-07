// This module makes use of 'node-fetch' to acces SAPI

const debug = require('debug')('bin:lib:correlate');
const fetchContent = require('./fetchContent');

const ONTOLOGY = 'people';

const knownEntities = {}; // ontology => { "ontology:name" : articleCount }
const      allCoocs = {}; // [entity1][entity2]=true
let      allIslands = [];

const logbook = [];
function logItem( location, obj ){
	const now = Date.now();
	logbook.push( {
		     now : now,
        date : new Date(now).toISOString(),
		location : location,
		    data : obj } );
}

function getLatestEntitiesMentioned(afterSecs, beforeSecs) {
	return fetchContent.searchUnixTimeRange(afterSecs, beforeSecs)
		.then( searchResponse => searchResponse.sapiObj )
		.then( sapiObj => {
			const deltaEntities = {};
			let numResults;
			if (! sapiObj.results ) {
				debug('updateCorrelations: no results');
			} else if( ! sapiObj.results[0] ) {
				debug('updateCorrelations: no results[0]');
			} else if( ! sapiObj.results[0].facets ) {
				debug('updateCorrelations: no results[0].facets');
			} else {
				numResults = sapiObj.results[0].indexCount;
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
			logItem('getLatestEntitiesMentioned', { afterSecs: afterSecs, beforeSecs : beforeSecs, numResults: numResults, 'deltaEntities.length' : deltaEntities.length, deltaEntities: deltaEntities });
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

function compareLengthsLongestFirst(a,b){
	const aLength = Object.keys(a).length;
	const bLength = Object.keys(b).length;
	if (aLength < bLength)      { return  1; }
	else if (aLength > bLength) { return -1; }
	else                        { return  0; }
}

function findIslands(coocs) {
	const checkedIslands = [];
	const possibleIslands = Object.keys(coocs).map(c => { return Object.assign({[c] : c}, coocs[c]) }); // new hashes of each island

	while (possibleIslands.length > 1) {
		let candidateIsland = possibleIslands.pop();
		let foundMatch = false;
		for( let pIsland of possibleIslands ){
			for( let entity of Object.keys(candidateIsland) ){
				if (pIsland.hasOwnProperty(entity)) {
					foundMatch = true;
					Object.assign(pIsland, candidateIsland); // merge candidateIsland into pIsland
					break;
				}
			}
			if (foundMatch) { break; }
		}
		if (!foundMatch) {
			checkedIslands.push(candidateIsland);
		}
	}
	if (possibleIslands.length > 1) {
		throw new Error(`more than 1 possibleIslands remaining. Should be 0 or 1.`);
	} else if (possibleIslands.length == 1){
		checkedIslands.push(possibleIslands[0]);
	}

	return checkedIslands.sort(compareLengthsLongestFirst);
}

function updateCorrelationsToAllCoocs(afterSecs, beforeSecs) {
	return getLatestEntitiesMentioned(afterSecs, beforeSecs)
		.then( deltaEntities => getAllEntityFacets(afterSecs, beforeSecs, deltaEntities) )
		.then(  entityFacets => updateAllCoocs(entityFacets) )
		;
}

function updateCorrelations(afterSecs, beforeSecs) {
	return updateCorrelationsToAllCoocs(afterSecs, beforeSecs)
		.then(         coocs => findIslands(coocs) )
		.then( islands => {
			allIslands = islands;
			return islands;
		})
		// .then( ) // iterate over each island to find merkel chains
		// .then( ) // update main records
		;
}

module.exports = {
	updateCorrelations,
	updateCorrelationsToAllCoocs,
	knownEntities,
	allCoocs : function(){return allCoocs;},
	allData : function(){
		return {
			ONTOLOGY,
			knownEntities,
			allCoocs,
			allIslands,
		};
	},
	logbook : logbook,
};
