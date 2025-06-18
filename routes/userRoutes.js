const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// POST /api/users/login - Handle user login
router.post('/login', userController.handleUserLogin);

// PUT /api/users/:userId - Update user information
router.put('/:userId', userController.updateUser);

// POST /api/users/logout - Handle user logout
router.post('/logout', userController.handleUserLogout);

// GET /api/users/:userId - Get user information (optional)
router.get('/:userId', userController.getUser);

// GET /api/users - Get all users (optional)
router.get('/', userController.getAllUsers);

// GET /api/users/online - Get currently online users
router.get('/online', userController.getOnlineUsers);

// POST /api/users/activity/:userId - Update user activity
router.post('/activity/:userId', userController.updateUserActivity);

module.exports = router; 