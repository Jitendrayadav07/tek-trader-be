const { Server } = require("socket.io");

const connectedUsers = new Map();

function initSocket(server) {
  const io = new Server(server, {
    path: '/ws',
    cors: {
      origin: "http://localhost:5173", // update this in prod
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    socket.on("user_connected", (username) => {
      connectedUsers.set(socket.id, username);
      io.emit("user_joined", { username });
      io.emit("update_user_count", connectedUsers.size);
    });

    socket.on("send_message", (data) => {
      socket.broadcast.emit("receive_message", data);
    });

    socket.on("disconnect", () => {
      const username = connectedUsers.get(socket.id);
      if (username) {
        io.emit("user_left", { username });
        connectedUsers.delete(socket.id);
        io.emit("update_user_count", connectedUsers.size);
      }
      console.log(`❌ User disconnected: ${socket.id}`);
    });
  });

  return io;
}

module.exports = initSocket;
