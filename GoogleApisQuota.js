'use strict';

module.exports = (function () {
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
        {
            managerName: 'management',
            regex: /\/management\/.+$/
        },
        // 'provisioning': /\/provisioning\/.+$/,
        // 'real-time': /\/data\/realtime$/,
        // 'mcf': /\/data\/mcf$/
    ];
    let quotaClient;
    let managerPrefix;

    function init() {
        quotaClient = new quota.Client(quotaServers);
        managerPrefix = managerPrefix;

        if (!common._createAPIRequest) {
            common._createAPIRequest = common.createAPIRequest;
        }

        common.createAPIRequest = (parameters, callback) => {
            if (callback) {
                createAPIRequestAsync(parameters).then(r => callback(null, r), callback);
            } else {
                return createAPIRequestAsync(parameters);
            }
        };
    }

    function reset() {
        if (common._createAPIRequest) {
            common.createAPIRequest = common._createAPIRequest;
        }

        if (quotaClient) {
            quotaClient.dispose();
        }
    }

    /**
     * @private
     */
    async function createAPIRequestAsync(parameters) {
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
                    managerName ? `${this.managerPrefix}-${managerName}` : this.managerPrefix,
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

    return {
        init,
        reset
    };
})();
