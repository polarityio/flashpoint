const request = require('request');
const async = require('async');
const fs = require('fs');
const _ = require('lodash');
const config = require('./config/config');

let Logger;
let requestWithDefaults;
let previousDomainRegexAsString = '';
let previousIpRegexAsString = '';
let domainBlocklistRegex = null;
let ipBlocklistRegex = null;
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

function _setupRegexBlocklists(options) {
  if (options.domainBlocklistRegex !== previousDomainRegexAsString && options.domainBlocklistRegex.length === 0) {
    Logger.debug('Removing Domain Blocklist Regex Filtering');
    previousDomainRegexAsString = '';
    domainBlocklistRegex = null;
  } else {
    if (options.domainBlocklistRegex !== previousDomainRegexAsString) {
      previousDomainRegexAsString = options.domainBlocklistRegex;
      Logger.debug({ domainBlocklistRegex: previousDomainRegexAsString }, 'Modifying Domain Blocklist Regex');
      domainBlocklistRegex = new RegExp(options.domainBlocklistRegex, 'i');
    }
  }

  if (options.ipBlocklistRegex !== previousIpRegexAsString && options.ipBlocklistRegex.length === 0) {
    Logger.debug('Removing IP Blocklist Regex Filtering');
    previousIpRegexAsString = '';
    ipBlocklistRegex = null;
  } else {
    if (options.ipBlocklistRegex !== previousIpRegexAsString) {
      previousIpRegexAsString = options.ipBlocklistRegex;
      Logger.debug({ ipBlocklistRegex: previousIpRegexAsString }, 'Modifying IP Blocklist Regex');
      ipBlocklistRegex = new RegExp(options.ipBlocklistRegex, 'i');
    }
  }
}

function _isEntityBlocklisted(entity, { blocklist }) {
  Logger.trace({ blocklist }, 'Blocklist Values');

  const entityIsBlocklisted = _.includes(blocklist, entity.value.toLowerCase());

  const ipIsBlocklisted =
    entity.isIP && !entity.isPrivateIP && ipBlocklistRegex !== null && ipBlocklistRegex.test(entity.value);
  if (ipIsBlocklisted) Logger.debug({ ip: entity.value }, 'Blocked BlockListed IP Lookup');

  const domainIsBlocklisted =
    entity.isDomain && domainBlocklistRegex !== null && domainBlocklistRegex.test(entity.value);
  if (domainIsBlocklisted) Logger.debug({ domain: entity.value }, 'Blocked BlockListed Domain Lookup');

  return entityIsBlocklisted || ipIsBlocklisted || domainIsBlocklisted;
}

function _isInvalidEntity(entity) {
  return entity.isIPv4 && IGNORED_IPS.has(entity.value)
}

function doLookup(entities, options, cb) {
  let lookupResults = [];
  let tasks = [];

  Logger.debug(entities);

  _setupRegexBlocklists(options);

  entities.forEach((entity) => {
    if (!_isInvalidEntity(entity) && !_isEntityBlocklisted(entity, options)) {
      let requestOptions = {
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + options.apiKey
        },
        json: true
      };

      if (entity.isHash || entity.isIPv4 || entity.isDomain) {
        requestOptions.uri = `${options.url}/indicators/simple`,
        requestOptions.qs = {query: `"${entity.value}"`, limit: options.limit}
      } else if (entity.isEmail) {
        requestOptions.uri = `${options.url}/indicators/simple`,
        requestOptions.qs = {query: `${entity.value}`, limit: options.limit}
      } else if (entity.type === 'cve') {
        requestOptions.uri = `${options.url}/all/search`,
        requestOptions.qs = {query: `"${entity.value}"` + "+basetypes:(cve)", limit: 1}
      } else {
        return;
      }

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
      const resultHasNoContent =
        (_.get(result, 'entity.type') != 'cve' &&
          (_.get(result, 'body') === null || _.get(result, 'body.length') === 0)) ||
        (_.get(result, 'entity.type') === 'cve' &&
          (_.get(result, 'body') === null || _.get(result, 'body.hits.total') === 0));

      if (resultHasNoContent) {
        lookupResults.push({
          entity: result.entity,
          data: null
        });
      } else {
        lookupResults.push({
          entity: result.entity,
          data: {
            summary: [],
            details: {
              indicators: _.get(result, 'body')
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
  } else if (res.statusCode === 429) {
    result = {
      error: '429 - Too Many Requests',
      detail: res.body.detail
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
      error: res.body.status || 'Unexpected Error Occurred',
      detail: res.body.detail
    };
  }
  return result;
}

module.exports = {
  doLookup: doLookup,
  onDetails: onDetails,
  startup: startup
};
