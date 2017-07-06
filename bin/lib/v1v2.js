// This module makes use of 'node-fetch' to acces SAPI

const debug = require('debug')('bin:lib:v1v2');
const fetchContent = require('./fetchContent');

function fetchVariationsOfEntity( entity ){
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
		give : {
			entity,
			ontology,
			ontologyWithId,
			ontologyWithoutId
		},
	};

	return fetchContent.searchByEntityWithFacets(entity)
	.then(searchRes => {
		if (!searchRes.sapiObj) {
			console.log(`ERROR: fetchVariationsOfEntity: entity=${entity}: no searchRes.sapiObj`);
		} else if (!searchRes.sapiObj.results) {
			console.log(`ERROR: fetchVariationsOfEntity: entity=${entity}: no searchRes.sapiObj.results`);
		} else if (!searchRes.sapiObj.results[0].facets) {
			console.log(`ERROR: fetchVariationsOfEntity: entity=${entity}: no searchRes.sapiObj.results[0].facets`);
		} else {
			for( let facet of searchRes.sapiObj.results[0].facets ){
				if( facet.name == ontologyWithId ){
					variations['v1TME'] = facet.facetElements[0].name;
				} else if(facet.name == ontologyWithoutId){
					variations['v1'] = facet.facetElements[0].name;
				}
			}
		}
		return variations;
	})
	;
}

module.exports = {
	fetchVariationsOfEntity
};
