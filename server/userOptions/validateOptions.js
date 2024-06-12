const { validateStringOptions, validateUrlOption } = require('./utils');

const validateOptions = async (options, callback) => {
  const stringOptionsErrorMessages = {
    url: '* Required',
    apiKey: '* Required'
  };

  const stringValidationErrors = validateStringOptions(
    stringOptionsErrorMessages,
    options
  );

  const urlValidationError = validateUrlOption(options, 'url');
  const limitValidationError =
    options.limit.value < 1 || options.limit.value > 100
      ? [{ key: 'limit', message: 'Limit must be between 1 and 100' }]
      : [];

  const errors = stringValidationErrors
    .concat(urlValidationError)
    .concat(limitValidationError);

  callback(null, errors);
};

module.exports = validateOptions;
