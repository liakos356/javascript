'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createInstance;

var _uuid = require('uuid');

var _uuid2 = _interopRequireDefault(_uuid);

var _eventEmitter = require('event-emitter');

var _eventEmitter2 = _interopRequireDefault(_eventEmitter);

var _networking = require('./components/networking');

var _networking2 = _interopRequireDefault(_networking);

var _keychain = require('./components/keychain');

var _keychain2 = _interopRequireDefault(_keychain);

var _config = require('./components/config');

var _config2 = _interopRequireDefault(_config);

var _state = require('./components/state');

var _state2 = _interopRequireDefault(_state);

var _publish_queue = require('./components/publish_queue');

var _publish_queue2 = _interopRequireDefault(_publish_queue);

var _presence_heartbeat = require('./components/presence_heartbeat');

var _presence_heartbeat2 = _interopRequireDefault(_presence_heartbeat);

var _connectivity = require('./components/connectivity');

var _connectivity2 = _interopRequireDefault(_connectivity);

var _time = require('./endpoints/time');

var _time2 = _interopRequireDefault(_time);

var _presence = require('./endpoints/presence');

var _presence2 = _interopRequireDefault(_presence);

var _history = require('./endpoints/history');

var _history2 = _interopRequireDefault(_history);

var _push = require('./endpoints/push');

var _push2 = _interopRequireDefault(_push);

var _access = require('./endpoints/access');

var _access2 = _interopRequireDefault(_access);

var _channel_groups = require('./endpoints/channel_groups');

var _channel_groups2 = _interopRequireDefault(_channel_groups);

var _pubsub = require('./endpoints/pubsub');

var _pubsub2 = _interopRequireDefault(_pubsub);

var _publish = require('./endpoints/publish');

var _publish2 = _interopRequireDefault(_publish);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var packageJSON = require('../../package.json');
var utils = require('./utils');

var DEF_WINDOWING = 10; // MILLISECONDS.
var DEF_TIMEOUT = 15000; // MILLISECONDS.
var DEF_SUB_TIMEOUT = 310; // SECONDS.
var DEF_KEEPALIVE = 60; // SECONDS (FOR TIMESYNC).

// function to call when pubnub is shutting down.
function createInstance(setup) {
  var shutdown = setup.shutdown;
  var useSendBeacon = typeof setup.use_send_beacon !== 'undefined' ? setup.use_send_beacon : true;
  var sendBeacon = useSendBeacon ? setup.sendBeacon : null;
  var db = setup.db || { get: function get() {}, set: function set() {} };
  var error = setup.error || function () {};
  var hmac_SHA256 = setup.hmac_SHA256;
  var crypto_obj = setup.crypto_obj || {
    encrypt: function encrypt(a) {
      return a;
    },
    decrypt: function decrypt(b) {
      return b;
    }
  };

  var keychain = new _keychain2.default().setInstanceId(_uuid2.default.v4()).setAuthKey(setup.authKey || '').setSecretKey(setup.secretKey || '').setSubscribeKey(setup.subscribeKey).setPublishKey(setup.publishKey).setCipherKey(setup.cipherKey);

  keychain.setUUID(setup.uuid || !setup.unique_uuid && db.get(keychain.getSubscribeKey() + 'uuid') || _uuid2.default.v4());

  // write the new key to storage
  db.set(keychain.getSubscribeKey() + 'uuid', keychain.getUUID());

  var config = new _config2.default().setRequestIdConfig(setup.use_request_id || false).setPresenceTimeout(utils.validateHeartbeat(setup.heartbeat || setup.pnexpires || 0, error)).setSupressLeaveEvents(setup.noleave || 0)
  // .setSubscribeWindow(+setup.windowing || DEF_WINDOWING)
  // .setSubscribeTimeout((+setup.timeout || DEF_SUB_TIMEOUT) * constants.SECOND)
  .setInstanceIdConfig(setup.instance_id || false);

  config.setHeartbeatInterval(setup.heartbeat_interval || config.getPresenceTimeout() / 2 - 1);

  var stateStorage = new _state2.default();

  var networking = new _networking2.default(config, keychain, setup.ssl, setup.origin).addBeaconDispatcher(sendBeacon)
  // .setRequestTimeout(setup.timeout || DEF_TIMEOUT)
  .setCoreParams(setup.params || {});

  var publishQueue = new _publish_queue2.default({ networking: networking });

  // initialize the encryption and decryption logic
  function encrypt(input, key) {
    return crypto_obj.encrypt(input, key || keychain.getCipherKey()) || input;
  }

  function decrypt(input, key) {
    return crypto_obj['decrypt'](input, key || keychain.getCipherKey()) || crypto_obj['decrypt'](input, keychain.getCipherKey()) || input;
  }

  var eventEmitter = (0, _eventEmitter2.default)({});

  // initalize the endpoints
  var timeEndpoint = new _time2.default({ networking: networking });
  var historyEndpoint = new _history2.default({ networking: networking, decrypt: decrypt });

  var pushEndpoint = new _push2.default({ keychain: keychain, config: config, networking: networking, error: error });
  var presenceEndpoints = new _presence2.default({ keychain: keychain, config: config, networking: networking, error: error, state: stateStorage });

  var accessEndpoints = new _access2.default({ keychain: keychain, config: config, networking: networking, error: error, hmac_SHA256: hmac_SHA256 });
  var channelGroupEndpoints = new _channel_groups2.default({ keychain: keychain, networking: networking, config: config, error: error });

  var publishEndpoints = new _publish2.default({ publishQueue: publishQueue, encrypt: encrypt });

  var pubsubEndpoints = new _pubsub2.default({ keychain: keychain, networking: networking, presenceEndpoints: presenceEndpoints, error: error, config: config, state: stateStorage });

  var presenceHeartbeat = new _presence_heartbeat2.default(config, stateStorage, presenceEndpoints, eventEmitter, error);
  var connectivity = new _connectivity2.default({ eventEmitter: eventEmitter, networking: networking, timeEndpoint: timeEndpoint });

  if (config.getPresenceTimeout() === 2) {
    config.setHeartbeatInterval(1);
  }

  var SELF = {

    accessManager: {
      grant: accessEndpoints.grant.bind(accessEndpoints),
      audit: accessEndpoints.audit.bind(accessEndpoints),
      revoke: accessEndpoints.revoke.bind(accessEndpoints)
    },

    history: historyEndpoint.fetch.bind(historyEndpoint),
    time: timeEndpoint.fetch.bind(timeEndpoint),
    publish: publishEndpoints.publish.bind(publishEndpoints),

    presence: {
      hereNow: function hereNow(args, callback) {
        presenceEndpoints.hereNow(args, callback);
      },
      whereNow: function whereNow(args, callback) {
        presenceEndpoints.whereNow(args, callback);
      },
      state: function state(args, callback) {
        presenceEndpoints.performState(args, callback);
      }
    },

    push: {
      provisionDevice: function provisionDevice(args) {
        pushEndpoint.provisionDevice(args);
      },
      sendPushNotification: function sendPushNotification(args) {
        return args;
      }
    },

    channelGroups: {
      listGroups: function listGroups(args, callback) {
        channelGroupEndpoints.listGroups(args, callback);
      },
      deleteGroup: function deleteGroup(args, callback) {
        channelGroupEndpoints.removeGroup(args, callback);
      },
      listChannels: function listChannels(args, callback) {
        channelGroupEndpoints.listChannels(args, callback);
      },
      addChannel: function addChannel(args, callback) {
        channelGroupEndpoints.addChannel(args, callback);
      },
      removeChannel: function removeChannel(args, callback) {
        channelGroupEndpoints.removeChannel(args, callback);
      }
    },

    getCipherKey: function getCipherKey() {
      return keychain.getCipherKey();
    },
    setCipherKey: function setCipherKey(key) {
      keychain.setCipherKey(key);
    },
    rawEncrypt: function rawEncrypt(input, key) {
      return encrypt(input, key);
    },
    rawDecrypt: function rawDecrypt(input, key) {
      return decrypt(input, key);
    },
    getHeartbeat: function getHeartbeat() {
      return config.getPresenceTimeout();
    },
    setHeartbeat: function setHeartbeat(heartbeat, heartbeat_interval) {
      config.setPresenceTimeout(utils.validateHeartbeat(heartbeat, config.getPresenceTimeout(), error));
      config.setHeartbeatInterval(heartbeat_interval || config.getPresenceTimeout() / 2 - 1);
      if (config.getPresenceTimeout() === 2) {
        config.setHeartbeatInterval(1);
      }

      // emit the event
      eventEmitter.emit('presenceHeartbeatChanged');
    },
    getHeartbeatInterval: function getHeartbeatInterval() {
      return config.getHeartbeatInterval();
    },
    setHeartbeatInterval: function setHeartbeatInterval(heartbeatInterval) {
      config.setHeartbeatInterval(heartbeatInterval);
      eventEmitter.emit('presenceHeartbeatChanged');
    },
    getVersion: function getVersion() {
      return packageJSON.version;
    },
    addParam: function addParam(key, val) {
      networking.addCoreParam(key, val);
    },
    setAuthKey: function setAuthKey(auth) {
      keychain.setAuthKey(auth);
      eventEmitter.emit('keychainChanged');
    },
    unsubscribe: function unsubscribe(args, callback) {
      TIMETOKEN = 0;
      SUB_RESTORE = 1; // REVISIT !!!!

      pubsubEndpoints.performUnsubscribe(args, callback);

      CONNECT();
    },


    subscribe: function subscribe(args, callback) {},

    setUUID: function setUUID(uuid) {
      keychain.setUUID(uuid);
      eventEmitter.emit('keychainChanged');
    },
    getUUID: function getUUID() {
      return keychain.getUUID();
    },
    getSubscribedChannels: function getSubscribedChannels() {
      return stateStorage.generate_channel_list(true);
    },
    stopTimers: function stopTimers() {
      connectivity.stop();
      presenceHeartbeat.stop();
    },
    shutdown: function (_shutdown) {
      function shutdown() {
        return _shutdown.apply(this, arguments);
      }

      shutdown.toString = function () {
        return _shutdown.toString();
      };

      return shutdown;
    }(function () {
      SELF.stopTimers();
      if (shutdown) shutdown();
    })
  };

  /*
    create the connectivity element last, this will signal to other elements
    that the SDK is connected to internet.
  */
  // connectivity.start();
  // presenceHeartbeat.start();

  return SELF;
}