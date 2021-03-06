/* @flow */

import { LeaveArguments, ModulesInject } from '../../flow_interfaces';

export function getOperation(): string {
  return 'PNUnsubscribeOperation';
}

export function validateParams(modules: ModulesInject) {
  let { config } = modules;

  if (!config.subscribeKey) return 'Missing Subscribe Key';
}

export function getURL(modules: ModulesInject, incomingParams: LeaveArguments): string {
  let { config } = modules;
  let { channels = [] } = incomingParams;
  let stringifiedChannels = channels.length > 0 ? channels.join(',') : ',';
  return '/v2/presence/sub-key/' + config.subscribeKey + '/channel/' + encodeURIComponent(stringifiedChannels) + '/leave';
}

export function getRequestTimeout({ config }: ModulesInject) {
  return config.getTransactionTimeout();
}

export function isAuthSupported() {
  return true;
}

export function prepareParams(modules: ModulesInject, incomingParams: LeaveArguments): Object {
  let { channelGroups = [] } = incomingParams;
  let params = {};

  if (channelGroups.length > 0) {
    params['channel-group'] = encodeURIComponent(channelGroups.join(','));
  }

  return params;
}

export function handleResponse(): Object {
  return {};
}
