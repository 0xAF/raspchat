/*
Copyright (c) 2015 Zohaib
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var utils = require('./vendor/utils');
var vue = require('vue');
var core = require('./core');
var win = window;

require('./components/filters.js')
require('./components/app-bar');
require('./components/chat-compose');
require('./components/chat-log');
require('./components/chat-message');
require('./components/chrome-bar');
require('./components/group-list');
require('./components/toggle-buttons');
require('./components/sign-in');
require('./components/settings-dialog');
require('./components/file-uploader');
require('./components/files-upload');

var groupsLog = {};
var whatOS = function (){
  if (navigator.appVersion.indexOf("Mac")!=-1) return "MacOS";
  if (navigator.appVersion.indexOf("Win")!=-1) return "Windows";
  if (navigator.appVersion.indexOf("Linux")!=-1) return "Linux";
  if (navigator.appVersion.indexOf("X11")!=-1) return "Linux";

  if (navigator.appVersion.indexOf("IEMobile") != -1) return "Windows";
  if (navigator.appVersion.indexOf("AppleWebKit") != -1) return "iOS";
  if (navigator.appVersion.indexOf("Android") != -1) return "Android";
};

new vue({
  el: '#root',
  data: function () {
    return {
        nick: '',
        currentGroup: {name: '', messages: []},
        isConnected: false,
        isConnecting: false,
        isReady: false,
        settingsVisible: false,
        showAppBar: false,
        osName: whatOS()
      };
  },

  ready: function () {
    if (this.$el.offsetWidth > 600) {
      this.$set('showAppBar', true);
    }

    this.transport = core.GetTransport('chat');
    this.transport.events.on('connected', this.onConnected);
    this.transport.events.on('disconnected', this.onDisconnected);
    this.transport.events.on('handshake', this.onHandshaked);

    this.transport.events.on('raw-message', this.onRawMessage);
    this.transport.events.on('message', this.onMessage);
    this.transport.events.on('joined', this.onJoin);
    this.transport.events.on('leave', this.onLeave);
    this.transport.events.on('switch', this.onSwitch);
    this.transport.events.on('history', this.onHistoryRecv);
    this.transport.events.on('nick-changed', this.changeNick);
    this.transport.events.on('members-list', this.onMembersList);

    this.$on('switch', this.onSwitch);
    this.$on('leave', function (group) {
      this.transport.send(group, '/leave ' + group);
    });

    /* jshint unused: false */
    this.$watch('currentGroup.name', function (newVal, oldVal) 
    { 
      this.$broadcast('group_switched', newVal);
    });
  },

  methods: {
    onSignedIn: function (nick) {
      this.$set('nick', nick);
      this.connect();
    },

    connect: function () {
      this.$set('isConnecting', true);
      this.$set('isConnected', true);
      this.transport.connect(this.nick);
    },

    sendMessage: function (msg) {
      // Don't let user send message on default group
      if (msg[0] == '/' && (!this.transport.isValidCmd(msg) || msg.toLowerCase().startsWith('/help'))) {
        this._appendMetaMessage(this.currentGroup.name, core.Transport.HelpMessage);
        return;
      }

      this.transport.send(this.currentGroup.name, msg);
    },

    onRawMessage: function (from, msg) {
      if (msg.type != 'Negotiate') {
        return;
      }
    },

    switchGroup: function (grp) {
      this.onSwitch(grp);
    },

    onMembersList: function (group, list) {
      this._appendMessage({
        to: group,
        from: this.defaultGroup,
        msg: 'Channel members for **' + group + '**\n\n - ' + list.join('\n - '),
        delivery_time: new Date()
      });
    },

    onHandshaked: function (info_channel) {
      this.defaultGroup = info_channel;
      this.transport.send(this.defaultGroup, '/join lounge');
    },

    onMessage: function (m) {
      this._appendMessage(m);
    },

    onConnected: function () {
      this.$set('isConnected', true);
      this.$broadcast('connection_on');
    },

    changeNick: function (newNick) {
      this.$set('nick', newNick);
    },

    onDisconnected: function () {
      this.$set('isConnecting', true);
      this.$broadcast('connection_off');
    },

    onJoin: function (joinInfo) {
      this._getOrCreateGroupLog(joinInfo.to);
      this._appendMetaMessage(joinInfo.to, joinInfo.from + ' has joined');
      if (this.currentGroup.name == this.defaultGroup) {
        this.switchGroup(joinInfo.to);
      }

      if (this.isConnecting) {
        this.$set('isConnecting', false);
      }
    },

    onLeave: function (info) {
      if (info.from == this.nick) {
        delete groupsLog[info.to];
        this.$broadcast('group_left', info.to);
      } else {
        this._appendMetaMessage(info.to, info.from + ' has left');
      }

      if (this.currentGroup.name == info.to && this.nick == info.from) {
        this.switchGroup(this.defaultGroup);
      }
    },

    onSwitch: function (group) {
      if (this.$el.offsetWidth < 600) {
        this.$set('showAppBar', false);
      }

      if (!this._getGroupLog(group)) {
        win.alert('You have not joined group ' + group);
        return true;
      }

      if (this.currentGroup.name == group) {
        return true;
      }

      this.$broadcast('group-switching', group);
      this.$set('currentGroup.name', group);
      this.$set('currentGroup.messages', groupsLog[group]);
      this.$broadcast('group-switched', group);
      return false;
    },

    onHistoryRecv: function (historyObj) {
      var msgs = historyObj.messages;
      this._clearGroupLogs();
      var me = this;
      win.setTimeout(function() {
          for (var i in msgs) {
            var m = msgs[i];
            var groupLog = me._getOrCreateGroupLog(m.to);

            if (!m.meta) {
              groupLog.push(m);
            } else {
              switch (m.meta.action) {
                case 'joined':
                  groupLog.push({isMeta: true, msg: m.from + ' has joined'});
                  break;
              case 'leave':
                  groupLog.push({isMeta: true, msg: m.from + ' has left'});
                  break;
              }
            }
          }

          me.$broadcast('history-added', historyObj.id);
      }, 100);
    },

    _appendMessage: function (m, silent) {
      var groupLog = this._getOrCreateGroupLog(m.to);

      if (!this.currentGroup.name) {
        this.$set('currentGroup.name', m.to);
        this.$set('currentGroup.messages', groupLog);
      }

      var continuation = groupLog.length && groupLog[groupLog.length - 1].from == m.from;
      var msg = utils.Mix({continuation: continuation}, m);
      groupLog.push(msg);

      this._limitGroupHistory(msg.to);

      // no need
      if (silent) {
        return;
      }

      this.$broadcast('message_new', m, {noNotification: m.to == this.defaultGroup || m.from == this.nick});
    },

    _appendMetaMessage: function (group, msg) {
      var groupLog = this._getOrCreateGroupLog(group);

      if (!this.currentGroup.name) {
        this.$set('currentGroup.name', group);
        this.$set('currentGroup.messages', groupLog);
      }

      groupLog.push({isMeta: true, msg: msg});
      this._limitGroupHistory(group);
    },

    _limitGroupHistory: function (group, limit) {
      limit = limit || 100;
      var log = this._getOrCreateGroupLog(group);

      if (log.length > limit) {
        log.splice(0, log.length - limit);
      }
    },

    _getOrCreateGroupLog: function (g) {
      if (!groupsLog[g]) {
        groupsLog[g] = [];
        this.$broadcast('group_joined', g);
      }

      return groupsLog[g];
    },

    _clearGroupLogs: function (g) {
      var logs = this._getGroupLog(g);
      if (logs) logs.splice(0, logs.length);
    },

    _getGroupLog: function (g) {
      return groupsLog[g] || null;
    }
  }
});
