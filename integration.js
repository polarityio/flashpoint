const request = require('request');
const async = require('async');
const fs = require('fs');
const config = require('./config/config');

let Logger;
let requestWithDefaults;

const MAX_PARALLEL_LOOKUPS = 10;

/**
 *
 * @param entities
 * @param options
 * @param cb
 */
function startup(logger) {
  let defaults = {};
  Logger = logger;

  const { cert, key, passphrase, ca, proxy, rejectUnauthorized } = config.request;

  if (typeof cert === 'string' && cert.length > 0) {
    defaults.cert = fs.readFileSync(cert);
  }

  if (typeof key === 'string' && key.length > 0) {
    defaults.key = fs.readFileSync(key);
  }

  if (typeof passphrase === 'string' && passphrase.length > 0) {
    defaults.passphrase = passphrase;
  }

  if (typeof ca === 'string' && ca.length > 0) {
    defaults.ca = fs.readFileSync(ca);
  }

  if (typeof proxy === 'string' && proxy.length > 0) {
    defaults.proxy = proxy;
  }

  if (typeof rejectUnauthorized === 'boolean') {
    defaults.rejectUnauthorized = rejectUnauthorized;
  }

  requestWithDefaults = request.defaults(defaults);
}

function doLookup(entities, options, cb) {
  let lookupResults = [];
  let tasks = [];

  Logger.debug(entities);

  entities.forEach((entity) => {
    let requestOptions = {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + options.apiKey
      },
      uri: `${options.url}/indicators/simple`,
      qs: {
        limit: options.limit,
        query: `"${entity.value}"`
      },
      json: true
    };

    Logger.trace({ uri: requestOptions }, 'Request URI');

    tasks.push(function(done) {
      requestWithDefaults(requestOptions, function(error, res, body) {
        let processedResult = handleRestError(error, entity, res, body);

        if (processedResult.error) {
          done(processedResult);
          return;
        }

        done(null, processedResult);
      });
    });
  });

  async.parallelLimit(tasks, MAX_PARALLEL_LOOKUPS, (err, results) => {
    if (err) {
      Logger.error({ err: err }, 'Error');
      cb(err);
      return;
    }

    results.forEach((result) => {
      if (result.body === null || result.body.length === 0) {
        lookupResults.push({
          entity: result.entity,
          data: null
        });
      } else {
        lookupResults.push({
          entity: result.entity,
          data: {
            summary: [`Indicator Count: ${result.body.length}`],
            details: {
              indicators: result.body
            }
          }
        });
      }
    });

    Logger.debug({ lookupResults }, 'Results');
    cb(null, lookupResults);
  });
}

function doReportLookup(entity, options) {
  return function(done) {
    let requestOptions = {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + options.apiKey
      },
      uri: `${options.url}/reports`,
      qs: {
        limit: options.limit,
        query: `"${entity.value}"`
      },
      json: true
    };

    request(requestOptions, (error, response, body) => {
      let processedResult = handleRestError(error, entity, response, body);

      if (processedResult.error) {
        cb(processedResult);
        return;
      }

      done(null, processedResult.body);
    });
  };
}

function doPostsLookup(entity, options) {
  return function(done) {
    let requestOptions = {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + options.apiKey
      },
      uri: `${options.url}/forums/posts`,
      qs: {
        limit: options.limit,
        query: `"${entity.value}"`
      },
      json: true
    };

    request(requestOptions, (error, response, body) => {
      let processedResult = handleRestError(error, entity, response, body);

      if (processedResult.error) {
        return done(processedResult);
      }

      processedResult.body.data.forEach((post) => {
        post.body = post.body.replace(/\n\s*\n/g, '\n\n');
      });

      done(null, processedResult.body);
    });
  };
}

function onDetails(lookupObject, options, cb) {
  async.parallel(
    {
      report: doReportLookup(lookupObject.entity, options),
      posts: doPostsLookup(lookupObject.entity, options)
    },
    (err, results) => {
      if (err) {
        return cb(err);
      }

      lookupObject.data.details.report = results.report;
      lookupObject.data.details.posts = results.posts;
      lookupObject.data.summary.push(`Report Count: ${results.report.data.length}`);
      lookupObject.data.summary.push(`Post Count: ${results.posts.data.length}`);
      Logger.trace({ lookup: lookupObject.data }, 'Looking at the data after on details.');

      cb(null, lookupObject.data);
    }
  );
}

function handleRestError(error, entity, res, body) {
  let result;

  if (error) {
    return {
      error: error,
      detail: 'HTTP Request Error'
    };
  }

  if (res.statusCode === 200) {
    // we got data!
    result = {
      entity: entity,
      body: body
    };
  } else if (res.statusCode === 404) {
    // no result found
    result = {
      entity: entity,
      body: null
    };
  } else if (res.statusCode === 202) {
    // no result found
    result = {
      entity: entity,
      body: null
    };
  } else {
    // unexpected status code
    result = {
      error: body,
      detail: `${body.error}: ${body.message}`
    };
  }
  return result;
}

module.exports = {
  doLookup: doLookup,
  onDetails: onDetails,
  startup: startup
};
