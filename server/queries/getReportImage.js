const {
  logging: { getLogger },
  errors: { parseErrorToReadableJson }
} = require('polarity-integration-utils');

const { requestWithDefaults } = require('../request');

const getReportImage = async (imagePath, options) => {
  const Logger = getLogger();

  try {
    const requestOptions = {
      route: `finished-intelligence/v1${imagePath}`,
      encoding: null,
      options
    };

    const response = await requestWithDefaults(requestOptions);

    return `data:image/png;charset=utf-8;base64,${Buffer.from(
      response.body,
      'binary'
    ).toString('base64')}`;
  } catch (error) {
    const err = parseErrorToReadableJson(error);
    Logger.error(
      {
        formattedError: err,
        error
      },
      `Getting Report Image ${imagePath} Failed`
    );
    throw error;
  }
};

module.exports = getReportImage;
