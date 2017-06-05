// This module makes use of 'node-fetch' to acces SAPI

const debug = require('debug')('bin:lib:correlate');

const fetchContent = require('./fetchContent');

const knownEntities = {
	'testOntology' : {
		'testOntology:name1' : 1,
		'testOntology:name2' : 10
	}
}; // ontology => { "ontology:name" : articleCount }

function updateCorrelations(afterSecs, beforeSecs) {
	return fetchContent.searchUnixTimeRange(afterSecs, beforeSecs)
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
		// .then( ) // loop over each new entity, to get all facets
		// .then( ) // loop over each new pair of entities, to get all titles
		// .then( ) // iterate over pairs of entities to find connected islands
		// .then( ) // iterate over each island to find merkel chains
		// .then( ) // update main records
		;
}

module.exports = {
	updateCorrelations,
	knownEntities,
};
