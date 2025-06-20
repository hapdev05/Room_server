const express = require('express');
const router = express.Router();
const shareController = require('../controllers/shareController');

// Share Link Management
// POST /api/share/rooms/:roomId/links - Generate share link for room
router.post('/rooms/:roomId/links', shareController.generateShareLink);

// GET /api/share/links/:shareToken - Get share link details
router.get('/links/:shareToken', shareController.getShareLink);

// POST /api/share/links/:shareToken/use - Use share link (track click)
router.post('/links/:shareToken/use', shareController.useShareLink);

// POST /api/share/links/:shareToken/join - Track successful join via share link
router.post('/links/:shareToken/join', shareController.trackShareJoin);

// DELETE /api/share/links/:shareToken - Deactivate share link
router.delete('/links/:shareToken', shareController.deactivateShareLink);

// GET /api/share/links/:shareToken/social/:platform? - Get social sharing data
router.get('/links/:shareToken/social', shareController.getSocialShareData);

// Personal Invitations
// POST /api/share/rooms/:roomId/invitations - Create personal invitation
router.post('/rooms/:roomId/invitations', shareController.createInvitation);

// GET /api/share/invitations/:inviteToken - Get invitation details
router.get('/invitations/:inviteToken', shareController.getInvitation);

// PUT /api/share/invitations/:inviteToken/respond - Respond to invitation
router.put('/invitations/:inviteToken/respond', shareController.respondToInvitation);

// Statistics and Management
// GET /api/share/rooms/:roomId/stats - Get room share statistics
router.get('/rooms/:roomId/stats', shareController.getRoomShareStats);

// DELETE /api/share/rooms/:roomId/links/all - Deactivate all share links for room
router.delete('/rooms/:roomId/links/all', shareController.deactivateAllShareLinks);

// User Management
// GET /api/share/users/:userId/links - Get user's share links
router.get('/users/:userId/links', shareController.getUserShareLinks);

// GET /api/share/users/:userEmail/invitations - Get user's received invitations
router.get('/users/:userEmail/invitations', shareController.getUserInvitations);

module.exports = router; 