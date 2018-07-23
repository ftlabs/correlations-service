const fetchContent = require('./fetchContent');
const net = require('net');


var socket = net.createConnection(2003, "graphite.ft.com", function() {
	console.log("Connection created");

});







function send_metrics() {

	const data=fetchContent.summariseFetchTimings();
   

	const postObj = data["POST"];	
	const keys = Object.keys(postObj);
	const filtered = keys.filter(key => {return key!="statusesNotOk"});


	var metric_line = "";

	for(var i=0; i < filtered.length; i++) {
		metric_line = metric_line + "demo." + filtered[i] + " " + parseFloat(postObj[filtered[i]]) + " " + Math.floor(Date.now() / 1000) + "\n";
	}

	console.log(metric_line);


	const writeResponse = socket.write(metric_line, function () {
			console.log(`Write callback metric line = ${metric_line}` );
		});


	console.log(`writeResponse =${writeResponse}`);
}


module.exports = {
	send_metrics,
};

