const debug = require('debug')('bin:lib:check-token');
const S3O = require('s3o-middleware');

module.exports = (req, res, next) => {

	const passedToken = req.query.token;

	debug(`Checking if token '${passedToken}' is valid`);

	if(passedToken === undefined){
		debug(`No token has been passed to service. Falling through to S3O`);
		S3O(req, res, next);
	} else if(passedToken === process.env.TOKEN){
		debug(`Token '${passedToken}' was valid`);
		next();
	} else {
		res.status(401);
		res.json({
			status : 'err',
			message : 'The token value passed was invalid.'
		});
	}

}