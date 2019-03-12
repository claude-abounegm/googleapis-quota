'use strict';

const _ = require('lodash');
const quota = require('quota');
const common = require('googleapis-common');

const paths = {
    'core': {
        regex: /\/data\/ga$/,
        getScope: ({
            params: {
                ids
            }
        }) => {
            return {
                'viewId': /ga:([0-9]+)/.exec(ids)[1]
            };
        },
        getResource: () => {
            return {
                requests: 1
            };
        }
    },
    // 'provisioning': /\/provisioning\/.+$/,
    // 'real-time': /\/data\/realtime$/,
    // 'mcf': /\/data\/mcf$/,
    // 'management': /\/management\/.+$/
};

class GoogleApisQuota {
    constructor(quotaServers, managerPrefix = 'ga') {
        this.quotaClient = new quota.Client(quotaServers);
        this.managerPrefix = managerPrefix;

        if (!common._createAPIRequest) {
            common._createAPIRequest = common.createAPIRequest;
        }

        this._init();
    }

    reset() {
        GoogleApisQuota.reset();

        if (this.quotaClient) {
            this.quotaClient.dispose();
        }
    }

    static reset() {
        if (common._createAPIRequest) {
            common.createAPIRequest = common._createAPIRequest;
        }
    }

    /**
     * @private
     */
    _init() {
        common.createAPIRequest = (parameters, callback) => {
            if (callback) {
                this.createAPIRequestAsync(parameters).then(r => callback(null, r), callback);
            } else {
                return this.createAPIRequestAsync(parameters);
            }
        };
    }

    /**
     * @private
     */
    async createAPIRequestAsync(parameters) {
        if (parameters.params.quota === false) {
            return common._createAPIRequest(parameters);
        }

        const url = parameters.options.url;
        let grant;
        if (url) {
            for (const [managerName, {
                    regex,
                    getScope,
                    getResource
                }] of _.toPairs(paths)) {
                if (regex.test(url)) {
                    grant = await this.quotaClient.requestQuota(
                        `${this.managerPrefix}-${managerName}`,
                        getScope(parameters),
                        getResource(parameters),
                        parameters.params.quota || {}
                    );
                    break;
                }
            }
        }

        let error;
        try {
            return await common._createAPIRequest(parameters);
        } catch (e) {
            error = e;
            throw e;
        } finally {
            grant && await grant.dismiss({
                error
            });
        }
    }
}

module.exports = GoogleApisQuota;