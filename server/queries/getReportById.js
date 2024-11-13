const { get } = require('lodash/fp');

const {
  logging: { getLogger },
  errors: { parseErrorToReadableJson }
} = require('polarity-integration-utils');

const { requestWithDefaults } = require('../request');

const getReportById = async (reportId, options) => {
  const Logger = getLogger();

  try {
    const report = get(
      'body',
      await requestWithDefaults({
        route: `finished-intelligence/v1/reports/${reportId}`,
        options
      })
    );

    Logger.info({report},'GetReportById');

    return report;
  } catch (error) {
    const err = parseErrorToReadableJson(error);
    Logger.error(
      {
        formattedError: err,
        error
      },
      `Getting Report with id ${reportId} Failed`
    );
    throw error;
  }
};

module.exports = getReportById;
