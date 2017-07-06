const debug = require('debug')('bin:lib:check-token');

module.exports = (req, res, next) => {

	const passedToken = req.query.token;

	debug(`Checking if token '${passedToken}' is valid`);

	if(passedToken === process.env.USER_ACCESS_TOKEN){
		debug(`Token '${passedToken}' was valid`);
		next('route');
	} else {
		next();
	}

}