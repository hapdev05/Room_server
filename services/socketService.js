const { admin } = require('../config/firebase');

// Get reference to Realtime Database
const db = admin.database();
const usersRef = db.ref('users');
const onlineUsersRef = db.ref('onlineUsers');

class SocketService {
  constructor() {
    this.connectedUsers = new Map(); // Track connected users with socket info
    this.activeRooms = new Map(); // Track active rooms and their members
  }

  // Initialize socket service with io instance
  init(io) {
    this.io = io;
    console.log('🔌 Socket Service initialized');
  }

  // Handle user connection
  async handleUserConnection(socket, userData) {
    try {
      // Store user info in socket and our tracking map
      socket.userId = userData.id;
      socket.userEmail = userData.email;
      socket.userName = userData.name;
      socket.userPicture = userData.picture;

      // Add to connected users map
      this.connectedUsers.set(userData.id, {
        socketId: socket.id,
        ...userData,
        connectedAt: new Date().toISOString()
      });

      // Update user online status in Firebase
      await usersRef.child(userData.id).update({
        isOnline: true,
        lastActive: new Date().toISOString(),
        socketId: socket.id
      });

      // Add to online users list in Firebase
      await onlineUsersRef.child(userData.id).set({
        id: userData.id,
        name: userData.name,
        email: userData.email,
        picture: userData.picture,
        socketId: socket.id,
        connectedAt: new Date().toISOString()
      });

      // Join user to their personal room
      socket.join(userData.id);
      socket.join('online-users'); // Join general online users room

      // Broadcast user online status to all clients
      socket.broadcast.emit('user-status-change', {
        type: 'user_online',
        user: {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          picture: userData.picture
        },
        timestamp: new Date().toISOString()
      });

      // Send current online users to the new user
      const onlineUsers = Array.from(this.connectedUsers.values());
      socket.emit('online-users-list', {
        users: onlineUsers,
        count: onlineUsers.length
      });

      // Sync user presence in all rooms they're in
      const roomSyncService = require('./roomSyncService');
      await roomSyncService.syncUserPresence(userData.id, true);

      console.log(`👤 User connected: ${userData.name} (${userData.email}) - Socket: ${socket.id}`);
      
      return true;
    } catch (error) {
      console.error('Error handling user connection:', error);
      return false;
    }
  }

  // Handle user disconnection
  async handleUserDisconnection(socket) {
    try {
      if (socket.userId) {
        // Remove from connected users map
        this.connectedUsers.delete(socket.userId);

        // Update user offline status in Firebase
        await usersRef.child(socket.userId).update({
          isOnline: false,
          lastActive: new Date().toISOString(),
          disconnectedAt: new Date().toISOString()
        });

        // Remove from online users list in Firebase
        await onlineUsersRef.child(socket.userId).remove();

        // Broadcast user offline status
        socket.broadcast.emit('user-status-change', {
          type: 'user_offline',
          user: {
            id: socket.userId,
            name: socket.userName,
            email: socket.userEmail,
            picture: socket.userPicture
          },
          timestamp: new Date().toISOString()
        });

        // Sync user presence in all rooms they're in
        const roomSyncService = require('./roomSyncService');
        await roomSyncService.syncUserPresence(socket.userId, false);

        console.log(`👤 User disconnected: ${socket.userName} (${socket.userEmail})`);
      }
    } catch (error) {
      console.error('Error handling user disconnection:', error);
    }
  }

  // Broadcast message to all online users
  broadcastToAllUsers(event, data) {
    if (this.io) {
      this.io.to('online-users').emit(event, data);
    }
  }

  // Send message to specific user
  sendToUser(userId, event, data) {
    if (this.io) {
      this.io.to(userId).emit(event, data);
    }
  }

  // Get current online users
  getOnlineUsers() {
    return {
      users: Array.from(this.connectedUsers.values()),
      count: this.connectedUsers.size
    };
  }

  // Handle typing indicators
  handleTyping(socket, data, isTyping = true) {
    const event = isTyping ? 'user-typing' : 'user-stop-typing';
    socket.broadcast.emit(event, {
      userId: socket.userId,
      userName: socket.userName,
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  // Handle user activity update
  async updateUserActivity(userId) {
    try {
      await usersRef.child(userId).update({
        lastActive: new Date().toISOString()
      });

      // Update in our local map too
      if (this.connectedUsers.has(userId)) {
        const user = this.connectedUsers.get(userId);
        user.lastActive = new Date().toISOString();
        this.connectedUsers.set(userId, user);
      }
    } catch (error) {
      console.error('Error updating user activity:', error);
    }
  }

  // Send notification to all users
  sendNotificationToAll(notification) {
    this.broadcastToAllUsers('notification', {
      ...notification,
      timestamp: new Date().toISOString()
    });
  }

  // Send notification to specific user
  sendNotificationToUser(userId, notification) {
    this.sendToUser(userId, 'notification', {
      ...notification,
      timestamp: new Date().toISOString()
    });
  }

  // Handle user joining a room
  async handleJoinRoom(socket, roomId) {
    try {
      socket.join(roomId);
      console.log(`🏠 User ${socket.userName} joined room ${roomId}`);
      
      // Update room member count in memory
      if (this.activeRooms && this.activeRooms.has(roomId)) {
        this.activeRooms.get(roomId).members.add(socket.userId);
      }
      
      return true;
    } catch (error) {
      console.error('Error joining room:', error);
      return false;
    }
  }

  // Handle user leaving a room
  async handleLeaveRoom(socket, roomId) {
    try {
      socket.leave(roomId);
      console.log(`🏠 User ${socket.userName} left room ${roomId}`);
      
      // Update room member count in memory
      if (this.activeRooms && this.activeRooms.has(roomId)) {
        this.activeRooms.get(roomId).members.delete(socket.userId);
      }
      
      return true;
    } catch (error) {
      console.error('Error leaving room:', error);
      return false;
    }
  }

  // Broadcast message to room
  broadcastToRoom(roomId, event, data) {
    if (this.io) {
      this.io.to(roomId).emit(event, data);
    }
  }

  // Get room members count
  getRoomMembersCount(roomId) {
    try {
      // Try from our in-memory tracking first
      if (this.activeRooms && this.activeRooms.has(roomId)) {
        return this.activeRooms.get(roomId).members.size;
      }

      // Fallback to Socket.IO adapter
      if (this.io && this.io.sockets && this.io.sockets.adapter) {
        const roomSockets = this.io.sockets.adapter.rooms.get(roomId);
        return roomSockets ? roomSockets.size : 0;
      }

      return 0;
    } catch (error) {
      console.error('Error getting room members count:', error);
      return 0;
    }
  }

  // Initialize room in memory
  initializeRoom(roomData) {
    if (this.activeRooms) {
      this.activeRooms.set(roomData.roomId, {
        ...roomData,
        members: new Set()
      });
    }
  }

  // Remove room from memory
  removeRoom(roomId) {
    if (this.activeRooms) {
      this.activeRooms.delete(roomId);
    }
  }
}

// Create singleton instance
const socketService = new SocketService();

module.exports = socketService; 