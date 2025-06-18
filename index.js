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
    features: ['REST API', 'Socket.IO Realtime', 'Firebase Integration'],
    endpoints: {
      health: '/health',
      users: '/api/users',
      socketTest: '/socket-test.html'
    },
    socketEvents: [
      'user-join', 'user-update', 'user-activity', 
      'typing-start', 'typing-stop', 'get-online-users',
      'send-notification'
    ]
  });
});

// API Routes
app.use('/api/users', userRoutes);

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
});

server.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`🔌 Socket.IO server is ready`);
  console.log(`📚 API Endpoints:`);
  console.log(`   - POST /api/users/login`);
  console.log(`   - PUT  /api/users/:userId`);
  console.log(`   - POST /api/users/logout`);
  console.log(`   - GET  /api/users/:userId`);
  console.log(`   - GET  /api/users`);
  console.log(`🔥 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Socket.IO URL: ${process.env.HTTPS_URL}`);
});
