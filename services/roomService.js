const { admin } = require('../config/firebase');
const crypto = require('crypto');

// Get reference to Realtime Database
const db = admin.database();
const roomsRef = db.ref('rooms');
const roomMembersRef = db.ref('roomMembers');

class RoomService {
  constructor() {
    this.activeRooms = new Map(); // Track active rooms in memory
  }

  // Generate unique room code (6 characters)
  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Generate room ID
  generateRoomId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Create new room
  async createRoom(roomData, creatorUser) {
    try {
      const roomId = this.generateRoomId();
      let roomCode = this.generateRoomCode();
      
      // Ensure room code is unique
      let codeExists = true;
      let attempts = 0;
      while (codeExists && attempts < 10) {
        const snapshot = await roomsRef.orderByChild('roomCode').equalTo(roomCode).once('value');
        if (!snapshot.exists()) {
          codeExists = false;
        } else {
          roomCode = this.generateRoomCode();
          attempts++;
        }
      }

      if (attempts >= 10) {
        throw new Error('Unable to generate unique room code');
      }

      // Create room object
      const room = {
        roomId,
        roomCode,
        roomName: roomData.roomName || `Room ${roomCode}`,
        roomLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/room/${roomCode}`,
        description: roomData.description || '',
        createdBy: creatorUser.id,
        creatorName: creatorUser.name,
        creatorEmail: creatorUser.email,
        createdAt: new Date().toISOString(),
        maxUsers: roomData.maxUsers || 10,
        currentUsers: 1,
        isActive: true,
        isPrivate: roomData.isPrivate || false,
        password: roomData.password || null,
        updatedAt: new Date().toISOString()
      };

      // Save room to Firebase
      await roomsRef.child(roomId).set(room);

      // Add creator as first member
      await roomMembersRef.child(roomId).child(creatorUser.id).set({
        userId: creatorUser.id,
        userName: creatorUser.name,
        userEmail: creatorUser.email,
        userPicture: creatorUser.picture || null,
        role: 'creator',
        joinedAt: new Date().toISOString(),
        isActive: true
      });

      // Track in memory
      this.activeRooms.set(roomId, {
        ...room,
        members: new Set([creatorUser.id])
      });

      console.log(`🏠 Room created: ${roomCode} by ${creatorUser.name}`);
      return room;

    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  }

  // Get room by code
  async getRoomByCode(roomCode) {
    try {
      const snapshot = await roomsRef.orderByChild('roomCode').equalTo(roomCode).once('value');
      const rooms = snapshot.val();
      
      if (!rooms) {
        return null;
      }

      const roomId = Object.keys(rooms)[0];
      const room = rooms[roomId];

      // Get room members
      const membersSnapshot = await roomMembersRef.child(roomId).once('value');
      const members = membersSnapshot.val() || {};

      return {
        ...room,
        members: Object.values(members)
      };
    } catch (error) {
      console.error('Error getting room by code:', error);
      throw error;
    }
  }

  // Get room by ID
  async getRoomById(roomId) {
    try {
      const snapshot = await roomsRef.child(roomId).once('value');
      const room = snapshot.val();

      if (!room) {
        return null;
      }

      // Get room members
      const membersSnapshot = await roomMembersRef.child(roomId).once('value');
      const members = membersSnapshot.val() || {};

      return {
        ...room,
        members: Object.values(members)
      };
    } catch (error) {
      console.error('Error getting room by ID:', error);
      throw error;
    }
  }

  // Join room
  async joinRoom(roomCode, user, password = null) {
    try {
      const room = await this.getRoomByCode(roomCode);
      
      if (!room) {
        throw new Error('Room not found');
      }

      if (!room.isActive) {
        throw new Error('Room is not active');
      }

      if (room.isPrivate && room.password !== password) {
        throw new Error('Incorrect room password');
      }

      if (room.currentUsers >= room.maxUsers) {
        throw new Error('Room is full');
      }

      // Check if user is already in room
      const existingMember = room.members.find(member => member.userId === user.id);
      if (existingMember) {
        // Update existing member status
        await roomMembersRef.child(room.roomId).child(user.id).update({
          isActive: true,
          lastJoinedAt: new Date().toISOString()
        });
      } else {
        // Add new member
        await roomMembersRef.child(room.roomId).child(user.id).set({
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userPicture: user.picture || null,
          role: 'member',
          joinedAt: new Date().toISOString(),
          isActive: true
        });

        // Update room member count
        await roomsRef.child(room.roomId).update({
          currentUsers: room.currentUsers + 1,
          updatedAt: new Date().toISOString()
        });
      }

      // Update memory cache
      if (this.activeRooms.has(room.roomId)) {
        this.activeRooms.get(room.roomId).members.add(user.id);
      }

      console.log(`👤 User ${user.name} joined room ${roomCode}`);
      return await this.getRoomById(room.roomId);

    } catch (error) {
      console.error('Error joining room:', error);
      throw error;
    }
  }

  // Leave room
  async leaveRoom(roomId, userId) {
    try {
      const room = await this.getRoomById(roomId);
      
      if (!room) {
        throw new Error('Room not found');
      }

      // Update member status
      await roomMembersRef.child(roomId).child(userId).update({
        isActive: false,
        leftAt: new Date().toISOString()
      });

      // Update room member count
      const activeMembers = room.members.filter(member => member.isActive && member.userId !== userId);
      await roomsRef.child(roomId).update({
        currentUsers: activeMembers.length,
        updatedAt: new Date().toISOString()
      });

      // Update memory cache
      if (this.activeRooms.has(roomId)) {
        this.activeRooms.get(roomId).members.delete(userId);
      }

      // If creator leaves, transfer ownership or close room
      if (room.createdBy === userId && activeMembers.length > 0) {
        const newCreator = activeMembers[0];
        await roomsRef.child(roomId).update({
          createdBy: newCreator.userId,
          creatorName: newCreator.userName,
          updatedAt: new Date().toISOString()
        });

        await roomMembersRef.child(roomId).child(newCreator.userId).update({
          role: 'creator'
        });
      } else if (activeMembers.length === 0) {
        // Close room if empty
        await this.closeRoom(roomId);
      }

      console.log(`👤 User left room ${roomId}`);
      return true;

    } catch (error) {
      console.error('Error leaving room:', error);
      throw error;
    }
  }

  // Close room
  async closeRoom(roomId) {
    try {
      await roomsRef.child(roomId).update({
        isActive: false,
        closedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Remove from memory cache
      this.activeRooms.delete(roomId);

      console.log(`🏠 Room closed: ${roomId}`);
      return true;
    } catch (error) {
      console.error('Error closing room:', error);
      throw error;
    }
  }

  // Get user's rooms
  async getUserRooms(userId) {
    try {
      const snapshot = await roomMembersRef.orderByChild('userId').equalTo(userId).once('value');
      const userMemberships = snapshot.val() || {};

      const roomIds = Object.keys(userMemberships);
      const rooms = [];

      for (const roomId of roomIds) {
        const room = await this.getRoomById(roomId);
        if (room && room.isActive) {
          rooms.push(room);
        }
      }

      return rooms;
    } catch (error) {
      console.error('Error getting user rooms:', error);
      throw error;
    }
  }

  // Get all active rooms (for admin)
  async getAllActiveRooms() {
    try {
      const snapshot = await roomsRef.orderByChild('isActive').equalTo(true).once('value');
      const rooms = snapshot.val() || {};

      const roomList = [];
      for (const roomId of Object.keys(rooms)) {
        const room = await this.getRoomById(roomId);
        if (room) {
          roomList.push(room);
        }
      }

      return roomList;
    } catch (error) {
      console.error('Error getting all active rooms:', error);
      throw error;
    }
  }

  // Update room settings
  async updateRoom(roomId, updateData, userId) {
    try {
      const room = await this.getRoomById(roomId);
      
      if (!room) {
        throw new Error('Room not found');
      }

      if (room.createdBy !== userId) {
        throw new Error('Only room creator can update room settings');
      }

      const allowedUpdates = ['roomName', 'description', 'maxUsers', 'isPrivate', 'password'];
      const updates = {};
      
      for (const key of allowedUpdates) {
        if (updateData[key] !== undefined) {
          updates[key] = updateData[key];
        }
      }

      updates.updatedAt = new Date().toISOString();

      await roomsRef.child(roomId).update(updates);

      console.log(`🏠 Room updated: ${roomId}`);
      return await this.getRoomById(roomId);

    } catch (error) {
      console.error('Error updating room:', error);
      throw error;
    }
  }
}

// Create singleton instance
const roomService = new RoomService();

module.exports = roomService; 