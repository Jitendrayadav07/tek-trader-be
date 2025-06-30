const { block } = require("sharp");
const { Server } = require("socket.io");

const connectedUsers = new Map();               // socket.id -> userId
const userMessageTimestamps = new Map();        // userId -> [timestamps]
const blockedUsers = new Map();                 // userId -> blockUntil timestamp

function initSocket(server) {
  const io = new Server(server, {
    path: '/ws',
    cors: {
      origin: "*",  
      methods: ["GET", "POST"],
    },
  });
  
  io.on("connection", (socket) => {
    const userId = socket.handshake.auth.userId;


    if (!userId) {
      socket.emit("connection_error", "User ID required");
      socket.disconnect();
      return;
    }

    console.log(`User connected: ${socket.id} (userId: ${userId})`);
    connectedUsers.set(socket.id, userId);

    io.emit("user_joined", { userId });
    io.emit("update_user_count", connectedUsers.size);

    socket.on("send_message", (data) => {
      const now = Date.now();

      // 🛑 Check if user is blocked
      const blockedUntil = blockedUsers.get(userId);
      if (blockedUntil && now < blockedUntil) {
        console.log("you are blocked !")
        socket.emit("rate_limit_blocked", "You are temporarily blocked for spamming. Try again later.");
        return;
      }

      const timestamps = userMessageTimestamps.get(userId) || [];

      // Filter last 10 seconds
      const recent = timestamps.filter(ts => now - ts < 10000);

      if (recent.length >= 5) {
        socket.emit("rate_limit_warning", "You're sending messages too fast. You are now blocked for 1 minute.");

        // 🛑 Block user for 1 minute
        blockedUsers.set(userId, now + 60000);
        return;
      }

      recent.push(now);
      userMessageTimestamps.set(userId, recent);

      // Broadcast clean message
      socket.broadcast.emit("receive_message", data);
    });

    socket.on("disconnect", () => {
      const username = connectedUsers.get(socket.id);

      if (username) {
        io.emit("user_left", { userId: username });
        connectedUsers.delete(socket.id);
        io.emit("update_user_count", connectedUsers.size);
      }

      console.log(`❌ User disconnected: ${socket.id} (userId: ${userId})`);
    });
  });

  return io;
}

module.exports = initSocket;
