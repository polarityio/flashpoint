const { get } = require('lodash/fp');

const {
  logging: { getLogger },
  errors: { parseErrorToReadableJson }
} = require('polarity-integration-utils');

const { requestWithDefaults } = require('../request');

const getReports = async (entity, options) => {
  const Logger = getLogger();

  try {
    const reports = get(
      'body.data',
      await requestWithDefaults({
        route: `finished-intelligence/v1/reports`,
        qs: {
          query: entity.value
        },
        options
      })
    );

    return reports;
  } catch (error) {
    const err = parseErrorToReadableJson(error);
    Logger.error(
      {
        formattedError: err,
        error
      },
      'Getting Reports Failed'
    );
    throw error;
  }
};

module.exports = getReports;
