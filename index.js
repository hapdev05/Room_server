const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.HTTPS_URL || "*", // Configure properly for production
    methods: ["GET", "POST"]
  }
});

const port = process.env.PORT || 3001;

// Import routes and services
const userRoutes = require('./routes/userRoutes');
const roomRoutes = require('./routes/roomRoutes');
const shareRoutes = require('./routes/shareRoutes');
const logger = require('./middleware/logger');
const socketService = require('./services/socketService');

// Middleware
app.use(cors({
  origin: '*', // Configure this properly for production
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger); // Add request logging

// Serve static files (Frontend demo)
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Room Server API is running',
    version: '1.0.0',
          features: ['REST API', 'Socket.IO Realtime', 'Firebase Integration', 'Room Management', 'Share System'],
    endpoints: {
      health: '/health',
      users: '/api/users',
      rooms: '/api/rooms',
      share: '/api/share',
      socketTest: '/socket-test.html'
    },
      socketEvents: [
      'user-join', 'user-update', 'user-activity', 
      'typing-start', 'typing-stop', 'get-online-users',
      'send-notification', 'join-room', 'leave-room',
      'room-message', 'room-typing', 'share-link-created',
      'invitation-sent', 'invitation-response',
      'get-room-members', 'refresh-room-data'
    ]
  });
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/share', shareRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// Make io available globally for other modules
global.io = io;

// Initialize socket service
socketService.init(io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);
  
  // Handle user joining with their info
  socket.on('user-join', async (userData) => {
    const success = await socketService.handleUserConnection(socket, userData);
    if (success) {
      socket.emit('join-success', { message: 'Successfully joined the room' });
    } else {
      socket.emit('join-error', { message: 'Failed to join the room' });
    }
  });
  
  // Handle user disconnect
  socket.on('disconnect', async () => {
    await socketService.handleUserDisconnection(socket);
  });
  
  // Handle real-time user updates
  socket.on('user-update', (updateData) => {
    socketService.broadcastToAllUsers('user-data-updated', {
      ...updateData,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
    
    console.log(`📝 User updated via socket: ${updateData.id}`);
  });
  
  // Handle typing indicators
  socket.on('typing-start', (data) => {
    socketService.handleTyping(socket, data, true);
  });
  
  socket.on('typing-stop', (data) => {
    socketService.handleTyping(socket, data, false);
  });
  
  // Handle user activity updates
  socket.on('user-activity', async () => {
    if (socket.userId) {
      await socketService.updateUserActivity(socket.userId);
    }
  });
  
  // Get online users
  socket.on('get-online-users', () => {
    const onlineUsers = socketService.getOnlineUsers();
    socket.emit('online-users-list', onlineUsers);
  });
  
  // Handle sending notifications
  socket.on('send-notification', (data) => {
    if (data.targetUserId) {
      socketService.sendNotificationToUser(data.targetUserId, data.notification);
    } else {
      socketService.sendNotificationToAll(data.notification);
    }
  });

  // Room-related socket events
  socket.on('join-room', async (data) => {
    const { roomId } = data;
    if (roomId && socket.userId) {
      const success = await socketService.handleJoinRoom(socket, roomId);
      if (success) {
        // Get current room data with full member list
        const roomService = require('./services/roomService');
        const roomData = await roomService.getRoomById(roomId);
        
        socket.emit('joined-room', { 
          roomId, 
          success: true,
          roomData: roomData
        });
        
        // Emit to all users in room (including new user) with full user info
        const userInfo = {
          userId: socket.userId,
          userName: socket.userName,
          userEmail: socket.userEmail,
          userPicture: socket.userPicture,
          joinedAt: new Date().toISOString(),
          socketId: socket.id
        };
        
        socket.to(roomId).emit('user-joined-room', {
          type: 'user_joined',
          user: userInfo,
          roomId,
          currentMembers: roomData ? roomData.members : [],
          timestamp: new Date().toISOString()
        });
        
        // Auto request and send updated members list to all
        setTimeout(async () => {
          const updatedRoom = await roomService.getRoomById(roomId);
          socket.to(roomId).emit('room-members-updated', {
            type: 'members_updated',
            roomId,
            members: updatedRoom ? updatedRoom.members : [],
            totalMembers: updatedRoom ? updatedRoom.currentUsers : 0,
            timestamp: new Date().toISOString()
          });
          
          // Send to the new user as well
          socket.emit('room-members-updated', {
            type: 'members_updated',
            roomId,
            members: updatedRoom ? updatedRoom.members : [],
            totalMembers: updatedRoom ? updatedRoom.currentUsers : 0,
            timestamp: new Date().toISOString()
          });
        }, 500);
        
      } else {
        socket.emit('joined-room', { roomId, success: false, error: 'Failed to join room' });
      }
    }
  });

  socket.on('leave-room', async (data) => {
    const { roomId } = data;
    if (roomId && socket.userId) {
      const success = await socketService.handleLeaveRoom(socket, roomId);
      if (success) {
        socket.emit('left-room', { roomId, success: true });
        
        // Emit to remaining users with full user info
        socket.to(roomId).emit('user-left-room', {
          type: 'user_left',
          user: {
            userId: socket.userId,
            userName: socket.userName,
            userEmail: socket.userEmail,
            leftAt: new Date().toISOString()
          },
          roomId,
          timestamp: new Date().toISOString()
        });
        
        // Send updated members list after leave
        setTimeout(async () => {
          const roomService = require('./services/roomService');
          const updatedRoom = await roomService.getRoomById(roomId);
          socket.to(roomId).emit('room-members-updated', {
            type: 'members_updated',
            roomId,
            members: updatedRoom ? updatedRoom.members : [],
            totalMembers: updatedRoom ? updatedRoom.currentUsers : 0,
            timestamp: new Date().toISOString()
          });
        }, 500);
      }
    }
  });

  // Get current room members
  socket.on('get-room-members', async (data) => {
    const { roomId } = data;
    if (roomId && socket.userId) {
      try {
        const roomService = require('./services/roomService');
        const roomData = await roomService.getRoomById(roomId);
        
        socket.emit('room-members-list', {
          type: 'members_list',
          roomId,
          members: roomData ? roomData.members : [],
          totalMembers: roomData ? roomData.currentUsers : 0,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error getting room members:', error);
        socket.emit('room-members-error', {
          roomId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  });

  // Force refresh room data
  socket.on('refresh-room-data', async (data) => {
    const { roomId } = data;
    if (roomId && socket.userId) {
      try {
        const roomService = require('./services/roomService');
        const roomData = await roomService.getRoomById(roomId);
        
        socket.emit('room-data-refreshed', {
          type: 'room_data_refreshed',
          roomId,
          roomData: roomData,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error refreshing room data:', error);
        socket.emit('room-refresh-error', {
          roomId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  });

  socket.on('room-message', (data) => {
    const { roomId, message, messageType } = data;
    if (roomId && socket.userId) {
      socketService.broadcastToRoom(roomId, 'room-message', {
        userId: socket.userId,
        userName: socket.userName,
        userPicture: socket.userPicture,
        message,
        messageType: messageType || 'text',
        roomId,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('room-typing', (data) => {
    const { roomId, isTyping } = data;
    if (roomId && socket.userId) {
      socket.to(roomId).emit('room-typing', {
        userId: socket.userId,
        userName: socket.userName,
        roomId,
        isTyping,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Share-related socket events
  socket.on('share-room', (data) => {
    const { roomId, shareData } = data;
    if (roomId && socket.userId) {
      socket.to(roomId).emit('room-shared', {
        type: 'room_shared',
        roomId,
        shareData,
        sharedBy: {
          userId: socket.userId,
          userName: socket.userName
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('share-via-platform', (data) => {
    const { roomId, platform, shareToken } = data;
    if (roomId && socket.userId) {
      socket.to(roomId).emit('shared-via-platform', {
        type: 'shared_via_platform',
        roomId,
        platform,
        shareToken,
        sharedBy: {
          userId: socket.userId,
          userName: socket.userName
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('request-share-stats', (data) => {
    const { roomId } = data;
    if (roomId && socket.userId) {
      // This would typically fetch stats from database and emit back
      socket.emit('share-stats-update', {
        type: 'share_stats_update',
        roomId,
        timestamp: new Date().toISOString()
      });
    }
  });
});

server.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`🔌 Socket.IO server is ready`);
  console.log(`📚 API Endpoints:`);
  console.log(`   User Management:`);
  console.log(`     - POST /api/users/login`);
  console.log(`     - PUT  /api/users/:userId`);
  console.log(`     - POST /api/users/logout`);
  console.log(`     - GET  /api/users/:userId`);
  console.log(`     - GET  /api/users`);
     console.log(`   Room Management:`);
   console.log(`     - POST /api/rooms (create)`);
   console.log(`     - GET  /api/rooms/code/:roomCode`);
   console.log(`     - POST /api/rooms/join/:roomCode`);
   console.log(`     - GET  /api/rooms/user/:userId`);
   console.log(`   Share System:`);
   console.log(`     - POST /api/share/rooms/:roomId/links`);
   console.log(`     - GET  /api/share/links/:shareToken`);
   console.log(`     - POST /api/share/rooms/:roomId/invitations`);
   console.log(`     - GET  /api/share/rooms/:roomId/stats`);
  console.log(`🔥 Environment: ${process.env.NODE_ENV || 'development'}`)
});
