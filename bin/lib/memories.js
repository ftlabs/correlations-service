const debug = require('debug')('bin:lib:memories');

function areMadeOfThis(){
	return process.memoryUsage();
}

function areBeyondCompare( prevUsage ){
	const latestUsage = areMadeOfThis();
	const diffUsage = {
		prevUsage,
		latestUsage,
	};
	for (let key in latestUsage) {
		diffUsage[key] = latestUsage[key] - prevUsage[key];
	}

	return diffUsage;
}

const IGNORE_USAGE_KEYS = ['prevUsage', 'latestUsage'];

function log( context='memoryUsage', usage=areMadeOfThis() ){
	const lines = [`${context} :`];
	const keys = Object.keys(usage).filter( key => !IGNORE_USAGE_KEYS.includes(key) );
	lines.push( keys.join( ", \t") );
	lines.push( keys.map( key => `${Math.round(usage[key] / 1024 / 1024 * 100) / 100} MB` ).join( ", \t") );

	console.log( lines.join("\n") );
	return lines;
}

const snapshotLines = [];

function areBeyondCompareAndLog( context, prevUsage ){
	const diffUsage = areBeyondCompare( prevUsage );
	const lines = log( context, diffUsage );
	snapshotLines.push(lines.join("\n"));
	return diffUsage.latestUsage;
}

function logSnapshotAndFlush(){
	console.log( `memories snapshot:\n ${snapshotLines.join("\n")}`);
	snapshotLines.length = 0;
}

module.exports = {
	areMadeOfThis,
	log,
	areBeyondCompare,
	areBeyondCompareAndLog,
	logSnapshotAndFlush,
};
