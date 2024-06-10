'use strict';
polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  summary: Ember.computed.alias('block.data.summary'),
  activeTab: 'indicators',
  timezone: Ember.computed('Intl', function () {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }),
  init() {
    this._super(...arguments);
  },
  actions: {
    changeTab: function (tabName) {
      this.set('activeTab', tabName);
    },
    clearError: function (index) {
      this.set(`details.indicators.${index}._eventEnrichedError`, '');
    },
    toggleEventDetails: function (eventLink, index) {
      this.toggleProperty(`details.indicators.${index}._eventOpen`);

      if (!this.get(`details.indicators.${index}._eventEnriched`)) {
        this.set(`details.indicators.${index}._eventLoading`, true);

        const payload = {
          action: 'GET_EVENT',
          eventLink
        };

        this.sendIntegrationMessage(payload)
          .then((result) => {
            console.info('getEvent result', result);
            this.set(`details.indicators.${index}._eventEnriched`, result);
          })
          .catch((error) => {
            console.error('Error fetching event details', error);
            this.set(
              `details.indicators.${index}._eventEnrichedError`,
              JSON.stringify(error, null, 2)
            );
          })
          .finally(() => {
            this.set(`details.indicators.${index}._eventLoading`, false);
          });
      }
    }
  }
});
