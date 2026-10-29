/**
 * Socket.io wiring. Kept intentionally thin: routes emit the domain
 * events (listing:new, bid:new, activity:pulse, ...) after a
 * successful write, and this file only manages room membership so a
 * client watching one listing's bid thread doesn't receive every
 * other listing's traffic.
 */
function initSockets(io) {
  io.on("connection", (socket) => {
    socket.on("listing:watch", (listingId) => {
      socket.join(`listing:${listingId}`);
    });
    socket.on("listing:unwatch", (listingId) => {
      socket.leave(`listing:${listingId}`);
    });

    socket.on("disconnect", () => {
      // no-op; rooms are cleaned up automatically by socket.io
    });
  });
}

module.exports = initSockets;
