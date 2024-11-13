const { size } = require('lodash/fp');
const async = require('async');
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
  getReportById,
  getEvent,
  getIndicators,
  getReports,
  getVulnerability,
  getReportImage
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

    const [indicators, vulnResults] = await Promise.all([
      getIndicators(nonCveEntities, options),
      getVulnerability(cveEntities, options)
    ]);

    Logger.trace({
      indicators,
      vulnResults
    });

    const lookupResults = assembleLookupResults(
      entities,
      indicators,
      vulnResults,
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
  switch (payload.action) {
    case 'GET_EVENT':
      try {
        const event = await getEvent(payload.eventLink, options);
        cb(null, event);
      } catch (error) {
        const err = parseErrorToReadableJson(error);

        Logger.error({ error, formattedError: err }, 'Get Event Details Failed');
        cb(err);
      }
      break;
    case 'GET_REPORT_ASSETS':
      try {
        const assets = payload.assets;
        const images = {};
        await async.eachLimit(assets, 5, async (asset) => {
          const reportImageAsBase64 = await getReportImage(asset, options);
          images[asset] = reportImageAsBase64;
        });

        Logger.trace({ fetchedAssetNames: Object.keys(images) }, 'GET_REPORT_ASSETS');

        cb(null, {
          images
        });
      } catch (error) {
        const err = parseErrorToReadableJson(error);

        Logger.error({ error, formattedError: err }, 'GET_REPORT_ASSETS Failed');
        cb(err);
      }
      break;
    // Not currently used as the content of the report is returned by `getReports`
    case 'GET_REPORT':
      try {
        const report = await getReportById(payload.reportId, options);
        Logger.info({ assets: report.assets }, 'Image assets');
        cb(null, report);
      } catch (error) {
        const err = parseErrorToReadableJson(error);

        Logger.error({ error, formattedError: err }, 'GET_REPORT Failed');
        cb(err);
      }
      break;
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
