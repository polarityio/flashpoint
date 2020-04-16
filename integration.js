const request = require('request');
const async = require('async');
const fs = require('fs');
const _ = require('lodash');
const config = require('./config/config');

let Logger;
let requestWithDefaults;
let previousDomainRegexAsString = '';
let previousIpRegexAsString = '';
let domainBlacklistRegex = null;
let ipBlacklistRegex = null;
const IGNORED_IPS = new Set(['127.0.0.1', '255.255.255.255', '0.0.0.0']);

const MAX_DOMAIN_LABEL_LENGTH = 63;
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

function _setupRegexBlacklists(options) {
  if (options.domainBlacklistRegex !== previousDomainRegexAsString && options.domainBlacklistRegex.length === 0) {
    Logger.debug('Removing Domain Blacklist Regex Filtering');
    previousDomainRegexAsString = '';
    domainBlacklistRegex = null;
  } else {
    if (options.domainBlacklistRegex !== previousDomainRegexAsString) {
      previousDomainRegexAsString = options.domainBlacklistRegex;
      Logger.debug({ domainBlacklistRegex: previousDomainRegexAsString }, 'Modifying Domain Blacklist Regex');
      domainBlacklistRegex = new RegExp(options.domainBlacklistRegex, 'i');
    }
  }

  if (options.ipBlacklistRegex !== previousIpRegexAsString && options.ipBlacklistRegex.length === 0) {
    Logger.debug('Removing IP Blacklist Regex Filtering');
    previousIpRegexAsString = '';
    ipBlacklistRegex = null;
  } else {
    if (options.ipBlacklistRegex !== previousIpRegexAsString) {
      previousIpRegexAsString = options.ipBlacklistRegex;
      Logger.debug({ ipBlacklistRegex: previousIpRegexAsString }, 'Modifying IP Blacklist Regex');
      ipBlacklistRegex = new RegExp(options.ipBlacklistRegex, 'i');
    }
  }
}

function _isEntityBlacklisted(entity, { blacklist }) {
  Logger.trace({ blacklist }, 'Blacklist Values');

  const entityIsBlacklisted = _.includes(blacklist, entity.value.toLowerCase());

  const ipIsBlacklisted =
    entity.isIP && !entity.isPrivateIP && ipBlacklistRegex !== null && ipBlacklistRegex.test(entity.value);
  if (ipIsBlacklisted) Logger.debug({ ip: entity.value }, 'Blocked BlackListed IP Lookup');

  const domainIsBlacklisted =
    entity.isDomain && domainBlacklistRegex !== null && domainBlacklistRegex.test(entity.value);
  if (domainIsBlacklisted) Logger.debug({ domain: entity.value }, 'Blocked BlackListed Domain Lookup');

  return entityIsBlacklisted || ipIsBlacklisted || domainIsBlacklisted;
}

function _isInvalidEntity(entity) {
  return entity.isIPv4 && IGNORED_IPS.has(entity.value)
}

function doLookup(entities, options, cb) {
  let lookupResults = [];
  let tasks = [];

  Logger.debug(entities);

  _setupRegexBlacklists(options);

  entities.forEach((entity) => {
    if (!_isInvalidEntity(entity) && !_isEntityBlacklisted(entity, options)) {
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
    }
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
        done(processedResult);
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
