const  dotenv = require('dotenv').config();
const   debug = require('debug')('autovoice:index');
const express = require('express');
const    path = require('path');
const     app = express();

const fetchContent = require('./bin/lib/fetchContent');

const authS3O = require('s3o-middleware');

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

app.use(authS3O);

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname + '/static/index.html'));
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

//---

app.listen(process.env.PORT, function(){
	debug('Server is listening on port', process.env.PORT);
});
