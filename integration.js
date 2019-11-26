"use strict";

let request = require("request");
let _ = require("lodash");
let util = require("util");
let net = require("net");
let config = require("./config/config");
let async = require("async");
let fs = require("fs");
let Logger;

let requestWithDefaults;
let previousDomainRegexAsString = '';
let previousIpRegexAsString = '';
let domainBlacklistRegex = null;
let ipBlacklistRegex = null;

const MAX_PARALLEL_LOOKUPS = 10;
const MAX_DOMAIN_LABEL_LENGTH = 63;
const MAX_ENTITY_LENGTH = 100;
const IGNORED_IPS = new Set(['127.0.0.1', '255.255.255.255', '0.0.0.0']);

/**
 *
 * @param entities
 * @param options
 * @param cb
 */

function startup(logger) {
  Logger = logger;
  let defaults = {};

  if (
    typeof config.request.cert === "string" &&
    config.request.cert.length > 0
  ) {
    defaults.cert = fs.readFileSync(config.request.cert);
  }

  if (typeof config.request.key === "string" && config.request.key.length > 0) {
    defaults.key = fs.readFileSync(config.request.key);
  }

  if (
    typeof config.request.passphrase === "string" &&
    config.request.passphrase.length > 0
  ) {
    defaults.passphrase = config.request.passphrase;
  }

  if (typeof config.request.ca === "string" && config.request.ca.length > 0) {
    defaults.ca = fs.readFileSync(config.request.ca);
  }

  if (
    typeof config.request.proxy === "string" &&
    config.request.proxy.length > 0
  ) {
    defaults.proxy = config.request.proxy;
  }
  requestWithDefaults = request.defaults(defaults);
}

function _setupRegexBlacklists(options) {
  if (
    options.domainBlacklistRegex !== previousDomainRegexAsString &&
    options.domainBlacklistRegex.length === 0
  ) {
    Logger.debug('Removing Domain Blacklist Regex Filtering');
    previousDomainRegexAsString = '';
    domainBlacklistRegex = null;
  } else {
    if (options.domainBlacklistRegex !== previousDomainRegexAsString) {
      previousDomainRegexAsString = options.domainBlacklistRegex;
      Logger.debug(
        { domainBlacklistRegex: previousDomainRegexAsString },
        'Modifying Domain Blacklist Regex'
      );
      domainBlacklistRegex = new RegExp(options.domainBlacklistRegex, 'i');
    }
  }

  if (
    options.ipBlacklistRegex !== previousIpRegexAsString &&
    options.ipBlacklistRegex.length === 0
  ) {
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

function doLookup(entities, options, cb) {
  let lookupResults = [];
  let tasks = [];

  _setupRegexBlacklists(options);

  Logger.trace(entities);

  entities.forEach(entity => {
    if (!_isInvalidEntity(entity) && !_isEntityBlacklisted(entity, options)) {
      //do the lookup
      let requestOptions = {
        method: "GET",
        headers: {
            Authorization: "Bearer " + options.apiKey
        },
        qs: {
          limit: options.limit,
          query: `${entity.value}`
        },
        json: true
      };

      if (entity.isIPv4 || entity.isHash || entity.isDomain) {
        requestOptions.uri = `${options.url}/indicators/simple`
      } else if (entity.types.indexOf('custom.cve') >= 0) {
        requestOptions.uri = `${options.url}/reports`
      } else {
        return;
      }

      Logger.trace({ uri: requestOptions }, "Request URI");

      tasks.push(function(done) {
        requestWithDefaults(requestOptions, function(err, res, body) {
          if (err) {
            Logger.error({ err: err }, 'Error Executing Request');
            done(err);
            return;
          }

          Logger.trace(
            { body: body, statusCode: res.statusCode },
            "Result of Lookup"
          );

          let result = {};

          if (res.statusCode === 200) {
            // we got data!
            result = {
              entity: entity,
              body: body
            };
          } else if (res.statusCode === 404) {
            // Not Found
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
          }
          if (body.error) {
            // entity not found
            result = {
              entity: entity,
              body: null
            };
          }
          done(null, result);
        });
      });
    }
  });

  async.parallelLimit(tasks, MAX_PARALLEL_LOOKUPS, (err, results) => {
    if (err) {
      cb(err);
      return;
    }

    results.forEach(result => {
      if (result.body === null || (Array.isArray(result.body) && result.body.length === 0)) {
        lookupResults.push({
          entity: result.entity,
          data: null
        });
      } else {
        Logger.trace({body: result.body}, "Logging the result body coming through");
        lookupResults.push({
          entity: result.entity,
          data: {
            summary: [],
            details: result.body
          }
        });
      }
    });

    Logger.debug({ lookupResults }, 'Results');
    cb(null, lookupResults);
  });
}

function _isInvalidEntity(entity) {
  // Domains should not be over 100 characters long so if we get any of those we don't look them up
  if (entity.value.length > MAX_ENTITY_LENGTH) {
    return true;
  }

  // Domain labels (the parts in between the periods, must be 63 characters or less
  if (entity.isDomain) {
    const invalidLabel = entity.value.split('.').find((label) => {
      return label.length > MAX_DOMAIN_LABEL_LENGTH;
    });

    if (typeof invalidLabel !== 'undefined') {
      return true;
    }
  }

  if (entity.isIPv4 && IGNORED_IPS.has(entity.value)) {
    return true;
  }

  return false;
}

function _isEntityBlacklisted(entity, options) {
  const blacklist = options.blacklist;

  Logger.trace({ blacklist: blacklist }, 'checking to see what blacklist looks like');

  if (_.includes(blacklist, entity.value.toLowerCase())) {
    return true;
  }

  if (entity.isIP && !entity.isPrivateIP) {
    if (ipBlacklistRegex !== null) {
      if (ipBlacklistRegex.test(entity.value)) {
        Logger.debug({ ip: entity.value }, 'Blocked BlackListed IP Lookup');
        return true;
      }
    }
  }

  if (entity.isDomain) {
    if (domainBlacklistRegex !== null) {
      if (domainBlacklistRegex.test(entity.value)) {
        Logger.debug({ domain: entity.value }, 'Blocked BlackListed Domain Lookup');
        return true;
      }
    }
  }

  return false;
}

function validateOptions(userOptions, cb) {
  let errors = [];
  if (
    typeof userOptions.apiKey.value !== "string" ||
    (typeof userOptions.apiKey.value === "string" &&
      userOptions.apiKey.value.length === 0)
  ) {
    errors.push({
      key: "apiKey",
      message: "You must provide a valid Flashpoint API key"
    });
  }
  cb(null, errors);
}


module.exports = {
  doLookup: doLookup,
  startup: startup,
  validateOptions: validateOptions
};
