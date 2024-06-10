const { get } = require('lodash/fp');

const {
  logging: { getLogger },
  errors: { parseErrorToReadableJson }
} = require('polarity-integration-utils');

const { requestWithDefaults } = require('../request');

const getEvent = async (url, options) => {
  const Logger = getLogger();

  try {
    const event = get(
      'body.0',
      await requestWithDefaults({
        url,
        options
      })
    );

    return event;
  } catch (error) {
    const err = parseErrorToReadableJson(error);
    Logger.error(
      {
        formattedError: err,
        error
      },
      'Getting Event Details Failed'
    );
    throw error;
  }
};

module.exports = getEvent;
