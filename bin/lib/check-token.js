const debug = require('debug')('bin:lib:check-token');
const S3O = require('s3o-middleware');

module.exports = (req, res, next) => {

	const passedToken = req.query.token;

	debug(`Checking if token '${passedToken}' is valid`);

	if(passedToken === process.env.TOKEN){
		debug(`Token '${passedToken}' was valid`);
		next();
	} else {
		debug(`Token '${passedToken}' was not valid`);
		S3O(req, res, next);
	}

}