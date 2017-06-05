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
		.then( sapiObj => { return knownEntities; })
		;
}

module.exports = {
	updateCorrelations,
	knownEntities,
};
