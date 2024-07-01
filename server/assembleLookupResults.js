const { size, getOr, map, some, get } = require('lodash/fp');
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

const createSummaryTags = ({ indicators, vulnerabilities }, options) => {
  if (size(indicators)) {
    return [`Indicators: ${size(indicators)}`];
  } else if (size(vulnerabilities)) {
    return [
      `Severity: ${getOr('Unknown')('[0].scores.severity')(vulnerabilities)}`,
      `Status: ${getOr('Unknown')('[0].vuln_status')(vulnerabilities)}`
    ];
  }
};

module.exports = assembleLookupResults;
