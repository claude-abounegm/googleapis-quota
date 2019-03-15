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
            let helper;
            if (cache[url]) {
                helper = cache[url];
            } else {
                for (const path of paths) {
                    if (path.regex.test(url)) {
                        helper = value;
                        cache[url] = path;
                        break;
                    }
                }
            }

            let quota = {};

            if (helper) {
                const {
                    managerName,
                    getScope,
                    getResource
                } = helper;
                
                if(_.isString(managerName)) {
                    quota.managerName = managerName;
                }

                if(_.isFunction(getScope)) {
                    quota.scope = getScope(parameters);
                }

                if(_.isFunction(getResource)) {
                    quota.resources = getResource(parameters);
                }
            }

            Object.assign(quota, parameters.params.quota);

            if (quota.managerName) {
                const {
                    managerName,
                    scope,
                    resources,
                    options
                } = helper;

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