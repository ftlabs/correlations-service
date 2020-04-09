# FT Labs rebuild of Slurp, surfacing correlations between entities in an ontology (e.g. people)

Basic gist:

* read info from SAPI
* build in-memory indexes
* support six degrees -esque functionality
* see the root page for the full list of endpoints

# install/build

* clone the repo
* npm install
* configure .env with local environment param values (see below)
* node index.js (or npm run start)
* go to localhost:<PORT>

# Environment Parameters

When building locally, specify them in a local file, .env (and NB, this must not be included in the git repo, hence has a specific line in .gitignore). When deploying to Heroku, they need to be specified in the app's settings, Config Variables.

## Header Params for all endpoints:

* TOKEN=...
	* Note: in the absence of token, the application will fall back to OKTA. Otherwise, the token is passed to the endpoints as a header.

## Mandatory Environment params (the absence of which will kill the app on startup)

* CAPI_KEY=...
* PORT=
* BASE_URL=
* OKTA_CLIENT=
* OKTA_ISSUER=
* OKTA_SECRET=
* SESSION_TOKEN=

### .env vars for each Correlations service

#### Correlations People

* PORT=3004
* BASE_URL=http://localhost:3004

#### Correlations Topics

* PORT=3005
* BASE_URL=http://localhost:3005


### Where to find OKTA .env vars

- Get `SESSION_TOKEN` from LastPass
- Get details for finding `OKTA_ISSUER`, `OKTA_CLIENT` & `OKTA_SECRET` in LastPass

## Optional Environment params:

* ONTOLOGY, default value is 'people', but could also be 'organisations', 'topics'
   * additionally, to use (ugly) v2 ids, 'peopleId', 'organisationsId', 'topicsId'
	    * to map the UUID-esque ids to human-readable names, you can use the new endpoint/entityPrefLabels
* ONTOLOGIES (overrides ONTOLOGY), a csv, e.g. 'people,organisations', allowing many more correlations
* STARTUP_RANGE_SECS, default is 0, what pre-processing to do on startup (before listening), i.e. what interval to look for articles. Will delay the app on startup. Must not take longer than 25ish seconds. If the pre-processing fails, the app will not start.
* POST_STARTUP_RANGE_SECS, default is 0, what processing to do immediately after startup (after listening), i.e. what interval to look for articles.
   * the idea is to have the combined total range come to 7 days, as soon as poss, but ensuring the initial load is not so long that it kills the app on startup (when Heroku complains about it taking too long). There will be a period of a minute or so after the app has started listening when it won't have the full complement of data (which will be loading in as part of the post startup process).
* UPDATE_EVERY_SECS, default 0, to poll for the latest articles every N secs and incorporate them into the stats
* FACETS_CONCURRENCE, default 4, used to throttle the SAPI calls to this number of concurrent requests.
* CAPI_CONCURRENCE, default 4, used to throttle the CAPI calls to this number of concurrent requests.

## Environment params for local builds:

* PORT=.... (is normally set by Heroku, but you need to specify it if running locally)
* DEBUG=correlations:\*,bin:lib:\*
