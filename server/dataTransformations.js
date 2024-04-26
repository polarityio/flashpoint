const {
  map,
  filter,
  get,
  flow,
  eq,
  flatMap,
  uniqWith,
  isEqual,
  identity,
  split,
  trim,
  uniq,
  compact,
  first,
  toLower,
  some,
  every,
  size
} = require('lodash/fp');

const isPrivateIP = (ip) => {
  var parts = ip.split('.');
  return (
    parts[0] === '10' ||
    (parts[0] === '172' &&
      parseInt(parts[1], 10) >= 16 &&
      parseInt(parts[1], 10) <= 31) ||
    (parts[0] === '192' && parts[1] === '168')
  );
};

const removePrivateIps = (entities) =>
  filter(({ isIP, value }) => !isIP || (isIP && !isPrivateIP(value)), entities);

const getEntityTypes = (typesToGet, entities) => {
  const lowerTypesToGet =
    typeof typesToGet === 'string' ? [toLower(typesToGet)] : map(toLower, typesToGet);

  const entitiesOfTypesToGet = filter((entity) => {
    const lowerEntityTypes = map(toLower, entity.types);

    const entityTypesAreInTypesToGet = some(
      (typeToGet) => lowerEntityTypes.includes(typeToGet),
      lowerTypesToGet
    );

    return entityTypesAreInTypesToGet;
  }, entities);

  return entitiesOfTypesToGet;
};

const removeEntityTypes = (typesToRemove, entities) => {
  const lowerTypesToRemove =
    typeof typesToRemove === 'string'
      ? [toLower(typesToRemove)]
      : map(toLower, typesToRemove);

  const entitiesNotOfTypesToRemove = filter((entity) => {
    const lowerEntityTypes = map(toLower, entity.types);

    const entityTypesAreNotInTypesToRemove = every(
      (typeToRemove) => !lowerEntityTypes.includes(typeToRemove),
      lowerTypesToRemove
    );

    return entityTypesAreNotInTypesToRemove;
  }, entities);

  return entitiesNotOfTypesToRemove;
};

const getResultForThisEntity = (
  entity,
  results,
  onlyOneResultExpected = false,
  onlyReturnUniqueResults = false
) =>
  flow(
    filter(flow(get('resultId'), eq(entity.value))),
    flatMap(get('result')),
    onlyReturnUniqueResults ? uniqWith(isEqual) : identity,
    onlyOneResultExpected ? first : identity
  )(results);

const splitCommaSeparatedUserOption = (key, options) =>
  flow(get(key), split(','), map(trim), compact, uniq)(options);

const removeBlocklistedIpsAndDomains = (entities, options) => {
  const ipBlocklistRegex = setupBlocklistRegex('ipBlocklistRegex', options);
  const domainBlocklistRegex = setupBlocklistRegex('domainBlocklistRegex', options);

  const entitiesNotInBlocklist = filter((entity) => {
    if (!(entity.isIP || entity.isDomain)) return true;

    const ipIsInBlocklist =
      entity.isIP && ipBlocklistRegex && ipBlocklistRegex.test(entity.value);

    const domainIsInBlocklist =
      entity.isDomain && domainBlocklistRegex && domainBlocklistRegex.test(entity.value);

    return !ipIsInBlocklist && !domainIsInBlocklist;
  }, entities);

  return entitiesNotInBlocklist;
};

const setupBlocklistRegex = (key, options) =>
  flow(get(key), size)(options) === 0 && new RegExp(options.domainBlocklistRegex, 'i');

module.exports = {
  removePrivateIps,
  getEntityTypes,
  removeEntityTypes,
  getResultForThisEntity,
  splitCommaSeparatedUserOption,
  removeBlocklistedIpsAndDomains
};
