const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  googleLogin,
  verifyToken: verifyTokenController,
  getCurrentUser,
  updateProfile,
  logout
} = require('../controllers/authController');

const {
  streamUserUpdates,
  setUserPresence,
  getOnlineUsersCount
} = require('../controllers/realtimeController');

// ===== AUTHENTICATION ROUTES =====
// Route đăng nhập bằng Google
router.post('/google-login', googleLogin);

// Route verify token
router.post('/verify-token', verifyTokenController);

// Route lấy thông tin user hiện tại (cần authentication)
router.get('/me', verifyToken, getCurrentUser);

// Route cập nhật profile user (cần authentication)
router.put('/profile', verifyToken, updateProfile);

// Route đăng xuất (cần authentication)
router.post('/logout', verifyToken, logout);

// ===== REALTIME ROUTES =====
// Route setup user presence
router.post('/presence', verifyToken, setUserPresence);

// ===== SERVER-SENT EVENTS ROUTES =====
// Route stream user updates (realtime)
router.get('/stream/user', verifyToken, streamUserUpdates);

// ===== TEST ROUTES =====
// Route test protected (cần authentication)
router.get('/protected', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Đây là route được bảo vệ',
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 