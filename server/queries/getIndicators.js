const { map } = require('lodash/fp');

const {
  logging: { getLogger },
  errors: { parseErrorToReadableJson }
} = require('polarity-integration-utils');

const { requestsInParallel } = require('../request');

const getIndicators = async (entities, options) => {
  const Logger = getLogger();

  try {
    const indicatorsRequests = map(
      (entity) => ({
        resultId: entity.value,
        route: `technical-intelligence/v1/simple`,
        qs: {
          limit: options.limit,
          hide_noisy_tags: true,
          ...buildQuery(entity)
        },
        options
      }),
      entities
    );

    const indicators = await requestsInParallel(indicatorsRequests, 'body');

    return indicators;
  } catch (error) {
    const err = parseErrorToReadableJson(error);
    Logger.error(
      {
        formattedError: err,
        error
      },
      'Getting Indicators Failed'
    );
    throw error;
  }
};

const buildQuery = (entity) => {
  if (entity.isIP) {
    return {
      query: entity.value,
      types: 'ip-dst|port,ip-dst,ip-src,ip-src|port'
    };
  }
  if (entity.isDomain) {
    return {
      query: entity.value,
      types: 'domain,url'
    };
  }
  if (entity.isEmail) {
    return {
      // Note that emails do not have a specific type so we do an exact match search as the
      // next best option
      query: `"${entity.value}"`
    };
  }
  if (entity.isMD5) {
    return {
      query: entity.value,
      types: 'md5'
    };
  }
  if (entity.isSHA1) {
    return {
      query: entity.value,
      types: 'sha1'
    };
  }
  if (entity.isSHA256) {
    return {
      query: entity.value,
      types: 'sha256'
    };
  }
};

module.exports = getIndicators;
