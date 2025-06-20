const roomService = require('./roomService');
const socketService = require('./socketService');

class RoomSyncService {
  constructor() {
    this.roomUserSyncQueue = new Map(); // Track pending sync operations
  }

  // Ensure user is properly synced in room (both API and Socket)
  async ensureUserInRoom(roomId, userId, userInfo) {
    try {
      // Add to sync queue to prevent duplicate operations
      const syncKey = `${roomId}-${userId}`;
      if (this.roomUserSyncQueue.has(syncKey)) {
        console.log(`Sync already in progress for ${syncKey}`);
        return;
      }
      
      this.roomUserSyncQueue.set(syncKey, true);

      // Check if user is in room database
      const room = await roomService.getRoomById(roomId);
      if (!room) {
        console.error(`Room ${roomId} not found for sync`);
        this.roomUserSyncQueue.delete(syncKey);
        return;
      }

      const isUserInRoom = room.members && room.members.some(member => 
        member.userId === userId && member.isActive
      );

      // Emit comprehensive sync event to all room members
      if (global.io) {
        // Force sync event with complete room state
        global.io.to(roomId).emit('room-sync-update', {
          type: 'room_sync',
          roomId,
          roomData: room,
          members: room.members || [],
          totalMembers: room.currentUsers || 0,
          syncedUser: {
            userId,
            userName: userInfo.name,
            userEmail: userInfo.email,
            userPicture: userInfo.picture,
            isInRoom: isUserInRoom,
            syncedAt: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        });

        console.log(`🔄 Room sync emitted for room ${roomId}, user ${userId}`);
      }

      // Remove from sync queue after processing
      setTimeout(() => {
        this.roomUserSyncQueue.delete(syncKey);
      }, 2000);

    } catch (error) {
      console.error('Error in room sync:', error);
      this.roomUserSyncQueue.delete(`${roomId}-${userId}`);
    }
  }

  // Force refresh all members in room
  async forceRoomRefresh(roomId) {
    try {
      const room = await roomService.getRoomById(roomId);
      if (!room) {
        console.error(`Room ${roomId} not found for refresh`);
        return;
      }

      if (global.io) {
        // Send force refresh to all room members
        global.io.to(roomId).emit('room-force-refresh', {
          type: 'force_refresh',
          roomId,
          roomData: room,
          members: room.members || [],
          totalMembers: room.currentUsers || 0,
          refreshedAt: new Date().toISOString()
        });

        console.log(`🔄 Force refresh emitted for room ${roomId}`);
      }

    } catch (error) {
      console.error('Error in force room refresh:', error);
    }
  }

  // Handle user presence sync (when user connects/disconnects)
  async syncUserPresence(userId, isOnline) {
    try {
      // Get all rooms where user is a member
      const userRooms = await roomService.getUserRooms(userId);
      
      for (const room of userRooms) {
        if (global.io) {
          global.io.to(room.roomId).emit('user-presence-change', {
            type: 'presence_change',
            userId,
            isOnline,
            roomId: room.roomId,
            timestamp: new Date().toISOString()
          });
        }
      }

      console.log(`👤 Presence sync: User ${userId} is ${isOnline ? 'online' : 'offline'} in ${userRooms.length} rooms`);

    } catch (error) {
      console.error('Error syncing user presence:', error);
    }
  }

  // Periodic room consistency check
  async performRoomConsistencyCheck(roomId) {
    try {
      const room = await roomService.getRoomById(roomId);
      if (!room) return;

      // Get Socket.IO room info
      const socketRoomInfo = socketService.getRoomMembersCount(roomId);
      const dbMemberCount = room.members ? room.members.filter(m => m.isActive).length : 0;

      // If counts don't match, force sync
      if (socketRoomInfo !== dbMemberCount) {
        console.log(`🔧 Consistency mismatch in room ${roomId}: Socket(${socketRoomInfo}) vs DB(${dbMemberCount})`);
        await this.forceRoomRefresh(roomId);
      }

    } catch (error) {
      console.error('Error in consistency check:', error);
    }
  }

  // Auto-sync when user joins via API but not via Socket
  async autoSyncApiJoin(roomId, userId, userInfo) {
    setTimeout(async () => {
      await this.ensureUserInRoom(roomId, userId, userInfo);
    }, 1000);

    // Follow up sync after 3 seconds
    setTimeout(async () => {
      await this.forceRoomRefresh(roomId);
    }, 3000);
  }

  // Batch sync for multiple users joining simultaneously
  async batchSyncUsers(roomId, users) {
    try {
      const room = await roomService.getRoomById(roomId);
      if (!room) return;

      if (global.io) {
        global.io.to(roomId).emit('room-batch-sync', {
          type: 'batch_sync',
          roomId,
          roomData: room,
          members: room.members || [],
          totalMembers: room.currentUsers || 0,
          syncedUsers: users,
          timestamp: new Date().toISOString()
        });

        console.log(`🔄 Batch sync emitted for room ${roomId} with ${users.length} users`);
      }

    } catch (error) {
      console.error('Error in batch sync:', error);
    }
  }

  // Cleanup disconnected users from rooms
  async cleanupDisconnectedUsers() {
    try {
      // This would run periodically to clean up stale connections
      const activeRooms = await roomService.getAllActiveRooms();
      
      for (const room of activeRooms) {
        // Check each member's socket connection status
        const activeMembers = [];
        
        for (const member of room.members || []) {
          // You could check if user's socket is still connected
          // For now, we'll trust the isActive flag
          if (member.isActive) {
            activeMembers.push(member);
          }
        }

        // If member count changed, emit update
        if (activeMembers.length !== (room.members || []).length) {
          if (global.io) {
            global.io.to(room.roomId).emit('room-cleanup-update', {
              type: 'cleanup_update',
              roomId: room.roomId,
              members: activeMembers,
              totalMembers: activeMembers.length,
              cleanedAt: new Date().toISOString()
            });
          }
        }
      }

    } catch (error) {
      console.error('Error in cleanup disconnected users:', error);
    }
  }
}

// Create singleton instance
const roomSyncService = new RoomSyncService();

module.exports = roomSyncService; 