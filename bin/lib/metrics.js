const fetchContent = require('./fetchContent');
const net = require('net');
const correlate = require('./correlate');


var socket = net.createConnection(2003, "graphite.ft.com", function() {
	//console.log("Connection created");

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

	//console.log(metric_line);


	const writeResponse = socket.write(metric_line, function () {
			//console.log(`Write callback metric line = ${metric_line}` );
		});


	//console.log(`writeResponse =${writeResponse}`);
}


function send_get_metrics() {

	const data=fetchContent.summariseFetchTimings();
   

	const postObj = data["GET"];	
	const keys = Object.keys(postObj);
	const filtered = keys.filter(key => {return key!="statusesNotOk"});


	var metric_line = "";

	for(var i=0; i < filtered.length; i++) {
		metric_line = metric_line + "demo.ft-lab.correlations-service." + correlate.ontology() + ".get." + filtered[i] + " " + parseFloat(postObj[filtered[i]]) + " " + Math.floor(Date.now() / 1000) + "\n";
	}

	//console.log(metric_line);


	const writeResponse = socket.write(metric_line, function () {
			//console.log(`Write callback metric line = ${metric_line}` );
		});


	//console.log(`writeResponse =${writeResponse}`);
}


function test() {
	const data=correlate.summary();
	const postObj = data["counts"];
	const intervalHrs = data["times"]["intervalCoveredHrs"];
	//console.log(correlate.summary());

	counts_items = Object.keys(postObj);

	
	var interval_metric = "demo.ft-lab.correlations-service."	+ correlate.ontology() + ".times.intervalCoveredHrs " + parseFloat(intervalHrs) + " " + Math.floor(Date.now() / 1000) + "\n";
	var metric_line = interval_metric;

	for( i in counts_items) {
		metric_line = metric_line + "demo.ft-lab.correlations-service."	+ correlate.ontology() + ".counts." + counts_items[i] + " " + parseFloat(postObj[counts_items[i]]) + " " + Math.floor(Date.now() / 1000) + "\n";
		//console.log(counts_items[i] + ": " + postObj[counts_items[i]]);
	}

	console.log(metric_line);
	const writeResponse = socket.write(metric_line, function () {
		//console.log(`Write callback metric line = ${metric_line}` );
	});



	
}



module.exports = {
	send_get_metrics,
	send_post_metrics,
	test,
};

