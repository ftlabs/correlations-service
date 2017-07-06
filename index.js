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

const checkToken = require('./bin/lib/check-token');

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
	app.use(checkToken);
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

app.get('/allIslands', (req, res) => {
	res.json( correlate.allIslands() );
});

app.get('/allEntities', (req, res) => {
	res.json( correlate.allEntities() );
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

//---

function startListening(){
	app.listen(process.env.PORT, function(){
		console.log('Server is listening on port', process.env.PORT);
	});
}

let startupRangeSecs = process.env.STARTUP_RANGE_SECS;
if (startupRangeSecs > 0) {
  console.log(`startup: startupRangeSecs=${startupRangeSecs}`);
	correlate.fetchUpdateCorrelationsEarlier(startupRangeSecs)
	.then( summaryData => {
		console.log(`startup: fetchUpdateCorrelationsEarlier: summaryData: ${JSON.stringify(summaryData, null, 2)}`);
		startListening();
	})
	.catch( err => {
		console.log( `startup: err=${err}`);
		startListening();
	})
} else {
	startListening();
}

//---

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

updateEverySoOften();
