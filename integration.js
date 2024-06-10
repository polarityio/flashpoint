const { size } = require('lodash/fp');
const {
  logging: { setLogger, getLogger },
  errors: { parseErrorToReadableJson }
} = require('polarity-integration-utils');

const { validateOptions } = require('./server/userOptions');
const {
  removePrivateIps,
  removeEntityTypes,
  getEntityTypes,
  removeBlocklistedIpsAndDomains
} = require('./server/dataTransformations');
const {
  getEvent,
  getIndicators,
  getReports,
  getNoncommunitySearchResults
} = require('./server/queries');

const assembleLookupResults = require('./server/assembleLookupResults');

const doLookup = async (entities, options, cb) => {
  const Logger = getLogger();
  try {
    Logger.trace({ entities }, 'doLookup');

    const entitiesWithoutBlocklistedEntities = removeBlocklistedIpsAndDomains(
      entities,
      options
    );

    const searchableEntities = removePrivateIps(entitiesWithoutBlocklistedEntities);

    const nonCveEntities = removeEntityTypes('cve', searchableEntities);
    const cveEntities = getEntityTypes('cve', searchableEntities);

    const [indicators, noncommunitySearchResults] = await Promise.all([
      getIndicators(nonCveEntities, options),
      getNoncommunitySearchResults(cveEntities, options)
    ]);

    Logger.trace({
      indicators,
      noncommunitySearchResults
    });

    const lookupResults = assembleLookupResults(
      entities,
      indicators,
      noncommunitySearchResults,
      options
    );

    Logger.trace({ lookupResults }, 'Lookup Results');

    cb(null, lookupResults);
  } catch (error) {
    const err = parseErrorToReadableJson(error);

    Logger.error({ error, formattedError: err }, 'Get Lookup Results Failed');
    cb({ detail: error.message || 'Lookup Failed', err });
  }
};

const onMessage = async (payload, options, cb) => {
  const Logger = getLogger();
  Logger.trace({ payload }, 'onMessage');
  try {
    const event = await getEvent(payload.eventLink, options);
    cb(null, event);
  } catch (error) {
    const err = parseErrorToReadableJson(error);

    Logger.error({ error, formattedError: err }, 'Get Event Details Failed');
    cb(err);
  }
};

const onDetails = async (lookupObject, options, cb) => {
  const Logger = getLogger();
  try {
    const reports = await getReports(lookupObject.entity, options);
    if (size(reports)) {
      lookupObject.data.details.reports = reports;
      lookupObject.data.summary.push(`Report Count: ${reports.length}`);
      Logger.trace(
        { lookup: lookupObject.data },
        'Looking at the data after on details.'
      );
    }

    cb(null, lookupObject.data);
  } catch (error) {
    const err = parseErrorToReadableJson(error);

    Logger.error({ error, formattedError: err }, 'Get Reports Failed');
    cb(err);
  }
};

module.exports = {
  startup: setLogger,
  validateOptions,
  doLookup,
  onDetails,
  onMessage
};
