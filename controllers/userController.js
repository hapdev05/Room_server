const { admin } = require('../config/firebase');

// Get reference to Realtime Database
const db = admin.database();
const usersRef = db.ref('users');

const userController = {
  // Handle user login - save/update user info in database
  handleUserLogin: async (req, res) => {
    try {
      const { id, email, name, picture, loginTime } = req.body;

      // Validate required fields
      if (!id || !email || !name) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: id, email, name'
        });
      }

      // Prepare user data
      const userData = {
        id,
        email,
        name,
        picture: picture || null,
        loginTime: loginTime || new Date().toISOString(),
        lastActive: new Date().toISOString(),
        isOnline: true,
        updatedAt: new Date().toISOString()
      };

      // Save user data to Firebase Realtime Database
      await usersRef.child(id).set(userData);

      // Emit socket event for real-time user login
      if (global.io) {
        global.io.emit('user-login-update', {
          type: 'user_login',
          user: userData,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`User logged in: ${email} at ${userData.loginTime}`);

      res.status(200).json({
        success: true,
        message: 'User login data saved successfully',
        data: userData
      });

    } catch (error) {
      console.error('Error handling user login:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to save user login data',
        error: error.message
      });
    }
  },

  // Update user information
  updateUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const updateData = req.body;

      // Validate userId
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      // Add timestamp to update data
      updateData.updatedAt = new Date().toISOString();
      updateData.lastActive = new Date().toISOString();

      // Update user data in Firebase Realtime Database
      await usersRef.child(userId).update(updateData);

      // Get updated user data
      const snapshot = await usersRef.child(userId).once('value');
      const updatedUser = snapshot.val();

      // Emit socket event for real-time user update
      if (global.io) {
        global.io.emit('user-data-update', {
          type: 'user_update',
          user: updatedUser,
          changes: updateData,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`User updated: ${userId}`);

      res.status(200).json({
        success: true,
        message: 'User data updated successfully',
        data: updatedUser
      });

    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user data',
        error: error.message
      });
    }
  },

  // Handle user logout
  handleUserLogout: async (req, res) => {
    try {
      const { id, logoutTime } = req.body;

      // Validate required fields
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      // Update user status in database
      const logoutData = {
        logoutTime: logoutTime || new Date().toISOString(),
        isOnline: false,
        lastActive: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await usersRef.child(id).update(logoutData);

      // Get updated user data for socket emission
      const snapshot = await usersRef.child(id).once('value');
      const userData = snapshot.val();

      // Emit socket event for real-time user logout
      if (global.io) {
        global.io.emit('user-logout-update', {
          type: 'user_logout',
          user: userData,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`User logged out: ${id} at ${logoutData.logoutTime}`);

      res.status(200).json({
        success: true,
        message: 'User logout data saved successfully',
        data: logoutData
      });

    } catch (error) {
      console.error('Error handling user logout:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to save user logout data',
        error: error.message
      });
    }
  },

  // Get user information
  getUser: async (req, res) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      const snapshot = await usersRef.child(userId).once('value');
      const userData = snapshot.val();

      if (!userData) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'User data retrieved successfully',
        data: userData
      });

    } catch (error) {
      console.error('Error getting user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user data',
        error: error.message
      });
    }
  },

  // Get all users (optional - for admin purposes)
  getAllUsers: async (req, res) => {
    try {
      const snapshot = await usersRef.once('value');
      const users = snapshot.val() || {};

      // Convert to array and add online status filter if needed
      const userArray = Object.values(users);
      const onlineUsers = userArray.filter(user => user.isOnline);

      res.status(200).json({
        success: true,
        message: 'Users data retrieved successfully',
        data: {
          totalUsers: userArray.length,
          onlineUsers: onlineUsers.length,
          users: userArray
        }
      });

    } catch (error) {
      console.error('Error getting all users:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get users data',
        error: error.message
      });
    }
  },

  // Get currently online users
  getOnlineUsers: async (req, res) => {
    try {
      const socketService = require('../services/socketService');
      const onlineUsers = socketService.getOnlineUsers();

      // Also get from Firebase for backup
      const onlineUsersRef = admin.database().ref('onlineUsers');
      const snapshot = await onlineUsersRef.once('value');
      const firebaseOnlineUsers = snapshot.val() || {};

      res.status(200).json({
        success: true,
        message: 'Online users retrieved successfully',
        data: {
          socketConnections: onlineUsers,
          firebaseOnlineUsers: Object.values(firebaseOnlineUsers),
          totalOnline: onlineUsers.count
        }
      });

    } catch (error) {
      console.error('Error getting online users:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get online users',
        error: error.message
      });
    }
  },

  // Update user activity
  updateUserActivity: async (req, res) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      // Update in Firebase
      await usersRef.child(userId).update({
        lastActive: new Date().toISOString()
      });

      // Update via socket service
      const socketService = require('../services/socketService');
      await socketService.updateUserActivity(userId);

      res.status(200).json({
        success: true,
        message: 'User activity updated successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error updating user activity:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user activity',
        error: error.message
      });
    }
  }
};

module.exports = userController; 