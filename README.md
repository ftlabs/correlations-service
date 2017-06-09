# FT Labs rebuild of Slurp, surfacing correlations between people and orgs

Basic gist:

* read info from SAPI
* build in-memory indexes
* support six degrees -esque functionality

# new end points

* /...

# Environment Parameters

When building locally, specify them in a local file, .env (and NB, this must not be included in the git repo, hence has a specific line in .gitignore). When deploying to Heroku, they need to be specified in the app's settings, Config Variables.

The following are mandatory params, the absence of which will kill the app on startup:

* TOKEN=...
* CAPI_KEY=...

optional params

* ONTOLOGY, default value is 'people', but could also be 'organisations'
* STARTUP_RANGE_SECS, default is 0, what pre-processing to do on startup (before listening), i.e. what interval to look for articles. Will delay the app on startup. Must not take longer than 25ish seconds. If the pre-processing fails, the app will no start.
* UPDATE_EVERY_SECS, default 0, to poll for the latest articles every N secs and incorporate them into the stats

These are for local builds:

* SERVER_ROOT=TRANSPORT_AND_DOMAIN_OF_SERVICE
   * to use when constructing the podcast feed
   * e.g. when developing locally, http://localhost:8060
* DEBUG=correlations:\*,bin:lib:\*
