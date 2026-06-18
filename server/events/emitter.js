'use strict';

const EventEmitter = require('events');

/**
 * Process-wide internal event bus.
 *
 * Services emit domain events here; the socket.bridge then forwards them to
 * connected admin clients.  Business logic never touches Socket.IO directly.
 *
 * Usage:
 *   const emitter = require('../events/emitter');
 *   const EVENTS  = require('../events/events');
 *   emitter.emit(EVENTS.ORDER_CREATED, { orderId, ... });
 */
const emitter = new EventEmitter();

// Raise the default cap to accommodate all bridge listeners without false warnings.
emitter.setMaxListeners(30);

module.exports = emitter;
