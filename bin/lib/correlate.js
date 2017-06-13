// This module makes use of 'node-fetch' to acces SAPI

const debug = require('debug')('bin:lib:correlate');
const fetchContent = require('./fetchContent');

const ONTOLOGY = (process.env.ONTOLOGY)? process.env.ONTOLOGY : 'people';

const    knownEntities = {}; // { entity : articleCount }
const         allCoocs = {}; // [entity1][entity2]=true
let         allIslands = []; // [ {}, {} ]
let allIslandsByEntity = {}; // { entity1 : island1, entity2 : island2, ...}

let  latestBeforeSecs = 0; // most recent update time
let earliestAfterSecs = 0; // oldest update time

const AWeekOfSecs = 604800;

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
	return fetchContent.searchUnixTimeRange(afterSecs, beforeSecs, { ontology: ONTOLOGY })
		.then( searchResponse => searchResponse.sapiObj )
		.then( sapiObj => {
			const deltaEntities = {};
			let numResults;
			if (! sapiObj.results ) {
				debug('getLatestEntitiesMentioned: no results');
			} else if( ! sapiObj.results[0] ) {
				debug('getLatestEntitiesMentioned: no results[0]');
			} else if( ! sapiObj.results[0].facets ) {
				debug('getLatestEntitiesMentioned: no results[0].facets');
			} else {
				numResults = sapiObj.results[0].indexCount;
				sapiObj.results[0].facets.forEach( facet => {
					const ontology = facet.name;
					if (ontology !== ONTOLOGY) { return; }
					facet.facetElements.forEach( element => {
						const entity = `${ontology}:${element.name}`;
						deltaEntities[entity] = element.count;
					});
				});
			}
			logItem('getLatestEntitiesMentioned', { afterSecs: afterSecs, beforeSecs : beforeSecs, numResults: numResults, 'deltaEntities.length' : deltaEntities.length, deltaEntities: deltaEntities });
			return deltaEntities
		})
		.catch( err => {
			console.log( `getLatestEntitiesMentioned: err=${err}` );
		})
		;
}

function getAllEntityFacets(afterSecs, beforeSecs, entities) {
	const entitiesList = Object.keys(entities);
	debug(`getAllEntityFacets: num entities=${entitiesList.length}, entitiesList=${JSON.stringify(entitiesList, null, 2)}`);
	const initialMillis = 100;
	const spreadMillis = 5000; // spread out these fetches to try and avoid a node problem
	const promises = entitiesList.map((entity,index) => {
		const delay = (index / entitiesList.length) * spreadMillis;
		return new Promise( (resolve) => setTimeout(() => resolve(
				fetchContent.searchUnixTimeRange(afterSecs, beforeSecs, { constraints: [entity], ontology: ONTOLOGY } )
				.catch( err => {
					console.log( `getAllEntityFacets: promise for entity=${entity}, err=${err}`);
					return;
				})
			), initialMillis + delay)
		)
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
			return {
				entities,
				entityFacets,
			};
		})
		;
}

function updateAllCoocsAndEntities( entitiesAndFacets ) {
	const entityFacets = entitiesAndFacets.entityFacets;
	const     entities = entitiesAndFacets.entities;
	let countNewEntities = 0;
	let countNewCoocPairs = 0;
	let countCoocPairs = 0;

	for( let entity of Object.keys( entityFacets ) ){
		if (! knownEntities.hasOwnProperty(entity)) {
			knownEntities[entity] = 0;
			countNewEntities++;
		}
		knownEntities[entity] = knownEntities[entity] + entities[entity];

		if ( ! allCoocs.hasOwnProperty(entity)) {
			allCoocs[entity] = {};
		}
		const coocs = entityFacets[entity];
		for( let coocEntity of coocs){
			if (entity == coocEntity) { continue; }

			if ( ! allCoocs.hasOwnProperty(coocEntity)) {
				allCoocs[coocEntity] = {};
			}

			if (! allCoocs[entity].hasOwnProperty(coocEntity)) {
				countNewCoocPairs++;
			}
			countCoocPairs++;

			allCoocs[coocEntity][entity] = true;
			allCoocs[entity][coocEntity] = true;
		}
	}
	debug(`updateAllCoocsAndEntities: countNewEntities=${countNewEntities}`);
	return {
		countNewEntities,
		countNewCoocPairs,
		countCoocPairs,
	};
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
	const possibleIslands = Object.keys(coocs).map(c => { return Object.assign({[c] : true}, coocs[c]) }); // new hashes of each island

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

function linkKnownEntitiesToAllIslands(){
	const islandsByEntity = {};

	allIslands.forEach( island => {
		Object.keys(island).forEach(entity => {
			islandsByEntity[entity] = island;
		});
	});

	allIslandsByEntity = islandsByEntity;
	return islandsByEntity;
}

function updateUpdateTimes(afterSecs, beforeSecs){
	if( latestBeforeSecs == 0 || beforeSecs > latestBeforeSecs ){
		latestBeforeSecs = beforeSecs;
	}
	if ( earliestAfterSecs == 0 || afterSecs < earliestAfterSecs ) {
		earliestAfterSecs = afterSecs;
	}
}

// tie together the fetching of new data, and the post-processing of it
function fetchUpdateCorrelations(afterSecs, beforeSecs) {
	const startInitialSearchMillis = Date.now();
	let startFacetSearchesMillis;
	return getLatestEntitiesMentioned(afterSecs, beforeSecs)
		.then( deltaEntities => {
			startFacetSearchesMillis = Date.now();
			return deltaEntities;
		} )
		.then( deltaEntities     => getAllEntityFacets(afterSecs, beforeSecs, deltaEntities) )
		.then( entitiesAndFacets => {
			const endFacetSearchesMillis = Date.now();
			const newCounts = updateAllCoocsAndEntities(entitiesAndFacets); // updates globals
			updateUpdateTimes(afterSecs, beforeSecs); // only update times after sucessfully doing the update
			// post-processing: re-calc all the islands, and link entities to them
			allIslands = findIslands(allCoocs);
			linkKnownEntitiesToAllIslands();
			const endPostProcessingMillis = Date.now();
			const numDeltaEntities = Object.keys(entitiesAndFacets.entities).length;

			const summaryData = getSummaryData();
			summaryData['delta'] = {
				times : {
					afterSecs,
					afterSecs           : new Date(afterSecs * 1000).toISOString(),
					beforeSecs,
					beforeSecs          : new Date( beforeSecs * 1000).toISOString(),
				  intervalCoveredSecs : (beforeSecs - afterSecs),
					intervalCoveredHrs  : (beforeSecs - afterSecs)/3600,
				},
				counts : {
					numDeltaEntities,
					newEntities : newCounts.countNewEntities,
					coocPairs : newCounts.countCoocPairs,
					newCoocPairs : newCounts.countNewCoocPairs,
					numSapiRequests : numDeltaEntities + 1,
				},
				timings : {
					initialSearchMillis  : (startFacetSearchesMillis - startInitialSearchMillis),
					facetSearchesMillis  : (endFacetSearchesMillis - startFacetSearchesMillis),
					millisPerFacetSearch : Math.round((endFacetSearchesMillis - startFacetSearchesMillis) / ((numDeltaEntities==0)? 1 : numDeltaEntities)),
					postProcessingMillis : (endPostProcessingMillis - endFacetSearchesMillis)
				}
			};
			return summaryData;
		})
		;
}

function fetchUpdateCorrelationsLatest() {
	const    nowSecs = Math.floor( Date.now() / 1000 );
	const beforeSecs = nowSecs;
	const  afterSecs = (latestBeforeSecs == 0)? nowSecs - 3600 : latestBeforeSecs;

	return fetchUpdateCorrelations(afterSecs, beforeSecs);
}

function fetchUpdateCorrelationsEarlier(intervalSecs=0) {
	if (typeof intervalSecs == 'string') {
		intervalSecs = parseInt(intervalSecs);
	} else if (typeof intervalSecs != 'number') {
		throw new Error(`fetchUpdateCorrelationsEarlier: could not handle intervalSecs`);
	}

	if (intervalSecs > AWeekOfSecs || intervalSecs < 0) {
		intervalSecs = AWeekOfSecs;
	}

	const earliestSecs = (earliestAfterSecs == 0)? Math.floor( Date.now() / 1000 ) : earliestAfterSecs;
	const   beforeSecs = earliestSecs;
	const    afterSecs = earliestSecs - intervalSecs;

	return fetchUpdateCorrelations(afterSecs, beforeSecs);
}


// assume there *is* a chain
function findLinks(chainSoFar, bestChain, targetEntity){

	if (bestChain != null && chainSoFar.length >= (bestChain.length -1)) {
		return bestChain;
	}

	const     latest = chainSoFar[chainSoFar.length -1];
	const candidates = Object.keys( allCoocs[latest] );

	for( let candidate of candidates){
		if (candidate == targetEntity) {
			return chainSoFar.concat([candidate]);
		}
	}

	if (bestChain != null && chainSoFar.length >= (bestChain.length -2)) {
		return bestChain;
	}

	for( let candidate of candidates){
		if (! chainSoFar.includes(candidate) ) {
			const chainFound = findLinks(chainSoFar.concat([candidate]), bestChain, targetEntity);
			if (chainFound != null) {
				if (bestChain == null || chainFound.length < bestChain.length) {
					bestChain = chainFound;
				}
			}
		}
	}

	return bestChain;
}

function calcChainBetween(entity1, entity2) {
	let chain = [];

	if (entity1 == entity2) {
		debug(`calcChainBetween: equal entities. entity1=${entity1}`);
	} else if (! knownEntities.hasOwnProperty(entity1) ) {
		debug(`calcChainBetween: unknown entity. entity1=${entity1}`);
	} else if (! knownEntities.hasOwnProperty(entity2) ) {
		debug(`calcChainBetween: unknown entity. entity2=${entity2}`);
	} else if (! allIslandsByEntity[entity1].hasOwnProperty(entity2)) {
		debug(`calcChainBetween: entities not on same island. entity1=${entity1}, entity2=${entity2}`);
	} else {
		chain = findLinks([entity1], null, entity2);
	}

	return {
		entity1,
		entity2,
		chain,
	}
}

function fetchCalcChainWithArticlesBetween(entity1, entity2) {
	const chainDetails = calcChainBetween(entity1, entity2);

	chainDetails['articlesPerLink'] = [];

	// create a promise for each link in the chain,
	// to search for article titles where both entities in the link co-occur.
	// The promises are spread out in time to avoid breaking node.

	const spreadMillis = 100;
	let promises = [];
	chainDetails.chain.forEach((entity,index) => {
		if (index == 0) { return; }
		const prevEntity = chainDetails.chain[index - 1];
		const delay = (index / chainDetails.chain.length) * spreadMillis;
		const promise = new Promise( (resolve) => setTimeout(() => resolve(
				fetchContent.searchUnixTimeRange(earliestAfterSecs, latestBeforeSecs, { constraints : [prevEntity, entity], maxResults : 100,})
				.catch( err => {
					console.log( `getAllEntityFacets: promise for entity=${entity}, err=${err}`);
					return;
				})
			), delay)
		);
		promises.push( promise );
	});

	// process each search result to get the list of titles for each link

	return Promise.all(promises)
	.then( searchResponses => searchResponses.map(sr => {return sr.sapiObj}) )
	.then( sapiObjs => {
		chainDetails['articlesPerLink'] = sapiObjs.map(sapiObj => {
			let articles = [];
			if (! sapiObj.results ) {
				debug('fetchCalcChainWithArticlesBetween: sapiObj: no results');
			} else if( ! sapiObj.results[0] ) {
				debug('fetchCalcChainWithArticlesBetween: sapiObj: no results[0]');
			} else if( ! sapiObj.results[0].results ) {
				debug('fetchCalcChainWithArticlesBetween: sapiObj: no results[0].results');
			} else {
				articles = sapiObj.results[0].results.map(result => {
					return {
						id    : result.id,
						title : result.title.title,
					};
				})
			}
			return articles;
		});
	})
	.then( () => chainDetails )
	;
}


function findAllChainLengths(rootEntity){
	const chainLengths = [{
		   links: 0,
		entities: [rootEntity],
	}];

	const seen = {[rootEntity]: true};

	let lastEntities = chainLengths[0].entities;
	while(lastEntities.length > 0){
	  const nextEntities = [];
		for( let entity of lastEntities ){
			for( let candidate of Object.keys( allCoocs[entity] )){
				if (seen[candidate]) { continue; }
				nextEntities.push(candidate);
				seen[candidate] = true;
			}
		}
		if (nextEntities.length > 0) {
			chainLengths.push({
				   links: chainLengths[chainLengths.length-1].links + 1,
				entities: nextEntities,
			});
		}
		lastEntities = nextEntities;
	}

	return chainLengths;
}

function calcChainLengthsFrom(rootEntity){
	let chainLengths = [];
	if (! knownEntities.hasOwnProperty(rootEntity) ) {
		debug(`calcChainBetween: unknown rootEntity=${rootEntity}`);
	} else {
		chainLengths = findAllChainLengths(rootEntity);
	}

	return {
		rootEntity,
		chainLengths,
	}
}

function calcSoNearliesOnMainIsland(){
	let soNearlies = [];

	if( allIslands.length > 0 ){
		const knownIslanderPairs = {};
		const islanders = Object.keys( allIslands[0] );
		for( let entity1 of islanders ){
			const entity1Coocs = allCoocs[entity1];
			for( let entity2 of islanders ){
				if( entity1 == entity2 ){ continue; }
				if(entity1Coocs.hasOwnProperty(entity2)){ continue; }
				const islanderPair = [entity1, entity2].sort().join('');
				if( knownIslanderPairs[islanderPair]){
					continue;
				} else {
					knownIslanderPairs[islanderPair] = true;
				}
				const intersection = Object.keys(allCoocs[entity2]).filter(e => {return entity1Coocs[e]});
				intersection.sort();
				if (intersection.length > 0) {
					soNearlies.push({
						entity1,
						entity2,
						intersectionList : intersection,
						intersectionSize : intersection.length,
					});
				}
			}
		}
	}

	soNearlies.sort( (a,b) => {
		if      (a.intersectionSize < b.intersectionSize) { return +1; }
		else if (a.intersectionSize > b.intersectionSize) { return -1; }
		else                                              { return  0; }
	})

	return soNearlies;
}

// count how many times each entity appears in the intersection list of the soNearlies
function calcMostBetweenSoNearliesOnMainIsland(sortBy=0){
	const maxSortBy = 2;
	if( sortBy < 0        ) { sortBy = 0; }
	if( sortBy > maxSortBy) { sortBy = maxSortBy; }

	let soNearlies = calcSoNearliesOnMainIsland();
	const middleEntityCounts = {};

	soNearlies.forEach( sn => {
		sn.intersectionList.forEach( entity => {
			if (! middleEntityCounts.hasOwnProperty(entity)) {
				middleEntityCounts[entity] = [0,0,0];
			}
			middleEntityCounts[entity][0] = middleEntityCounts[entity][0] + 1;
			middleEntityCounts[entity][1] = middleEntityCounts[entity][1] + (1/sn.intersectionList.length);
			middleEntityCounts[entity][2] = middleEntityCounts[entity][2] + (1/(sn.intersectionList.length*sn.intersectionList.length));
		})
	});

	let middleEntityCountsList = Object.keys(middleEntityCounts).map(entity => {
		return [
			entity,
			middleEntityCounts[entity]
		];
	});

	middleEntityCountsList.sort( (a,b) => {
		if      (a[1][sortBy] > b[1][sortBy]) { return -1; }
		else if (a[1][sortBy] < b[1][sortBy]) { return +1; }
		else                  { return  0; }
	});
	return {
			'description' : 'looking at entities appear most often in the soNearlies intersections, i.e. are shared connections of entities who otherwise have to shared connections with each other. [count (1 per soNearly intersection), count (divided by length of intersection), count (divided by square of length)]',
			middleEntityCountsList
		};
}

function countAllCoocPairs(){
	let count = 0;
	Object.keys(allCoocs).forEach( entity => { count = count + Object.keys(allCoocs[entity]).length; });
	return count/2;
}

function getSummaryData(){
	const largestIslandSize = (allIslands.length == 0)? 0 : Object.keys(allIslands[0]).length;
	return {
		ONTOLOGY,
		times : {
			 earliestAfterSecs,
			 earliestAfterDate : new Date(earliestAfterSecs * 1000).toISOString(),
		    latestBeforeSecs,
			  latestBeforeDate : new Date( latestBeforeSecs * 1000).toISOString(),
		 intervalCoveredSecs : (latestBeforeSecs - earliestAfterSecs),
			intervalCoveredHrs : (latestBeforeSecs - earliestAfterSecs)/3600,
		},
		counts : {
			knownEntities : Object.keys(knownEntities).length,
			allIslands : allIslands.length,
			largestIslandSize: largestIslandSize,
			numDistinctCoocPairs : countAllCoocPairs(),
		},
	};
}

function getAllData(){
	const data = getSummaryData();
	data[     'knownEntities'] = knownEntities;
	data[          'allCoocs'] = allCoocs;
	data[        'allIslands'] = allIslands;
	data['allIslandsByEntity'] = allIslandsByEntity;

	return data;
}

function getIslandOfEntity(entity){
	if (!entity || ! allIslandsByEntity.hasOwnProperty(entity)) {
		return {};
	} else {
		return allIslandsByEntity[entity];
	}
}

module.exports = {
	fetchUpdateCorrelationsLatest,
	fetchUpdateCorrelationsEarlier,
	knownEntities,
	getIslandOfEntity,
	calcChainBetween,
	calcChainLengthsFrom,
	fetchCalcChainWithArticlesBetween,
	calcSoNearliesOnMainIsland,
	calcMostBetweenSoNearliesOnMainIsland,
	allCoocs    : function(){ return allCoocs; },
	allData     : getAllData,
	allEntities : function(){ return Object.keys( knownEntities ).sort(); },
	allIslands  : function(){ return allIslands; },
	summary     : getSummaryData,
	logbook     : logbook,
	ontology    : function() { return ONTOLOGY; },
};
