const  dotenv = require('dotenv').config({ silent : process.env.NODE_ENVIRONMENT === 'production'  });
const   debug = require('debug')('correlations:index');
const express = require('express');
const    path = require('path');
var    exphbs = require('express-handlebars');

const     app = express();

app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');

const fetchContent = require('./bin/lib/fetchContent');
const    correlate = require('./bin/lib/correlate');
const         v1v2 = require('./bin/lib/v1v2');

const validateRequest = require('./bin/lib/check-token');

var requestLogger = function(req, res, next) {
    debug("RECEIVED REQUEST:", req.method, req.url);
    next(); // Passing the request to the next handler in the stack.
}

app.use(requestLogger);

// these routes do *not* have s3o

app.use('/static', express.static('static'));

app.get('/__gtg', (req, res) => {
	res.status(200).end();
});

const TOKEN = process.env.TOKEN;
if (! TOKEN ) {
  throw new Error('ERROR: TOKEN not specified in env');
}

app.get('/dummy', (req, res) => {
  res.json({ testing: "testing", 'one-two-three' : 'testing' });
});

// these route *do* use s3o
app.set('json spaces', 2);

if (process.env.BYPASS_TOKEN !== 'true') {
	app.use(validateRequest);
}

app.get('/', (req, res) => {
	// res.sendFile(path.join(__dirname + '/static/index.html'));
  const islands = correlate.allIslands();
  let island = (islands.length > 0)? islands[0] : [ {'entity1': true, 'entity2' : true}];
  const entities = Object.keys(island);
  res.render('home', {
    ontology : correlate.ontology,
    entity1 : entities[0],
    entity2 : entities[entities.length -1],
    entity1a : entities[1],
    tmeId1 : (correlate.ontology == 'people')? 'TnN0ZWluX1BOX1BvbGl0aWNpYW5fMjcx-UE4=' : 'NDdiMzAyNzctMTRlMy00Zjk1LWEyZjYtYmYwZWIwYWU2NzAy-VG9waWNz',
    v2ApuUrl1 : 'http://api.ft.com/things/f79cb3d0-3c68-3776-b6ac-43a44609a7d6',
  });
});

app.get('/article/:uuid', (req, res) => {
	fetchContent.article(req.params.uuid)
	.then( obj => res.json( obj ) );
});

app.get('/searchByUUID/:uuid', (req, res) => {
	fetchContent.searchByUUID(req.params.uuid)
	.then( obj => res.json( obj ) );
});

app.get('/searchLastSeconds/:seconds', (req, res) => {
	const interval = req.params.seconds;
	const nowSecs = Math.floor( Date.now() / 1000 );

	fetchContent.searchUnixTimeRange(nowSecs - interval, nowSecs)
	.then( obj => res.json( obj ) );
});

app.get('/searchLastSeconds/:seconds/:entity', (req, res) => {
	const interval = req.params.seconds;
  const   entity = req.params.entity;
	const  nowSecs = Math.floor( Date.now() / 1000 );

	fetchContent.searchUnixTimeRange(nowSecs - interval, nowSecs, {
    constraints: [entity],
    maxResults : 100,
  })
	.then( obj => res.json( obj ) );
});

app.get('/searchLastSeconds/:seconds/:entity1/:entity2', (req, res) => {
	const interval = req.params.seconds;
  const  entity1 = req.params.entity1;
  const  entity2 = req.params.entity2;
	const  nowSecs = Math.floor( Date.now() / 1000 );

	fetchContent.searchUnixTimeRange(nowSecs - interval, nowSecs, {
    constraints : [entity1, entity2],
     maxResults : 100,
  })
	.then( obj => res.json( obj ) );
});

app.get('/updateCorrelations', (req, res) => {
	correlate.fetchUpdateCorrelationsLatest()
	.then( obj => res.json( obj ) );
});

app.get('/updateCorrelationsEarlier/:seconds', (req, res) => {
	correlate.fetchUpdateCorrelationsEarlier(req.params.seconds)
	.then( obj => res.json( obj ) );
});

app.get('/allCoocs', (req, res) => {
	res.json( correlate.allCoocs() );
});

app.get('/allData', (req, res) => {
	res.json( correlate.allData() );
});

app.get('/summary', (req, res) => {
	res.json( correlate.summary() );
});

app.get('/summaryOfFetches', (req, res) => {
	res.json( fetchContent.summariseFetchTimings() );
});
app.get('/summaryOfFetches/:history', (req, res) => {
	res.json( fetchContent.summariseFetchTimings(req.params.history) );
});

app.get('/allIslands', (req, res) => {
	res.json( correlate.allIslands() );
});

app.get('/biggestIsland', (req, res) => {
	res.json( correlate.biggestIsland() );
});

app.get('/allEntities', (req, res) => {
	res.json( correlate.allEntities() );
});

app.get('/newlyAppearedEntities', (req, res) => {
	res.json( correlate.newlyAppearedEntities() );
});

app.get('/allEntitiesCountsPairs', (req, res) => {
	res.json( correlate.allEntitiesCountsPairs() );
});

app.get('/islandOf/:entity', (req, res) => {
	res.json( {
		entity: req.params.entity,
		island: correlate.getIslandOfEntity(req.params.entity)
	} );
});

app.get('/logbook', (req, res) => {
	res.json( correlate.logbook.reverse() );
});

app.get('/calcChainBetween/:entity1/:entity2', (req, res) => {
	res.json( correlate.calcChainBetween(req.params.entity1, req.params.entity2) );
});

app.get('/calcChainLengthsFrom/:entity', (req, res) => {
	res.json( correlate.calcChainLengthsFrom(req.params.entity) );
});

app.get('/calcChainWithArticlesBetween/:entity1/:entity2', (req, res) => {
	correlate.fetchCalcChainWithArticlesBetween(req.params.entity1, req.params.entity2)
  .then( obj => res.json( obj ) )
  ;
});

app.get('/calcSoNearliesOnMainIsland', (req, res) => {
	res.json( correlate.calcSoNearliesOnMainIsland() );
});

app.get('/soNearliesOnMainIslandByEntity', (req, res) => {
	res.json( correlate.soNearliesOnMainIslandByEntity() );
});

app.get('/calcMostBetweenSoNearliesOnMainIsland', (req, res) => {
	res.json( correlate.calcMostBetweenSoNearliesOnMainIsland() );
});

app.get('/calcMostBetweenSoNearliesOnMainIsland/:sortBy', (req, res) => {
	res.json( correlate.calcMostBetweenSoNearliesOnMainIsland(req.params.sortBy) );
});

app.get('/calcSoNearliesForEntities/:entities', (req, res) => {
  const entities = req.params.entities.split(',');
  const max = (req.query.max)? req.query.max : 10;
	res.json( correlate.calcSoNearliesForEntities(entities, max) );
});

app.get('/calcCoocsForEntities/:entities', (req, res) => {
  const entities = req.params.entities.split(',');
  const max = (req.query.max)? req.query.max : 10;
	res.json( correlate.calcCoocsForEntities(entities, max) );
});

app.get('/searchByEntityWithFacets/:entity', (req, res) => {
  const entity = req.params.entity;
	fetchContent.searchByEntityWithFacets(entity)
  .then( obj => res.json( obj ) )
  ;
});

app.get('/v1v2/entity/:entity', (req, res) => {
  const entity = req.params.entity;
	v1v2.fetchVariationsOfEntity(entity)
  .then( obj => res.json( obj ) )
  ;
});

app.get('/v1v2/store', (req, res) => {
  res.json( v1v2.store() );
});

app.get('/v1v2/store_errors', (req, res) => {
  res.json( v1v2.store_errors() );
});

app.get('/tmeIdToV2/:entity', (req, res) => {
  const entity = req.params.entity;
	fetchContent.tmeIdToV2(entity)
  .then( obj => res.json( obj ) )
  ;
});

app.get('/v2ApiCall/', (req, res) => {
  const url = req.query.url;
	fetchContent.v2ApiCall(url)
  .then( obj => res.json( obj ) )
  ;
});

//---

function startListening(){
	app.listen(process.env.PORT, function(){
		console.log('Server is listening on port', process.env.PORT);
	});
}

function startup() {
  return Promise.resolve(1)
  .then( () => {
    const startupRangeSecs = (process.env.hasOwnProperty('STARTUP_RANGE_SECS'))? parseInt(process.env.STARTUP_RANGE_SECS) : 0;
    if (startupRangeSecs > 0) {
      console.log(`startup: startupRangeSecs=${startupRangeSecs}`);
    	return correlate.fetchUpdateCorrelationsEarlier(startupRangeSecs);
    } else {
      return { msg: 'startup: no data pre-loaded' };
    }
  })
  .catch( err => {
    throw new Error( `startup: err=${err}`);
  })
  .then( info => {
    startListening();
    return;
  })
  ;
}

function postStartup() {
  const postStartupRangeSecs = (process.env.hasOwnProperty('POST_STARTUP_RANGE_SECS'))? parseInt(process.env.POST_STARTUP_RANGE_SECS) : 0;
  console.log(`postStartup: postStartupRangeSecs=${postStartupRangeSecs}`);
  return correlate.fetchUpdateCorrelationsEarlier(postStartupRangeSecs)
  .catch( err => {
    throw new Error( `postStartup: err=${err}`);
  })
  ;
}

function updateEverySoOften(count=0){
  let updateEverySecs = process.env.UPDATE_EVERY_SECS;
  let updateEveryMillis = ((updateEverySecs == '')? 0 : parseInt(updateEverySecs)) * 1000;
  if (updateEveryMillis > 0) {
    console.log(`updateEverySoOften: next update in ${updateEverySecs} secs.`);
    setTimeout(() => {
      console.log(`updateEverySoOften: count=${count}, UPDATE_EVERY_SECS=${updateEverySecs}`);
      correlate.fetchUpdateCorrelationsLatest()
      .then(summaryData => console.log(`updateEverySoOften: fetchUpdateCorrelationsLatest: ${JSON.stringify(summaryData)}`) )
      .then( () => updateEverySoOften(count+1) )
      ;
    }, updateEveryMillis);
  }
}

//---

startup()
.then(() => postStartup()        )
.then(() => updateEverySoOften() )
.then(() => console.log('full startup completed.') )
.catch( err => {
  console.log(`ERROR: on startup: err=${err}`);
})
;
