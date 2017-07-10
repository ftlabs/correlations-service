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
		if (!variations.hasOwnProperty('v1TME')) {
			throw `no v1 TME found for entity=${entity}`;
		}
		return variations['v1TME'];
	})
	.then( v1TME => fetchContent.tmeIdToV2(v1TME) )
	.then( v2Info => {
		debug( `fetchVariationsOfEntity: v2Info=${JSON.stringify(v2Info)}`);
		variations['v2Id'    ] = v2Info.concordances[0].concept.id;
		variations['v2ApiUrl'] = v2Info.concordances[0].concept.apiUrl;
		variations['v2Stuff'] = { v2Info };
		return variations['v2Id'];
	})
	.then( v2Id => fetchContent.v2ApiCall(variations['v2Id']) )
	.then( v2IdDetails => {
		variations['v2PrefLabel'] = v2IdDetails.prefLabel;
		variations['v2Stuff']['v2IdDetails'] = v2IdDetails;
		return variations;
	})
	.catch( err => {
		variations['error'] = err;
		return variations;
	})
	;
}

module.exports = {
	fetchVariationsOfEntity
};
