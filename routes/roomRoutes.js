const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');

// POST /api/rooms - Create new room
router.post('/', roomController.createRoom);

// GET /api/rooms - Get all active rooms (admin/public list)
router.get('/', roomController.getAllActiveRooms);

// GET /api/rooms/code/:roomCode - Get room by code
router.get('/code/:roomCode', roomController.getRoomByCode);

// GET /api/rooms/:roomId - Get room by ID
router.get('/:roomId', roomController.getRoomById);

// POST /api/rooms/join/:roomCode - Join room by code
router.post('/join/:roomCode', roomController.joinRoom);

// POST /api/rooms/:roomId/leave - Leave room
router.post('/:roomId/leave', roomController.leaveRoom);

// PUT /api/rooms/:roomId - Update room settings
router.put('/:roomId', roomController.updateRoom);

// DELETE /api/rooms/:roomId - Close/delete room
router.delete('/:roomId', roomController.closeRoom);

// GET /api/rooms/user/:userId - Get user's rooms
router.get('/user/:userId', roomController.getUserRooms);

module.exports = router; 