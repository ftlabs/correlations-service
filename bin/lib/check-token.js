const debug = require('debug')('bin:lib:check-token');

module.exports = (req, res, next) => {

	const passedToken = req.query.token;

	debug(`Checking if token '${passedToken}' is valid`);

	if(!passedToken){
		debug(`'token' was not passed for request. Value is '${passedToken}'`);
		res.status(422);
		res.json({
			status : 'error',
			message : `A valid token must be passed with the 'token' query parameter to access this resource`
		});
	} else if(passedToken === process.env.USER_ACCESS_TOKEN){
		debug(`Token '${passedToken}' was valid`);
		next();
	} else {
		debug(`Token '${passedToken}' is not valid`);
		res.status(401);
		res.json({
			status : 'err',
			message : 'The token passed was not valid'
		});
	}

}