const roomService = require('../services/roomService');

const roomController = {
  // Create new room
  createRoom: async (req, res) => {
    try {
      const { roomName, description, maxUsers, isPrivate, password } = req.body;
      const { user } = req.body; // User info should be provided

      // Validate required fields
      if (!user || !user.id || !user.name || !user.email) {
        return res.status(400).json({
          success: false,
          message: 'User information is required (id, name, email)'
        });
      }

      // Validate room data
      if (maxUsers && (maxUsers < 2 || maxUsers > 50)) {
        return res.status(400).json({
          success: false,
          message: 'Max users must be between 2 and 50'
        });
      }

      if (isPrivate && !password) {
        return res.status(400).json({
          success: false,
          message: 'Password is required for private rooms'
        });
      }

      const roomData = {
        roomName,
        description,
        maxUsers: maxUsers || 10,
        isPrivate: isPrivate || false,
        password: isPrivate ? password : null
      };

      const room = await roomService.createRoom(roomData, user);

      // Emit socket event for real-time room creation
      if (global.io) {
        global.io.emit('room-created', {
          type: 'room_created',
          room,
          creator: user,
          timestamp: new Date().toISOString()
        });
      }

      res.status(201).json({
        success: true,
        message: 'Room created successfully',
        data: room
      });

    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create room',
        error: error.message
      });
    }
  },

  // Get room by code
  getRoomByCode: async (req, res) => {
    try {
      const { roomCode } = req.params;

      if (!roomCode) {
        return res.status(400).json({
          success: false,
          message: 'Room code is required'
        });
      }

      const room = await roomService.getRoomByCode(roomCode.toUpperCase());

      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Room found',
        data: room
      });

    } catch (error) {
      console.error('Error getting room by code:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get room',
        error: error.message
      });
    }
  },

  // Get room by ID
  getRoomById: async (req, res) => {
    try {
      const { roomId } = req.params;

      if (!roomId) {
        return res.status(400).json({
          success: false,
          message: 'Room ID is required'
        });
      }

      const room = await roomService.getRoomById(roomId);

      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Room found',
        data: room
      });

    } catch (error) {
      console.error('Error getting room by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get room',
        error: error.message
      });
    }
  },

  // Join room
  joinRoom: async (req, res) => {
    try {
      const { roomCode } = req.params;
      const { user, password, shareToken } = req.body;

      // Validate required fields
      if (!roomCode) {
        return res.status(400).json({
          success: false,
          message: 'Room code is required'
        });
      }

      if (!user || !user.id || !user.name || !user.email) {
        return res.status(400).json({
          success: false,
          message: 'User information is required (id, name, email)'
        });
      }

      const room = await roomService.joinRoom(roomCode.toUpperCase(), user, password);

      // Track share join if shareToken is provided
      if (shareToken) {
        try {
          const shareService = require('../services/shareService');
          await shareService.trackShareJoin(shareToken, user.id);
          console.log(`📊 Share join tracked: ${shareToken} by ${user.id}`);
        } catch (shareError) {
          console.error('Error tracking share join:', shareError);
          // Don't fail the join if share tracking fails
        }
      }

      // Auto-sync user in room to ensure real-time consistency
      const roomSyncService = require('../services/roomSyncService');
      await roomSyncService.autoSyncApiJoin(room.roomId, user.id, user);

      // Emit socket event for real-time room join
      if (global.io) {
        global.io.to(room.roomId).emit('user-joined-room', {
          type: 'user_joined',
          user: {
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            userPicture: user.picture,
            joinedAt: new Date().toISOString()
          },
          room,
          shareToken: shareToken || null,
          currentMembers: room.members || [],
          timestamp: new Date().toISOString()
        });

        // Send updated members list to all room members
        setTimeout(() => {
          global.io.to(room.roomId).emit('room-members-updated', {
            type: 'members_updated',
            roomId: room.roomId,
            members: room.members || [],
            totalMembers: room.currentUsers || 0,
            timestamp: new Date().toISOString()
          });
        }, 1000);
      }

      res.status(200).json({
        success: true,
        message: 'Successfully joined room',
        data: room
      });

    } catch (error) {
      console.error('Error joining room:', error);
      
      let statusCode = 500;
      if (error.message.includes('not found')) statusCode = 404;
      else if (error.message.includes('password') || error.message.includes('full')) statusCode = 400;
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  },

  // Leave room
  leaveRoom: async (req, res) => {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;

      if (!roomId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Room ID and User ID are required'
        });
      }

      const result = await roomService.leaveRoom(roomId, userId);

      // Get updated room data for socket emission
      const updatedRoom = await roomService.getRoomById(roomId);

      // Emit socket event for real-time room leave
      if (global.io) {
        global.io.to(roomId).emit('user-left-room', {
          type: 'user_left',
          user: {
            userId: userId,
            leftAt: new Date().toISOString()
          },
          roomId,
          timestamp: new Date().toISOString()
        });

        // Send updated members list to remaining room members
        setTimeout(() => {
          global.io.to(roomId).emit('room-members-updated', {
            type: 'members_updated',
            roomId: roomId,
            members: updatedRoom ? updatedRoom.members || [] : [],
            totalMembers: updatedRoom ? updatedRoom.currentUsers || 0 : 0,
            timestamp: new Date().toISOString()
          });
        }, 1000);
      }

      res.status(200).json({
        success: true,
        message: 'Successfully left room',
        data: { result }
      });

    } catch (error) {
      console.error('Error leaving room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to leave room',
        error: error.message
      });
    }
  },

  // Get user's rooms
  getUserRooms: async (req, res) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      const rooms = await roomService.getUserRooms(userId);

      res.status(200).json({
        success: true,
        message: 'User rooms retrieved successfully',
        data: {
          rooms,
          count: rooms.length
        }
      });

    } catch (error) {
      console.error('Error getting user rooms:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user rooms',
        error: error.message
      });
    }
  },

  // Get all active rooms (admin)
  getAllActiveRooms: async (req, res) => {
    try {
      const rooms = await roomService.getAllActiveRooms();

      res.status(200).json({
        success: true,
        message: 'Active rooms retrieved successfully',
        data: {
          rooms,
          count: rooms.length
        }
      });

    } catch (error) {
      console.error('Error getting all active rooms:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get active rooms',
        error: error.message
      });
    }
  },

  // Update room settings
  updateRoom: async (req, res) => {
    try {
      const { roomId } = req.params;
      const { userId, ...updateData } = req.body;

      if (!roomId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Room ID and User ID are required'
        });
      }

      const room = await roomService.updateRoom(roomId, updateData, userId);

      // Emit socket event for real-time room update
      if (global.io) {
        global.io.to(roomId).emit('room-updated', {
          type: 'room_updated',
          room,
          updatedBy: userId,
          changes: updateData,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({
        success: true,
        message: 'Room updated successfully',
        data: room
      });

    } catch (error) {
      console.error('Error updating room:', error);
      
      let statusCode = 500;
      if (error.message.includes('not found')) statusCode = 404;
      else if (error.message.includes('Only room creator')) statusCode = 403;
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  },

  // Close room
  closeRoom: async (req, res) => {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;

      if (!roomId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Room ID and User ID are required'
        });
      }

      // Check if user is room creator
      const room = await roomService.getRoomById(roomId);
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }

      if (room.createdBy !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Only room creator can close the room'
        });
      }

      const result = await roomService.closeRoom(roomId);

      // Emit socket event for real-time room closure
      if (global.io) {
        global.io.to(roomId).emit('room-closed', {
          type: 'room_closed',
          roomId,
          closedBy: userId,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({
        success: true,
        message: 'Room closed successfully',
        data: { result }
      });

    } catch (error) {
      console.error('Error closing room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to close room',
        error: error.message
      });
    }
  }
};

module.exports = roomController; 