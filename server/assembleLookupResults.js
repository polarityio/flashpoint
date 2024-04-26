const { size, map, some, get } = require('lodash/fp');
const { getResultForThisEntity } = require('./dataTransformations');

const assembleLookupResults = (
  entities,
  indicators,
  noncommunitySearchResults,
  options
) =>
  map((entity) => {
    const resultsForThisEntity = getResultsForThisEntity(
      entity,
      indicators,
      noncommunitySearchResults,
      options
    );

    const resultsFound = some(size, resultsForThisEntity);

    const lookupResult = {
      entity,
      data: resultsFound
        ? {
            summary: createSummaryTags(resultsForThisEntity, options),
            details: resultsForThisEntity
          }
        : null
    };

    return lookupResult;
  }, entities);

const getResultsForThisEntity = (
  entity,
  indicators,
  noncommunitySearchResults,
  options
) => ({
  indicators: getResultForThisEntity(entity, indicators),
  noncommunitySearchResults: getResultForThisEntity(entity, noncommunitySearchResults)
});

const createSummaryTags = ({ indicators, noncommunitySearchResults }, options) => {
  const indicatorSize = size(indicators) || size(noncommunitySearchResults);

  return [].concat(indicatorSize ? `Indicators: ${indicatorSize}` : []).concat(
    size(noncommunitySearchResults)
      ? noncommunitySearchResults.flatMap((hit) => {
          const cvssV2BaseScore =
            get('_source.cve.nist.cvssv2.base_score', hit) ||
            get('_source.nist.cvssv2.base_score', hit);

          const cvssV3BaseScore =
            get('_source.cve.nist.cvssv2.base_score', hit) ||
            get('_source.nist.cvssv2.base_score', hit);

          return []
            .concat(cvssV2BaseScore ? `CVSSv2 Base Score: ${cvssV2BaseScore}` : [])
            .concat(cvssV3BaseScore ? `CVSSv3 Base Score: ${cvssV3BaseScore}` : []);
        })
      : []
  );
};

module.exports = assembleLookupResults;
