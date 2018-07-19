const debug = require('debug')('bin:lib:correlate');
const fetchContent = require('./fetchContent');
const v1v2         = require('./v1v2'); // obtain all the CAPI v1 and v2 variants of an entity
const directly     = require('./directly'); 	// trying Rhys' https://github.com/wheresrhys/directly.
						// You pass 'directly' a list of fns, each of which generates a promise.
						// The fn calls are throttled.

const ONTOLOGY = (process.env.ONTOLOGY)? process.env.ONTOLOGY : 'people';
const FACETS_CONCURRENCE = (process.env.hasOwnProperty('FACETS_CONCURRENCE'))? process.env.FACETS_CONCURRENCE : 4;
const CAPI_CONCURRENCE   = (process.env.hasOwnProperty('CAPI_CONCURRENCE'  ))? process.env.CAPI_CONCURRENCE   : 4;

const DEFAULT_DELAY_MILLIS = 20;
const FACETS_DELAY_MILLIS = (process.env.hasOwnProperty('FACETS_DELAY_MILLIS'))? process.env.FACETS_DELAY_MILLIS : DEFAULT_DELAY_MILLIS;
const CAPI_DELAY_MILLIS   = (process.env.hasOwnProperty('CAPI_DELAY_MILLIS'  ))? process.env.CAPI_DELAY_MILLIS   : DEFAULT_DELAY_MILLIS;

const UUID_REGEX = /^[0-9a-f]+(-[0-9a-f]+)+$/;

const    knownEntities = {}; // { entity : articleCount }
const         allCoocs = {}; // [entity1][entity2]=true
let         allIslands = []; // [ {}, {}, ... ]
let allIslandsByEntity = {}; // { entity1 : island1, entity2 : island2, ...}
let soNearliesOnMainIsland = []; // [ {}, {}, ... ]
let soNearliesOnMainIslandByEntity = {}; // [entity1]={ byEntity: {entity2: [entities]}, byOverlap: {int : {entities}} }
const entityPrefLabels = {};

let biggestIsland = [];

let newlyAppearedEntities = [];

let  latestBeforeSecs = 0; // most recent update time
let earliestAfterSecs = 0; // oldest update time

const ignoreEntities = {
	'topics:Audio articles' : true,
};

const AWeekOfSecs = 604800;
const MAX_INTERVAL_SECS = AWeekOfSecs * 2;
debug(`startup: MAX_INTERVAL_SECS=${MAX_INTERVAL_SECS}`);

const logbook = [];
function logItem( location, obj ){
	const now = Date.now();
	logbook.push( {
		     now : now,
        date : new Date(now).toISOString(),
		location : location,
		    data : obj } );
}

// prefix each promiser with a new Promise which starts with a timeout
function delayPromisers(promisers, delayMillis=DEFAULT_DELAY_MILLIS){
	return promisers.map(p => {
		return function() {
			return new Promise((resolve) => {
				setTimeout( () => { resolve( p() ); }, delayMillis);
			})
			;
		};
	});
}

function delayedDirectly( concurrence, promisers, delayMillis=DEFAULT_DELAY_MILLIS){
	const delayedPromisers = delayPromisers( promisers, delayMillis);
	return directly(concurrence,  delayedPromisers);
}

function getLatestEntitiesMentioned(afterSecs, beforeSecs) {
	return fetchContent.searchUnixTimeRange(afterSecs, beforeSecs, { ontology: ONTOLOGY })
		.then( searchResponse => searchResponse.sapiObj )
		.then( sapiObj => {
			const deltaEntities = {};
			let numResults;
			if( ! sapiObj ) {
				debug('getLatestEntitiesMentioned: no sapiObj');
			} else if (! sapiObj.results ) {
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
						if ( ontology.endsWith('Id') && ! element.name.match(UUID_REGEX) ) {
							// console.log(`DEBUG: correlate.getLatestEntitiesMentioned: discarding element=${JSON.stringify(element,null,2)}`);
							return; // only accept <ontology>Id names which are in UUID form
						}
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
	const entitiesList = Object.keys(entities).filter(entity => { return !ignoreEntities[entity]; });
	debug(`getAllEntityFacets: entitiesList.length=${entitiesList.length}, entitiesList=${JSON.stringify(entitiesList, null, 2)}`);

	const entityPromisers = entitiesList.map( entity => {
		return function () {
			return fetchContent.searchUnixTimeRange(afterSecs, beforeSecs, { constraints: [entity], ontology: ONTOLOGY } )
					.catch( err => {
						console.log( `ERROR: getAllEntityFacets: promise for entity=${entity}, err=${err}`);
						return;
					})
					;
		};
	});

	return delayedDirectly(FACETS_CONCURRENCE, entityPromisers, FACETS_DELAY_MILLIS)
		.then( searchResponses => {
			const entityFacets = {};
			for( let searchResponse of searchResponses ){
				const targetEntity = searchResponse.params.constraints[0];
				const      sapiObj = searchResponse.sapiObj;

				if (! sapiObj ) {
					debug('getAllEntityFacets: no sapiObj');
				} else if (! sapiObj.results ) {
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
							if ( ontology.endsWith('Id') && ! element.name.match(UUID_REGEX) ) { continue; }
							const entity = `${ontology}:${element.name}`;
							if( entity == targetEntity ) { continue; }
							if( ignoreEntities[entity] ) { continue; }
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

	Object.assign( entityPrefLabels, entitiesAndFacets.v2PrefLabels );

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

	// convert the 'true' value to the count for each entity
	checkedIslands.forEach( island => {
		Object.keys( island ).forEach( k => {
			island[k] = knownEntities[k];
		});
	});

	return checkedIslands.sort(compareLengthsLongestFirst);
}

function linkKnownEntitiesToAllIslands(){
	const islandsByEntity = {};

	allIslands.forEach( island => {
		Object.keys(island).forEach(entity => {
			islandsByEntity[entity] = island;
		});
	});

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

function checkAllCoocsForSymmetryProblems(){
	const problems = [];
	let countPairs = 0;

	const entities = Object.keys(knownEntities);
	for(let e1 of entities){
		if(! allCoocs.hasOwnProperty(e1)) {
			problems.push(`no entry for ${e1} in allCoocs}`);
			continue;
		}
		for(let e2 of entities){
			if( e1 === e2 ) { continue; }
			countPairs ++;

			if(! allCoocs.hasOwnProperty(e2)) {
				problems.push(`no entry for ${e2} in allCoocs}`);
				continue;
			}
			if(allCoocs[e1].hasOwnProperty(e2)) {
				if (! allCoocs[e2].hasOwnProperty(e1)) {
					problems.push(`${e1} knows about ${e2}, but not vice-versa`);
				}
			} else if (allCoocs[e2].hasOwnProperty(e1)) {
				problems.push(`${e2} knows about ${e1}, but not vice-versa`);
			}
		}
	}

	for( let e1 of Object.keys(allCoocs) ) {
		if (! knownEntities.hasOwnProperty(e1)) {
			problems.push(`allCoocs key, ${e1}, not in knownEntities`);
			continue;
		}

		for( let e2 of Object.keys(allCoocs[e1]) ) {
			countPairs ++;
			if (e1 === e2) {
				problems.push(`allCoocs: self-cooc for ${e1}`);
			}

			if ( ! knownEntities.hasOwnProperty(e2)) {
				problems.push(`allCoocs[${e1}] key, ${e2}, knownEntities`);
			}
		}
	}

	debug(`checkAllCoocsForSymmetryProblems: countPairs=${countPairs}`);

	return problems;
}

function calcIslandSortedByCount(island){
	const islanders = Object.keys(island).map( key => { return [key, island[key]]; } );
	islanders.sort( (a,b) => {
		if     ( a[1] < b[1] ) { return +1; }
		else if( a[1] > b[1] ) { return -1; }
		else                   { return  0; }
	});
	return islanders;
}

function fetchNewlyAppearedEntities(){
	// do a facet search for the previous week (using earliestAfterSecs)
	// look for entities not in that week but which are in the knownEntities,
	// hence newEntities

	const  afterSecs = earliestAfterSecs - (60 * 60 * 24 * 7); // i.e. one week before prev oldest
	const beforeSecs = earliestAfterSecs;

	return getLatestEntitiesMentioned(afterSecs, beforeSecs)
		.then( deltaEntities => {
			const newEntitiesWithCount = Object.keys(knownEntities)
			.filter(entity => {
				return ! deltaEntities.hasOwnProperty(entity);
			})
			.map( entity => {
				return [entity, knownEntities[entity] ];
			});
			newEntitiesWithCount.sort( (a,b) => {
				if     ( a[1] > b[1] ) { return -1; }
				else if( a[1] < b[1] ) { return +1; }
				else                   { return  0; }
			});

			newlyAppearedEntities = newEntitiesWithCount;
			return newEntitiesWithCount;
		} )
		;
}

// tie together the fetching of new data, and the post-processing of it
function fetchUpdateCorrelations(afterSecs, beforeSecs) {
	console.log(`fetchUpdateCorrelations: afterSecs=${afterSecs}, beforeSecs=${beforeSecs}`);
	const startInitialSearchMillis = Date.now();
	let startFacetSearchesMillis;
	let endFacetSearchesMillis;
	let startVariationsMillis;
	let endVariationsMillis;
	let startNewlyAppearedMillis;
	let endNewlyAppearedMillis;
	let startUpdatesMillis;
	let endUpdatesMillis;
	let startPostProcessingMillis;
	let endPostProcessingMillis;
	let entitiesAndFacets;

	return getLatestEntitiesMentioned(afterSecs, beforeSecs)
		.then( deltaEntities => {
			console.log(`fetchUpdateCorrelations: num deltaEntities=${Object.keys(deltaEntities).length}, deltaEntities=${JSON.stringify(deltaEntities, null, 2)}`);

			startFacetSearchesMillis = Date.now();
			return getAllEntityFacets(afterSecs, beforeSecs, deltaEntities)
			.then( entitiesAndFacetsSnapshot => {
				entitiesAndFacets = entitiesAndFacetsSnapshot;
				endFacetSearchesMillis = Date.now();
				return entitiesAndFacetsSnapshot;
			})
			;
		} )
		.then( entitiesAndFacetsSnapshot => {
			startVariationsMillis = Date.now();
		 	return v1v2.fetchVariationsOfEntities(Object.keys(entitiesAndFacets.entities))
			.then( variationsOfEntities => {
				endVariationsMillis = Date.now();

				const entityToPrefLabel = {}; // distill prefLabel details
				variationsOfEntities.map( variation => {
					if (variation.hasOwnProperty('v2PrefLabel')) {
						entityToPrefLabel[variation.given.entity] = variation.v2PrefLabel;
					}
				});

				entitiesAndFacets['v2Details'] = variationsOfEntities;
				entitiesAndFacets['v2PrefLabels'] = entityToPrefLabel;

				return variationsOfEntities;
			})
			;
		})
		.then( variationsOfEntities => {
			startUpdatesMillis = Date.now();
			const newCounts = updateAllCoocsAndEntities(entitiesAndFacets); // updates globals
			const symmetryProblems = checkAllCoocsForSymmetryProblems();
			if (symmetryProblems.length > 0) {
				console.log(`ERROR: fetchUpdateCorrelations: symmetryProblems: ${JSON.stringify(symmetryProblems, null, 2)}`);
			} else {
			 	debug(`fetchUpdateCorrelations: no symmetryProblems found`);
		 	}
			updateUpdateTimes(afterSecs, beforeSecs); // only update times after sucessfully doing the update
			endUpdatesMillis = Date.now();
			return newCounts;
		} )
		.then( newCounts => {
			startNewlyAppearedMillis = Date.now();
			return fetchNewlyAppearedEntities()
			.then( newEntities => {
				endNewlyAppearedMillis = Date.now();
				return newCounts;
			})
			;
		})
		.then( newCounts => {
			startPostProcessingMillis = Date.now();
			// post-processing: re-calc all the islands, and link entities to them
			allIslands         = findIslands(allCoocs);
			allIslandsByEntity = linkKnownEntitiesToAllIslands();
			soNearliesOnMainIsland = calcSoNearliesOnMainIslandImpl();
			soNearliesOnMainIslandByEntity = calcSoNearliesOnMainIslandByEntity();
			biggestIsland = calcIslandSortedByCount( (allIslands.length > 0)? allIslands[0] : [] );

			endPostProcessingMillis = Date.now();
			const numDeltaEntities = Object.keys(entitiesAndFacets.entities).length;

			const summaryData = getSummaryData();
			const delta = {
				times : {
					afterSecs,
					afterSecsDate       : new Date(afterSecs * 1000).toISOString(),
					beforeSecs,
					beforeSecsDate      : new Date( beforeSecs * 1000).toISOString(),
				  intervalCoveredSecs : (beforeSecs - afterSecs),
					intervalCoveredHrs  : (beforeSecs - afterSecs)/3600,
				},
				counts : {
					numDeltaEntities,
					newEntities : newCounts.countNewEntities,
					coocPairs : newCounts.countCoocPairs,
					newCoocPairs : newCounts.countNewCoocPairs,
					numSapiRequests : numDeltaEntities + 2,
					numNewlyAppearedEntities : newlyAppearedEntities.length,
				},
				timings : {
					initialSearchMillis  : (startFacetSearchesMillis - startInitialSearchMillis),
					facetSearchesMillis  : (endFacetSearchesMillis   - startFacetSearchesMillis),
					millisPerFacetSearch : Math.round((endFacetSearchesMillis - startFacetSearchesMillis) / ((numDeltaEntities==0)? 1 : numDeltaEntities)),
					variationsMillis     : (endVariationsMillis      - startVariationsMillis),
					updatesMillis        : (endUpdatesMillis         - startUpdatesMillis),
					newlyAppearedMillis  : (endNewlyAppearedMillis   - startNewlyAppearedMillis),
					postProcessingMillis : (endPostProcessingMillis  - startPostProcessingMillis),
				}
			};

			summaryData['delta'] = delta;
			console.log(`fetchUpdateCorrelations: delta=${JSON.stringify(delta, null, 2)}`);

			fetchContent.flushAllCaches();

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

	if (intervalSecs > MAX_INTERVAL_SECS || intervalSecs < 0) {
		intervalSecs = MAX_INTERVAL_SECS;
	}

	const earliestSecs = (earliestAfterSecs == 0)? Math.floor( Date.now() / 1000 ) : earliestAfterSecs;
	const   beforeSecs = earliestSecs;
	const    afterSecs = earliestSecs - intervalSecs;

	return fetchUpdateCorrelations(afterSecs, beforeSecs);
}


// Assume there *is* a chain.
// Loop over each of the coocs of the latest entity in the chainsofar,
// cutting a branch as soon as it is not possible to improve the bestChain.

function findLinks(chainSoFar, targetEntity, bestChain=null, maxLength=null){
	if (maxLength == null) {
		maxLength = calcChainLengthsFrom(targetEntity).chainLengths.length;
	}

	if (bestChain != null && chainSoFar.length >= (bestChain.length -1)) {
		return bestChain;
	}

	if (chainSoFar.length >= maxLength) {
		return bestChain;
	}

	const     latest = chainSoFar[chainSoFar.length -1];
	const candidates = Object.keys( allCoocs[latest] );

	// console.log(`DEBUG: findLinks: latest=${latest}, chainSoFar.length=${chainSoFar.length}, candidates.length=${candidates.length}, bestChain.length=${(bestChain == null)? 0 : bestChain.length}`);

	for( let candidate of candidates){
		if (candidate == targetEntity) {
			return chainSoFar.concat([candidate]);
		}
	}

	if (bestChain != null && chainSoFar.length >= (bestChain.length -2)) {
		return bestChain;
	}

	for( let candidate of candidates){
		if (chainSoFar.includes(candidate) ) {
			continue;
		}

		// Check that we are not returning to a cooc of something already in the chainSoFar.
		if (chainSoFar.length > 2) {
			let alreadyCoocedInChainSoFar = false;
			let candidateCoocs = allCoocs[candidate];
			for (let i = 1; i < chainSoFar.length -1; i++) {
				alreadyCoocedInChainSoFar = candidateCoocs.hasOwnProperty(chainSoFar[i]);
				if (alreadyCoocedInChainSoFar) {
					break;
				}
			}

			if (alreadyCoocedInChainSoFar) {
				continue;
			}
		}

		// So, if we get here, it is worth exploring this branch.

		const chainFound = findLinks(chainSoFar.concat([candidate]), targetEntity, bestChain, maxLength);
		if (chainFound != null) {
			if (bestChain == null || chainFound.length < bestChain.length) {
				bestChain = chainFound;
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
		chain = findLinks([entity1], entity2);
	}

	return {
		entity1,
		entity2,
		chain,
	}
}

function createPromisersToPopulateChainDetails( chainDetails ){
	// create a promise-returning fn (a promiser) for each link in the chain,
	// to search for article titles where both entities in the link co-occur.

	let promisers = [];
	chainDetails.chain.forEach((entity,index) => {
		if (index == 0) { return; }
		const prevEntity = chainDetails.chain[index - 1];
		const promiser = function() {
			// NB: by setting the 'before' param to -1, it allows the very latest articles to be considered
			return fetchContent.searchUnixTimeRange(earliestAfterSecs, -1, { constraints : [prevEntity, entity], maxResults : 100,})
				.catch( err => {
					console.log( `ERROR: createPromisersToPopulateChainDetails: promise for entity=${entity}, err=${err}`);
					return;
				})
				;
		};
		promisers.push( promiser );
	});

	return promisers;
}

function extractArticleDetailsFromSapiObj( sapiObj ){
	let articles = [];
	if (! sapiObj ) {
		debug('extractArticleDetailsFromSapiObj: no sapiObj');
	} else if (! sapiObj.results ) {
		debug('extractArticleDetailsFromSapiObj: sapiObj: no results');
	} else if( ! sapiObj.results[0] ) {
		debug('extractArticleDetailsFromSapiObj: sapiObj: no results[0]');
	} else if( ! sapiObj.results[0].results ) {
		debug('extractArticleDetailsFromSapiObj: sapiObj: no results[0].results');
	} else {
		articles = sapiObj.results[0].results.map(result => {
			let imageUrl = undefined;
			if (result.images && result.images.length > 0) {
				imageUrl = result.images[0].url;
			}
			return {
				id    : result.id,
				title : result.title.title,
				initialPubDate : result.lifecycle.initialPublishDateTime,
				imageUrl : imageUrl, // NB: this is the thumbnail image
			};
		})
	}
	return articles;
}

function createPromisersToLookupCapiForChainDetails( chainDetails ){
	// create a promise-returning fn for each article in each link,
	// to look up the image details from CAPI v2,
	// inserting the new field into the article obj: mainImageUrl, which might be null

	// loop over each link, then over each article in the link
	let promisers = [];
	chainDetails['articlesPerLink'].forEach(articles => {
		articles.forEach( article => {
			const promiser = function() {
					return fetchContent.articleImageUrl(article.id)
					.then( url => {
						article.mainImageUrl = url;
					})
					.catch( err => {
						console.log( `createPromisersToLookupCapiForChainDetails: promise for article.id=${article.id}, err=${err}`);
						return;
					})
				};
			promisers.push( promiser );
		});
	});

	return promisers;
}

function fetchCalcChainWithArticlesBetween(entity1, entity2) {
	const chainDetails = calcChainBetween(entity1, entity2);

	chainDetails['articlesPerLink'] = [];

	const promisersToPopulateChainDetails = createPromisersToPopulateChainDetails(chainDetails);

	// process each search result to get the list of titles for each link

	return delayedDirectly(FACETS_CONCURRENCE, promisersToPopulateChainDetails, FACETS_DELAY_MILLIS)
	.then( searchResponses => searchResponses.map(sr => {return sr.sapiObj}) )
	.then( sapiObjs => {
		chainDetails['articlesPerLink'] = sapiObjs.map(extractArticleDetailsFromSapiObj);
	})
	.then( () => createPromisersToLookupCapiForChainDetails(chainDetails) )
	.then( promisersForImages => delayedDirectly( CAPI_CONCURRENCE, promisersForImages, CAPI_DELAY_MILLIS ) )
	.then( () => {
		// warn if any link has no articles

		const warnPreface = `WARNING: fetchCalcChainWithArticlesBetween: for entity1=${entity1}, entity2=${entity2}:`;
		if (chainDetails['articlesPerLink'].length == 0) {
			console.log(`${warnPreface} empty articlesPerLink`);
		} else {
			chainDetails['articlesPerLink'].forEach( (link, i) => {
					if (link == null) {
						console.log(`${warnPreface} link ${i} is null`);
					} else if (link.length == 0) {
						console.log(`${warnPreface} link ${i} is empty`);
					}
			} );
		}
	} )
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

	chainLengths.forEach( layer => {
		layer.entities.sort( (a,b) => {
			if      ( knownEntities[a] < knownEntities[b] ) { return +1; }
			else if ( knownEntities[a] > knownEntities[b] ) { return -1; }
			else                                            { return  0; }
		});
	})

	return chainLengths;
}

function calcChainLengthsFrom(rootEntity){
	let chainLengths = [];
	if (! knownEntities.hasOwnProperty(rootEntity) ) {
		debug(`calcChainBetween: unknown rootEntity=${rootEntity}`);
	} else {
		chainLengths = findAllChainLengths(rootEntity);
		if (chainLengths.length >= 3) {
			chainLengths[2].soNearlies = soNearliesOnMainIslandByEntity[rootEntity];
		}
	}

	return {
		rootEntity,
		chainLengths,
	}
}

function calcSoNearliesOnMainIslandImpl(){
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

function calcSoNearliesOnMainIslandByEntity(){
	const soNearliesByEntity = {};

	soNearliesOnMainIsland.forEach( sn => {
		const e1 = sn.entity1;
		const e2 = sn.entity2;
		for( let pair of [[e1, e2], [e2, e1]]) {
			if (! soNearliesByEntity.hasOwnProperty(pair[0])) {
				soNearliesByEntity[pair[0]] = {
					byEntity  : {},
					byOverlap : {},
				};
			}

			soNearliesByEntity[pair[0]].byEntity[pair[1]] = sn.intersectionList;
			if (!soNearliesByEntity[pair[0]].byOverlap.hasOwnProperty(sn.intersectionSize)) {
				soNearliesByEntity[pair[0]].byOverlap[sn.intersectionSize] = {};
			}
			soNearliesByEntity[pair[0]].byOverlap[sn.intersectionSize][pair[1]] = sn.intersectionList;
		}
	});

	return soNearliesByEntity;
}

// count how many times each entity appears in the intersection list of the soNearlies
function calcMostBetweenSoNearliesOnMainIsland(sortBy=0){
	const maxSortBy = 2;
	if( sortBy < 0        ) { sortBy = 0; }
	if( sortBy > maxSortBy) { sortBy = maxSortBy; }

	const middleEntityCounts = {};

	soNearliesOnMainIsland.forEach( sn => {
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
			numNewlyAppearedEntities : newlyAppearedEntities.length,
		},
	};
}

function getAllData(){
	const data = getSummaryData();
	data[     'knownEntities'] = knownEntities;
	data[          'allCoocs'] = allCoocs;
	data[        'allIslands'] = allIslands;
	data['allIslandsByEntity'] = allIslandsByEntity;
	data['newlyAppearedEntities'] = newlyAppearedEntities;

	return data;
}

function getIslandOfEntity(entity){
	if (!entity || ! allIslandsByEntity.hasOwnProperty(entity)) {
		return {};
	} else {
		return allIslandsByEntity[entity];
	}
}

function calcAllEntitiesCountsPairs() {
 return Object.keys( knownEntities )
 .map( k => { return [k, knownEntities[k]] })
 .sort( (a,b) => {
	 if      (a[1] < b[1]) { return +1; }
	 else if (a[1] > b[1]) { return -1; }
	 else                  { return  0; }

	 } );
}

// given a list of entities,
// look up a suitable set of soNearlies as recommendations
function calcSoNearliesForEntities( entities, maxRecommendations=10 ){
	const known = entities.filter( e => { return soNearliesOnMainIslandByEntity.hasOwnProperty(e); });
	let soNearlies = [];
	const candidates = {};

	if (known.length == 0) {
		soNearlies = Object.keys(soNearliesOnMainIslandByEntity).slice(0,maxRecommendations);
	} else {

		// count the overlapping soNearlies of all the entities,
		// ignoring the degree of soNearly-ness
		for( let entity of known ) {
			const sn = soNearliesOnMainIslandByEntity[entity];
			for( let ce of Object.keys(sn.byEntity) ){
				if (!candidates.hasOwnProperty(ce)) {
					candidates[ce] = 0;
				}
				candidates[ce] = candidates[ce] + 1;
			}
		}

		// remove any direct coocs
		for( let entity of known ) {
			for( let candidate of Object.keys(candidates) ){
				if (allCoocs[entity].hasOwnProperty(candidate)) {
					delete(candidates[candidate]);
				}
			}
		}

		const candidateList = Object.keys(candidates).sort((a,b) => {
			if     (candidates[a] < candidates[b]) { return  1; }
			else if(candidates[a] > candidates[b]) { return -1; }
			else                                   { return  0; }
		});

		soNearlies = candidateList.slice(0,maxRecommendations);
	}

	return {
		notes : [
			'assumes entities are on main island',
			{candidates}
		],
		requestedEntities : entities,
		knownEntities: known,
		maxRecommendations,
		soNearlies,
	};
}

// given a list of entities,
// look up a suitable set of coocs as recommendations
function calcCoocsForEntities( entities, max=10 ){
	const known = entities.filter( e => { return soNearliesOnMainIslandByEntity.hasOwnProperty(e); });
	let coocs = [];
	const candidates = {};

	if (known.length == 0) {
		coocs = Object.keys(soNearliesOnMainIslandByEntity).slice(0,max);
	} else {

		// count the overlapping coocs of all the entities,
		for( let entity of known ) {
			for( let cooc of Object.keys(allCoocs[entity]) ){
				if (!candidates.hasOwnProperty(cooc)) {
					candidates[cooc] = 0;
				}
				candidates[cooc] = candidates[cooc] + 1;
			}
		}

		const candidateList = Object.keys(candidates).sort((a,b) => {
			if     (candidates[a] < candidates[b]) { return  1; }
			else if(candidates[a] > candidates[b]) { return -1; }
			else                                   { return  0; }
		});

		coocs = candidateList.slice(0,max);
	}

	return {
		notes : [
			'assumes entities are on main island',
			{candidates}
		],
		requestedEntities : entities,
		knownEntities: known,
		max,
		coocs,
	};
}

function exhaustivelyPainfulDataConsistencyCheck(){
	console.log('WARNING: initiating exhaustivelyPainfulDataConsistencyCheck');
	const startMillis = Date.now();

	// loop over every island
	//  loop over every pair of entities
	//   add the pair to the list

	const islandSizes = [];
	const pairs = [];

	allIslands.forEach( island => {
		entities = Object.keys(island).sort();
		islandSizes.push(entities.length);

		entities.forEach( (entity1, e1) => {
			for (let e2 = e1 + 1; e2 < entities.length; e2++) {
				let entity2 = entities[e2];
				pairs.push([entity1, entity2]);
			}
		});
	});

	// generate the promiser for each pair

	const warningCounts = [];

	const promisers = pairs.map( (pair, p) => {
		return function () {
			return fetchCalcChainWithArticlesBetween(pair[0], pair[1])
			.catch( err => {
				console.log( `ERROR: exhaustivelyPainfulDataConsistencyCheck: promise for entity1=${pair[0]} and entity2=${pair[1]}, err=${err}`);
				return;
			})
			.then( chainDetails => {
				const warnings = [];
				const warnPreface = `WARNING: exhaustivelyPainfulDataConsistencyCheck: for entity1=${pair[0]}, entity2=${pair[1]}:`;
				if (chainDetails['articlesPerLink'].length == 0) {
					warnings.push(`${warnPreface} empty articlesPerLink`);
				} else {
					chainDetails['articlesPerLink'].forEach( (link, i) => {
							if (link == null) {
								warnings.push(`${warnPreface} link ${i} is null`);
							} else if (link.length == 0) {
								warnings.push(`${warnPreface} link ${i} is empty`);
							}
					} );
				}

				warningCounts[p] = warnings.length;
				return warnings;
			})
			;
		};
	})

	// funnel the promisers through 'directly'
	// report results

	return delayedDirectly(FACETS_CONCURRENCE, promisers, FACETS_DELAY_MILLIS)
	.then( listsOfWarnings => {
		return {
			description      : 'exhaustivelyPainfulDataConsistencyCheck: invoking fetchCalcChainWithArticlesBetween on each pair of entities on each island, looking for responses which are have no articles in one or more links of the chain. Warning: this hammers the back end(s), so should not be done lightly. If the response takes too long and times out in the browser, it is worth checking the logs since the response is logged in full when the back end call finally completes.',
			totalWarnings    : warningCounts.reduce( (prev, curr) => prev + curr ),
			context : {
				numIslands       : allIslands.length,
				islandSizes      : islandSizes.join(','),
				totalIslandsSize : islandSizes.reduce( (prev, curr) => prev + curr ),
				totalPairs       : pairs.length,
				durationMillis   : Date.now() - startMillis,
			},
			warningCounts    : warningCounts.join(','),
			listsOfWarnings  : listsOfWarnings.filter( list => { return list.length> 0; }),
		};
	})
	;
}

function 	allEntities(){
	return Object.keys( knownEntities ).sort();
}

function 	allEntitiesWithPrefLabels(){
	const entities = allEntities();
	return v1v2.fetchPrefLabelsOfEntities(entities)
	.then( entityToPrefLabel => {
		return {
			entities,
			prefLabels : entityToPrefLabel
		};
	})
}


module.exports = {
	fetchUpdateCorrelationsLatest,
	fetchUpdateCorrelationsEarlier,
	knownEntities,
	getIslandOfEntity,
	calcChainBetween,
	calcChainLengthsFrom,
	fetchCalcChainWithArticlesBetween,
	calcMostBetweenSoNearliesOnMainIsland,
	allCoocs    : function(){ return allCoocs; },
	allData     : getAllData,
	allEntities,
	allEntitiesWithPrefLabels,
	entityPrefLabels : function(){ return entityPrefLabels; },
	allEntitiesCountsPairs : calcAllEntitiesCountsPairs,
	allIslands  : function(){ return allIslands; },
	calcSoNearliesOnMainIsland : function() { return soNearliesOnMainIsland;},
	soNearliesOnMainIslandByEntity : function() { return soNearliesOnMainIslandByEntity;},
	calcSoNearliesForEntities,
	calcCoocsForEntities,
	summary     : getSummaryData,
	logbook     : logbook,
	ontology    : function() { return ONTOLOGY; },
	biggestIsland : function(){ return biggestIsland; },
	newlyAppearedEntities : function(){ return newlyAppearedEntities; },
	exhaustivelyPainfulDataConsistencyCheck,
};
