'use strict';

const _ = require('lodash');
const quota = require('quota');
const common = require('googleapis-common');

const cache = {};
const paths = [{
    managerName: 'core',
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
];

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
            if (!cache[url]) {
                for (const path of paths) {
                    if (path.regex.test(url)) {
                        cache[url] = path;
                        break;
                    }
                }
            }

            let helper = cache[url];
            let quota = Object.assign({}, parameters.params.quota);

            if (helper) {
                if (!quota.managerName && _.isString(helper.managerName)) {
                    quota.managerName = helper.managerName;
                }

                if (!quota.scope && _.isFunction(helper.getScope)) {
                    quota.scope = helper.getScope(parameters);
                }

                if (!quota.resources && _.isFunction(helper.getResource)) {
                    quota.resources = helper.getResource(parameters);
                }
            }

            if (quota.managerName) {
                const {
                    managerName,
                    scope,
                    resources,
                    options
                } = quota;

                grant = await this.quotaClient.requestQuota(
                    `${this.managerPrefix}-${managerName}`,
                    scope,
                    resources,
                    options
                );
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