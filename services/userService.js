const { admin } = require('../config/firebase');
const { logError, logInfo } = require('../utils/helpers');

class UserService {
  constructor() {
    // Get Realtime Database reference
    this.db = admin.database();
    this.usersRef = this.db.ref('users');
    this.statsRef = this.db.ref('stats');
  }

  // Lấy tất cả users từ Realtime Database
  async getAllUsers() {
    try {
      const snapshot = await this.usersRef.once('value');
      const usersData = snapshot.val();
      
      if (!usersData) {
        return [];
      }
      
      // Convert object to array
      return Object.keys(usersData).map(uid => ({
        ...usersData[uid],
        uid
      }));
    } catch (error) {
      logError('UserService.getAllUsers', error);
      return [];
    }
  }

  // Tìm user theo UID
  async findUserByUid(uid) {
    try {
      const snapshot = await this.usersRef.child(uid).once('value');
      const userData = snapshot.val();
      
      if (!userData) {
        return null;
      }
      
      return { ...userData, uid };
    } catch (error) {
      logError('UserService.findUserByUid', error);
      return null;
    }
  }

  // Tìm user theo email
  async findUserByEmail(email) {
    try {
      const snapshot = await this.usersRef
        .orderByChild('email')
        .equalTo(email)
        .once('value');
      
      const usersData = snapshot.val();
      
      if (!usersData) {
        return null;
      }
      
      const uid = Object.keys(usersData)[0];
      return { ...usersData[uid], uid };
    } catch (error) {
      logError('UserService.findUserByEmail', error);
      return null;
    }
  }

  // Tạo hoặc cập nhật user
  async createOrUpdateUser(userData) {
    try {
      const userRef = this.usersRef.child(userData.uid);
      const existingUserSnapshot = await userRef.once('value');
      const existingUser = existingUserSnapshot.val();
      
      const now = new Date().toISOString();
      
      const userInfo = {
        email: userData.email,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
        emailVerified: userData.emailVerified,
        phoneNumber: userData.phoneNumber || null,
        provider: 'google',
        customClaims: userData.customClaims || {},
        profile: {
          firstName: this.extractFirstName(userData.displayName),
          lastName: this.extractLastName(userData.displayName),
          avatar: userData.photoURL,
          locale: userData.locale || 'vi',
          timezone: userData.timezone || 'Asia/Ho_Chi_Minh'
        },
        settings: {
          notifications: existingUser?.settings?.notifications ?? true,
          theme: existingUser?.settings?.theme ?? 'light',
          language: existingUser?.settings?.language ?? 'vi'
        },
        metadata: {
          createdAt: existingUser?.metadata?.createdAt || now,
          updatedAt: now,
          lastLoginAt: now,
          loginCount: (existingUser?.metadata?.loginCount || 0) + 1,
          isActive: true,
          isOnline: true
        }
      };

      // Lưu user data vào Realtime Database
      await userRef.set(userInfo);
      
      // Cập nhật thống kê
      await this.updateUserStats();
      
      if (existingUser) {
        logInfo('UserService', `Updated user: ${userData.email}`);
      } else {
        logInfo('UserService', `Created new user: ${userData.email}`);
      }

      return { ...userInfo, uid: userData.uid };
      
    } catch (error) {
      logError('UserService.createOrUpdateUser', error);
      return null;
    }
  }

  // Cập nhật thông tin user
  async updateUser(uid, updateData) {
    try {
      const userRef = this.usersRef.child(uid);
      const snapshot = await userRef.once('value');
      
      if (!snapshot.exists()) {
        return null;
      }

      // Prepare update data với timestamp
      const updates = {
        ...updateData,
        'metadata/updatedAt': new Date().toISOString()
      };

      // Flatten nested objects for Firebase update
      const flattenedUpdates = this.flattenObject(updates);
      
      await userRef.update(flattenedUpdates);
      
      // Get updated user data
      const updatedSnapshot = await userRef.once('value');
      const updatedUser = updatedSnapshot.val();
      
      logInfo('UserService', `Updated user data: ${uid}`);
      return { ...updatedUser, uid };
      
    } catch (error) {
      logError('UserService.updateUser', error);
      return null;
    }
  }

  // Cập nhật trạng thái online
  async updateOnlineStatus(uid, isOnline) {
    try {
      const updates = {
        'metadata/isOnline': isOnline,
        'metadata/lastSeenAt': new Date().toISOString()
      };
      
      await this.usersRef.child(uid).update(updates);
      
      // Cập nhật thống kê
      await this.updateUserStats();
      
      return true;
    } catch (error) {
      logError('UserService.updateOnlineStatus', error);
      return false;
    }
  }

  // Lấy danh sách users với pagination và filters
  async getUsersWithPagination(page = 1, limit = 10, filters = {}) {
    try {
      const users = await this.getAllUsers();
      let filteredUsers = users;

      // Apply filters
      if (filters.isActive !== undefined) {
        filteredUsers = filteredUsers.filter(user => user.metadata?.isActive === filters.isActive);
      }
      if (filters.isOnline !== undefined) {
        filteredUsers = filteredUsers.filter(user => user.metadata?.isOnline === filters.isOnline);
      }
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredUsers = filteredUsers.filter(user => 
          user.displayName?.toLowerCase().includes(searchTerm) ||
          user.email?.toLowerCase().includes(searchTerm)
        );
      }

      // Sort by last login (newest first)
      filteredUsers.sort((a, b) => {
        const dateA = new Date(a.metadata?.lastLoginAt || 0);
        const dateB = new Date(b.metadata?.lastLoginAt || 0);
        return dateB - dateA;
      });

      // Pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

      return {
        users: paginatedUsers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(filteredUsers.length / limit),
          totalUsers: filteredUsers.length,
          hasNextPage: endIndex < filteredUsers.length,
          hasPrevPage: page > 1
        }
      };
      
    } catch (error) {
      logError('UserService.getUsersWithPagination', error);
      return { users: [], pagination: {} };
    }
  }

  // Xóa user (soft delete)
  async deleteUser(uid) {
    try {
      const updates = {
        'metadata/isActive': false,
        'metadata/deletedAt': new Date().toISOString(),
        'metadata/isOnline': false
      };
      
      await this.usersRef.child(uid).update(updates);
      
      // Cập nhật thống kê
      await this.updateUserStats();
      
      logInfo('UserService', `Soft deleted user: ${uid}`);
      return true;
    } catch (error) {
      logError('UserService.deleteUser', error);
      return false;
    }
  }

  // Thống kê users
  async getUserStats() {
    try {
      const users = await this.getAllUsers();
      const totalUsers = users.length;
      const activeUsers = users.filter(user => user.metadata?.isActive !== false).length;
      const onlineUsers = users.filter(user => user.metadata?.isOnline === true).length;
      const todayLogins = users.filter(user => {
        const lastLogin = new Date(user.metadata?.lastLoginAt);
        const today = new Date();
        return lastLogin.toDateString() === today.toDateString();
      }).length;

      const stats = {
        totalUsers,
        activeUsers,
        onlineUsers,
        todayLogins,
        inactiveUsers: totalUsers - activeUsers,
        lastUpdated: new Date().toISOString()
      };

      // Lưu stats vào database
      await this.statsRef.child('users').set(stats);
      
      return stats;
    } catch (error) {
      logError('UserService.getUserStats', error);
      return {};
    }
  }

  // Cập nhật thống kê (gọi sau mỗi lần thay đổi user data)
  async updateUserStats() {
    try {
      await this.getUserStats();
    } catch (error) {
      logError('UserService.updateUserStats', error);
    }
  }

  // Listen realtime changes cho user specific
  listenToUser(uid, callback) {
    const userRef = this.usersRef.child(uid);
    userRef.on('value', (snapshot) => {
      const userData = snapshot.val();
      callback(userData ? { ...userData, uid } : null);
    });
    
    return () => userRef.off('value');
  }

  // Listen realtime changes cho tất cả users (admin only)
  listenToAllUsers(callback) {
    this.usersRef.on('value', (snapshot) => {
      const usersData = snapshot.val();
      const users = usersData ? Object.keys(usersData).map(uid => ({
        ...usersData[uid],
        uid
      })) : [];
      callback(users);
    });
    
    return () => this.usersRef.off('value');
  }

  // Listen realtime stats
  listenToStats(callback) {
    this.statsRef.child('users').on('value', (snapshot) => {
      const stats = snapshot.val();
      callback(stats || {});
    });
    
    return () => this.statsRef.child('users').off('value');
  }

  // Utility functions
  extractFirstName(displayName) {
    if (!displayName) return '';
    return displayName.split(' ')[0];
  }

  extractLastName(displayName) {
    if (!displayName) return '';
    const parts = displayName.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }

  // Flatten nested object for Firebase update
  flattenObject(obj, prefix = '') {
    const flattened = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}/${key}` : key;
        
        if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          Object.assign(flattened, this.flattenObject(obj[key], newKey));
        } else {
          flattened[newKey] = obj[key];
        }
      }
    }
    
    return flattened;
  }

  // Setup user presence (online/offline detection)
  async setupUserPresence(uid) {
    try {
      const userStatusDatabaseRef = this.db.ref(`/users/${uid}/metadata/isOnline`);
      const userStatusFirestoreRef = this.db.ref(`/users/${uid}/metadata/lastSeenAt`);
      
      // Set up presence system
      const isOfflineForDatabase = {
        isOnline: false,
        lastSeenAt: admin.database.ServerValue.TIMESTAMP
      };

      const isOnlineForDatabase = {
        isOnline: true,
        lastSeenAt: admin.database.ServerValue.TIMESTAMP
      };

      this.db.ref('.info/connected').on('value', (snapshot) => {
        if (snapshot.val() === false) {
          return;
        }

        userStatusDatabaseRef.onDisconnect().update(isOfflineForDatabase).then(() => {
          userStatusDatabaseRef.update(isOnlineForDatabase);
        });
      });
      
    } catch (error) {
      logError('UserService.setupUserPresence', error);
    }
  }
}

module.exports = new UserService(); 