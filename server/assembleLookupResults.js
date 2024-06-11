const { size, map, some, get } = require('lodash/fp');
const { getResultForThisEntity } = require('./dataTransformations');

const assembleLookupResults = (entities, indicators, vulnResults, options) =>
  map((entity) => {
    const resultsForThisEntity = getResultsForThisEntity(
      entity,
      indicators,
      vulnResults,
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

const getResultsForThisEntity = (entity, indicators, vulnResults, options) => ({
  indicators: getResultForThisEntity(entity, indicators),
  vulnerabilities: getResultForThisEntity(entity, vulnResults)
});

const createSummaryTags = ({ indicators, vulnResults }, options) => {
  const indicatorSize = size(indicators) || size(vulnResults);

  return [].concat(indicatorSize ? `Indicators: ${indicatorSize}` : []).concat(
    size(vulnResults)
      ? vulnResults.flatMap((hit) => {
          return []
            .concat(`Severity: ${hit.scores.severity}`)
            .concat(`Status: ${hit.vuln_status}`);
        })
      : []
  );
};

module.exports = assembleLookupResults;
