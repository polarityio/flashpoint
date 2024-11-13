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
    let array = new Uint32Array(5);
    this.set('uniqueIdPrefix', window.crypto.getRandomValues(array).join(''));
  },
  actions: {
    changeTab: function (tabName) {
      this.set('activeTab', tabName);
    },
    clearError: function (index) {
      this.set(`details.indicators.${index}._eventEnrichedError`, '');
    },
    getReportAssets: function (reportId, index) {
      const assets = this.get(`details.reports.${index}.assets`);

      // Not all reports have assets to load so just return if that's the case
      if (!assets || assets.length === 0) {
        this.toggleProperty(`details.reports.${index}._reportOpen`);
        return;
      }

      // Check to see if we've already loaded assets
      if (this.get(`details.reports.${index}.__assetsLoaded`)) {
        this.toggleProperty(`details.reports.${index}._reportOpen`);
        return;
      }

      this.set(`details.reports.${index}._loadingReport`, true);

      const payload = {
        action: 'GET_REPORT_ASSETS',
        assets
      };

      this.sendIntegrationMessage(payload)
        .then((result) => {
          let reportContent = this.get(`details.reports.${index}.body`);
          assets.forEach((asset) => {
            console.info('Replacing assets ' + asset);
            const imageSrcToReplace = new RegExp(
              `/finished-intelligence/v1${asset}`,
              'g'
            );
            reportContent = reportContent.replace(
              imageSrcToReplace,
              result.images[asset]
            );
          });
          this.set(`details.reports.${index}.body`, reportContent);
          this.set(`details.reports.${index}.__assetsLoaded`, true);
          this.toggleProperty(`details.reports.${index}._reportOpen`);
        })
        .catch((err) => {
          console.error(err);
          this.set(`details.reports.${index}.__loadingError`, JSON.stringify(err, null, 2));
        })
        .finally(() => {
          this.set(`details.reports.${index}._loadingReport`, false);
        });
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
    },
    copyData: function () {
      Ember.run.scheduleOnce(
        'afterRender',
        this,
        this.copyElementToClipboard,
        `flashpoint-container-${this.get('uniqueIdPrefix')}`
      );

      Ember.run.scheduleOnce('destroy', this, this.restoreCopyState);
    }
  },
  copyElementToClipboard(element) {
    window.getSelection().removeAllRanges();
    let range = document.createRange();

    range.selectNode(
      typeof element === 'string' ? document.getElementById(element) : element
    );
    window.getSelection().addRange(range);
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
  },
  restoreCopyState() {
    this.set('showCopyMessage', true);

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.set('showCopyMessage', false);
      }
    }, 2000);
  }
});
