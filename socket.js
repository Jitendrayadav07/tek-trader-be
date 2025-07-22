
const { Server } = require("socket.io");
const redisClient = require('./utils/redisClient.js');
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

  io.on("connection", async (socket) => {
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

    // ✅ Fetch global chat history
    try {
      const messages = await redisClient.lRange("chat:global", 0, -1);
      const parsed = messages.map(m => JSON.parse(m));
      socket.emit("load_previous_messages", parsed);
    } catch (err) {
      console.error("Redis load error:", err);
    }

    socket.on("send_message", async (data) => {
      const now = Date.now();

      const blockedUntil = blockedUsers.get(userId);
      if (blockedUntil && now < blockedUntil) {
        socket.emit("rate_limit_blocked", "You are temporarily blocked for spamming. Try again later.");
        return;
      }

      const timestamps = userMessageTimestamps.get(userId) || [];
      const recent = timestamps.filter(ts => now - ts < 10000);

      if (recent.length >= 5) {
        socket.emit("rate_limit_warning", "You're sending messages too fast. You are now blocked for 1 minute.");
        blockedUsers.set(userId, now + 60000);
        return;
      }

      recent.push(now);
      userMessageTimestamps.set(userId, recent);

      // ✅ Save message to Redis with TTL
      const redisKey = `chat:global`;
      const message = {
        username: data.username,
        message: data.message,
        sender: userId,
        timestamp: now,
      };

      try {
        await redisClient.rPush(redisKey, JSON.stringify(message));
        await redisClient.expire(redisKey, 1800); // 30 minutes = 1800 seconds
      } catch (err) {
        console.error("Redis error:", err);
      }

      // Broadcast to others
      socket.broadcast.emit("receive_message", message);
    });

    socket.on("disconnect", () => {
      const username = connectedUsers.get(socket.id);
      if (username) {
        io.emit("user_left", { userId: username });
        connectedUsers.delete(socket.id);
        io.emit("update_user_count", connectedUsers.size);
      }

    });
  });

  return io;
}

module.exports = initSocket;
