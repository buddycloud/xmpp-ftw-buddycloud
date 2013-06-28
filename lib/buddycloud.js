var builder    = require('ltx'),
    PubSub     = require('xmpp-ftw-pubsub'),
    Presence   = require('xmpp-ftw/lib/presence'),
    dataForm   = require('xmpp-ftw/lib/utils/xep-0004'),
    Disco      = require('xmpp-ftw-disco'),
    async      = require('async')

var Buddycloud = function() {
    this.itemParser
    this.channelServer
    this.disco = new Disco()
    this.presence = new Presence()
}

Buddycloud.prototype.__proto__ = PubSub.prototype

var init = Buddycloud.prototype.init

Buddycloud.prototype.init = function(manager) {
    init.call(this, manager)
    this.disco.init(manager)
    this.presence.init(manager)
}

Buddycloud.prototype.NS_BUDDYCLOUD = 'http://buddycloud.org/v1'

Buddycloud.prototype.registerEvents = function() {
    var self = this
    this.socket.on('xmpp.buddycloud.discover', function(data, callback) {
        self.discover(data, callback)
    })
    this.socket.on('xmpp.buddycloud.presence', function() {
        if (!self._checkCall({})) return
        self.presence.sendPresence({
            to: self.channelServer,
            priority: -1,
            status: 'buddycloud',
            show: 'online'
        })
    })
    this.socket.on('xmpp.buddycloud.retrieve', function(data, callback) {
        if (!self._checkCall(data, callback)) return
        delete(data.id)
        self.getItems(data, callback)
    })
    this.socket.on('xmpp.buddycloud.subscribe', function(data, callback) {
        if (!self._checkCall(data, callback)) return
        delete(data.jid) 
        self.subscribe(data, callback)
    })
    this.socket.on('xmpp.buddycloud.unsubscribe', function(data, callback) {
        if (!self._checkCall(data, callback)) return
        delete(data.jid)
        self.unsubscribe(data, callback)
    })
    this.socket.on('xmpp.buddycloud.item.delete', function(data, callback) {
        if (!self._checkCall(data, callback)) return
        self.deleteItem(data, callback)
    })
    this.socket.on('xmpp.buddycloud.config.set', function(data, callback) {
        if (!self._checkCall(data, callback)) return
        self.setNodeConfiguration(data, callback)
    })
    this.socket.on('xmpp.buddycloud.config.get', function(data, callback) {
        if (!self._checkCall(data, callback)) return
        self.getNodeConfiguration(data, callback)
    })
}

Buddycloud.prototype.handles = function(stanza) {
    return (this.channelServer && (stanza.attrs.from == this.channelServer))
}

Buddycloud.prototype.handle = function(stanza) {
    var self = this
    if (null != stanza.getChild('event', this.NS_EVENT)) 
        return this._eventNotification(stanza)
    return false
}

Buddycloud.prototype._checkCall = function(data, callback) {
    if (!this.channelServer) {
        this._clientError(
            'You must perform discovery first!', data, callback
        )
        return false
    }
    data.to = this.channelServer
    return true
}

Buddycloud.prototype.discover = function(data, callback) {
    var self = this
    this.disco.getItems({of: this.manager.jid.split('@')[1]}, function(error, items) {
        if (error) return callback(error)
        var jobs = {}
        items.forEach(function(item) {
            jobs[item.jid] = function(infoCallback) {
                self.disco.getFeatures({of:item.jid}, function(error, features) {
                    if (error) features = []
                    infoCallback(null, features)
                })
            }
        })
        async.parallel(jobs, function(error, results) {
            var discovered = false
            if (error) return callback(error)
            for (var i in results) {
                results[i].forEach(function(feature) {
                    if (('identity' == feature.kind)
                        && (feature.category && 'pubsub' == feature.category)
                        && (feature.type && 'channels' == feature.type)) {
                        self.channelServer = i
                        discovered = true
                        return callback(null, i)
                    }
                })
            }
            if (false == discovered)
                return callback('No buddycloud server found')
        })
    })
}

Buddycloud.prototype._itemDeleteNotification = function(stanza, items) {
    var data = {}
    this._getItemData(items, data)
    this.socket.emit('xmpp.buddycloud.push.retract', data)
    return true
}

Buddycloud.prototype._itemNotification = function(stanza, items) {
    var data = {}
    this._getItemData(items, data)
    this.socket.emit('xmpp.buddycloud.push.item', data)
    return true
}

Buddycloud.prototype._configurationUpdate = function(stanza, configuration) {
    var data = {}
    this._getConfigurationChanges(configuration, data)
    this.socket.emit('xmpp.buddycloud.push.configuration', data)
    return true
}

Buddycloud.prototype._deleteNodeNotification = function(stanza, del) {
    var data = { }
    this._getDeleteNodeNotification(del, data)
    this.socket.emit('xmpp.buddycloud.push.delete', data)
    return true
}

module.exports = Buddycloud
