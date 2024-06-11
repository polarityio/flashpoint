const { map } = require('lodash/fp');

const {
  logging: { getLogger },
  errors: { parseErrorToReadableJson }
} = require('polarity-integration-utils');

const { requestsInParallel } = require('../request');

// This route not currently used.
const getNoncommunitySearchResults = async (cveEntities, options) => {
  const Logger = getLogger();

  try {
    const noncommunitySearchResultsRequests = map(
      (entity) => ({
        resultId: entity.value,
        route: `sources/v1/noncommunities/search`,
        qs: {
          limit: options.limit,
          query: `"${entity.value}"+basetypes:vulnerability`
        },
        options
      }),
      cveEntities
    );

    const noncommunitySearchResults = await requestsInParallel(
      noncommunitySearchResultsRequests,
      'body.hits.hits'
    );

    return noncommunitySearchResults;
  } catch (error) {
    const err = parseErrorToReadableJson(error);
    Logger.error(
      {
        formattedError: err,
        error
      },
      'Getting NonCommunity Search Results Failed'
    );
    throw error;
  }
};

module.exports = getNoncommunitySearchResults;
