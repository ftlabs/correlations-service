const fetchContent = require('./fetchContent');
const net = require('net');
const correlate = require('./correlate');


var socket = net.createConnection(2003, "graphite.ft.com", function() {
	console.log("Connection created");

});







function send_post_metrics() {

	const data=fetchContent.summariseFetchTimings();
   

	const postObj = data["POST"];	
	const keys = Object.keys(postObj);
	const filtered = keys.filter(key => {return key!="statusesNotOk"});


	var metric_line = "";

	for(var i=0; i < filtered.length; i++) {
		metric_line = metric_line + "demo.ft-lab.correlations-service." + correlate.ontology() + ".post." + filtered[i] + " " + parseFloat(postObj[filtered[i]]) + " " + Math.floor(Date.now() / 1000) + "\n";
	}

	console.log(metric_line);


	const writeResponse = socket.write(metric_line, function () {
			console.log(`Write callback metric line = ${metric_line}` );
		});


	console.log(`writeResponse =${writeResponse}`);
}


function send_get_metrics() {

	const data=fetchContent.summariseFetchTimings();
   

	const postObj = data["GET"];	
	const keys = Object.keys(postObj);
	const filtered = keys.filter(key => {return key!="statusesNotOk"});


	var metric_line = "";

	for(var i=0; i < filtered.length; i++) {
		metric_line = metric_line + "demo.ft-lab.correlations-service."+correlate.ontology()+".get." + filtered[i] + " " + parseFloat(postObj[filtered[i]]) + " " + Math.floor(Date.now() / 1000) + "\n";
	}

	console.log(metric_line);


	const writeResponse = socket.write(metric_line, function () {
			console.log(`Write callback metric line = ${metric_line}` );
		});


	console.log(`writeResponse =${writeResponse}`);
}


function test() {
	const data=correlate.summary();
	const postObj = data["counts"];
	console.log("TEST: " + postObj["knownEntities"]);
	console.log(correlate.summary());
}



module.exports = {
	send_get_metrics,
	send_post_metrics,
	test,
};

