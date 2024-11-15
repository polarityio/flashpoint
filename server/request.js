const { map, get, getOr, filter, flow, negate, isEmpty } = require('lodash/fp');
const { parallelLimit } = require('async');

const {
  requests: { createRequestWithDefaults },
  logging: { setLogger, getLogger }
} = require('polarity-integration-utils');
const config = require('../config/config');

const requestWithDefaults = createRequestWithDefaults({
  config,
  roundedSuccessStatusCodes: [200],
  requestOptionsToOmitFromLogsKeyPaths: ['headers.Authorization'],
  preprocessRequestOptions: async ({ route, url, options, ...requestOptions }) => ({
    ...requestOptions,
    url: route ? `${options.url}/${route}` : url,
    headers: {
      ...requestOptions.headers,
      Authorization: 'Bearer ' + options.apiKey
    },
    qs: {
      ...requestOptions.qs
    },
    json: true
  }),
  postprocessRequestFailure: (error) => {
    if ([202].includes(error.status)) return null;

    try {
      const errorResponseBody = JSON.parse(error.description);
      error.message = `${error.message} - (${error.status})${
        errorResponseBody.message || errorResponseBody.errorMessage
          ? `| ${errorResponseBody.message || errorResponseBody.errorMessage}`
          : ''
      }`;
      throw error;
    } catch (parseError) {
      throw error;
    }
  }
});

const createRequestsInParallel =
  (requestWithDefaults) =>
  async (
    requestsOptions,
    responseGetPath,
    limit = 10,
    onlyReturnPopulatedResults = true
  ) => {
    const unexecutedRequestFunctions = map(
      ({ resultId, ...requestOptions }) =>
        async () => {
          const response = await requestWithDefaults(requestOptions);
          const result = responseGetPath ? get(responseGetPath, response) : response;
          return resultId ? { resultId, result } : result;
        },
      requestsOptions
    );

    const results = await parallelLimit(unexecutedRequestFunctions, limit);

    return onlyReturnPopulatedResults
      ? filter(
          flow((result) => getOr(result, 'result', result), negate(isEmpty)),
          results
        )
      : results;
  };

const requestsInParallel = createRequestsInParallel(requestWithDefaults);

module.exports = {
  requestWithDefaults,
  requestsInParallel
};
