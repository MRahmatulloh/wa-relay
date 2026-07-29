import { Server } from 'socket.io';
import { verifyToken } from './middleware/auth.js';
import { User } from './models/User.js';

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Unauthorized'));
      const payload = verifyToken(String(token));
      const user = await User.findById(payload.sub);
      if (!user) return next(new Error('Unauthorized'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    console.log('socket connected', socket.user.username);
    socket.join('authenticated');
    socket.on('disconnect', () => {
      console.log('socket disconnected', socket.user.username);
    });
  });

  function broadcastMatched(message) {
    io.to('authenticated').emit('message:matched', message);
  }

  return { io, broadcastMatched };
}
