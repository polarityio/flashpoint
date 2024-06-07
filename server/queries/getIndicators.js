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
          query:
            entity.isHash || entity.isIPv4 || entity.isDomain || entity.isEmail
              ? `"${entity.value}"`
              : entity.value
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

module.exports = getIndicators;
