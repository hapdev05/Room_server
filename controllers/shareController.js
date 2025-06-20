const shareService = require('../services/shareService');

const shareController = {
  // Generate share link for room
  generateShareLink: async (req, res) => {
    try {
      const { roomId } = req.params;
      const {
        userId,
        expiryHours,
        maxUses,
        shareType,
        allowPreview,
        requireApproval,
        message,
        title,
        description
      } = req.body;

      if (!roomId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Room ID and User ID are required'
        });
      }

      const options = {
        expiryHours: expiryHours || 24,
        maxUses: maxUses || null,
        shareType: shareType || 'public',
        allowPreview: allowPreview !== false,
        requireApproval: requireApproval || false,
        message,
        title,
        description
      };

      const shareData = await shareService.generateShareLink(roomId, userId, options);

      // Emit socket event for real-time share link creation
      if (global.io) {
        global.io.to(roomId).emit('share-link-created', {
          type: 'share_link_created',
          shareData,
          createdBy: userId,
          timestamp: new Date().toISOString()
        });
      }

      res.status(201).json({
        success: true,
        message: 'Share link generated successfully',
        data: shareData
      });

    } catch (error) {
      console.error('Error generating share link:', error);
      
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

  // Get share link details
  getShareLink: async (req, res) => {
    try {
      const { shareToken } = req.params;

      if (!shareToken) {
        return res.status(400).json({
          success: false,
          message: 'Share token is required'
        });
      }

      const shareData = await shareService.getShareLink(shareToken);

      res.status(200).json({
        success: true,
        message: 'Share link retrieved successfully',
        data: shareData
      });

    } catch (error) {
      console.error('Error getting share link:', error);
      
      let statusCode = 500;
      if (error.message.includes('not found') || error.message.includes('expired') || error.message.includes('maximum uses')) {
        statusCode = 404;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  },

  // Use share link (when someone clicks to join)
  useShareLink: async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { userId } = req.body;

      if (!shareToken) {
        return res.status(400).json({
          success: false,
          message: 'Share token is required'
        });
      }

      const shareData = await shareService.useShareLink(shareToken, userId);

      res.status(200).json({
        success: true,
        message: 'Share link accessed successfully',
        data: shareData
      });

    } catch (error) {
      console.error('Error using share link:', error);
      
      let statusCode = 500;
      if (error.message.includes('not found') || error.message.includes('expired')) {
        statusCode = 404;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  },

  // Track successful join via share link
  trackShareJoin: async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { userId } = req.body;

      if (!shareToken || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Share token and User ID are required'
        });
      }

      await shareService.trackShareJoin(shareToken, userId);

      res.status(200).json({
        success: true,
        message: 'Share join tracked successfully'
      });

    } catch (error) {
      console.error('Error tracking share join:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to track share join',
        error: error.message
      });
    }
  },

  // Create personal invitation
  createInvitation: async (req, res) => {
    try {
      const { roomId } = req.params;
      const {
        fromUserId,
        toUserEmail,
        message,
        expiryHours,
        requireResponse,
        allowForward
      } = req.body;

      if (!roomId || !fromUserId || !toUserEmail) {
        return res.status(400).json({
          success: false,
          message: 'Room ID, sender user ID, and recipient email are required'
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(toUserEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      const options = {
        message,
        expiryHours: expiryHours || 72,
        requireResponse: requireResponse || false,
        allowForward: allowForward !== false
      };

      const invitation = await shareService.createInvitation(roomId, fromUserId, toUserEmail, options);

      // Emit socket event for real-time invitation
      if (global.io) {
        global.io.to(roomId).emit('invitation-sent', {
          type: 'invitation_sent',
          invitation,
          fromUserId,
          toUserEmail,
          timestamp: new Date().toISOString()
        });
      }

      res.status(201).json({
        success: true,
        message: 'Invitation created successfully',
        data: invitation
      });

    } catch (error) {
      console.error('Error creating invitation:', error);
      
      let statusCode = 500;
      if (error.message.includes('not found')) statusCode = 404;
      else if (error.message.includes('must be a room member')) statusCode = 403;
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  },

  // Get invitation details
  getInvitation: async (req, res) => {
    try {
      const { inviteToken } = req.params;

      if (!inviteToken) {
        return res.status(400).json({
          success: false,
          message: 'Invite token is required'
        });
      }

      const invitation = await shareService.getInvitation(inviteToken);

      res.status(200).json({
        success: true,
        message: 'Invitation retrieved successfully',
        data: invitation
      });

    } catch (error) {
      console.error('Error getting invitation:', error);
      
      let statusCode = 500;
      if (error.message.includes('not found') || error.message.includes('expired') || error.message.includes('Invitation is')) {
        statusCode = 404;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  },

  // Respond to invitation
  respondToInvitation: async (req, res) => {
    try {
      const { inviteToken } = req.params;
      const { response, userId } = req.body;

      if (!inviteToken || !response) {
        return res.status(400).json({
          success: false,
          message: 'Invite token and response are required'
        });
      }

      if (!['accepted', 'declined'].includes(response)) {
        return res.status(400).json({
          success: false,
          message: 'Response must be either "accepted" or "declined"'
        });
      }

      const invitation = await shareService.respondToInvitation(inviteToken, response, userId);

      // Emit socket event for real-time invitation response
      if (global.io) {
        global.io.to(invitation.roomId).emit('invitation-response', {
          type: 'invitation_response',
          invitation,
          response,
          respondedBy: userId,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({
        success: true,
        message: `Invitation ${response} successfully`,
        data: invitation
      });

    } catch (error) {
      console.error('Error responding to invitation:', error);
      
      let statusCode = 500;
      if (error.message.includes('not found') || error.message.includes('expired')) {
        statusCode = 404;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  },

  // Get room share statistics
  getRoomShareStats: async (req, res) => {
    try {
      const { roomId } = req.params;
      const { userId } = req.query;

      if (!roomId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Room ID and User ID are required'
        });
      }

      const stats = await shareService.getRoomShareStats(roomId, userId);

      res.status(200).json({
        success: true,
        message: 'Room share statistics retrieved successfully',
        data: stats
      });

    } catch (error) {
      console.error('Error getting room share stats:', error);
      
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

  // Deactivate share link
  deactivateShareLink: async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { userId } = req.body;

      if (!shareToken || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Share token and User ID are required'
        });
      }

      await shareService.deactivateShareLink(shareToken, userId);

      res.status(200).json({
        success: true,
        message: 'Share link deactivated successfully'
      });

    } catch (error) {
      console.error('Error deactivating share link:', error);
      
      let statusCode = 500;
      if (error.message.includes('not found')) statusCode = 404;
      else if (error.message.includes('Only creator')) statusCode = 403;
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  },

  // Get user's share links
  getUserShareLinks: async (req, res) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      const shareLinks = await shareService.getUserShareLinks(userId);

      res.status(200).json({
        success: true,
        message: 'User share links retrieved successfully',
        data: {
          shareLinks,
          count: shareLinks.length
        }
      });

    } catch (error) {
      console.error('Error getting user share links:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user share links',
        error: error.message
      });
    }
  },

  // Get user's invitations (received)
  getUserInvitations: async (req, res) => {
    try {
      const { userEmail } = req.params;

      if (!userEmail) {
        return res.status(400).json({
          success: false,
          message: 'User email is required'
        });
      }

      const invitations = await shareService.getUserInvitations(userEmail);

      res.status(200).json({
        success: true,
        message: 'User invitations retrieved successfully',
        data: {
          invitations,
          count: invitations.length,
          pending: invitations.filter(inv => inv.status === 'pending').length
        }
      });

    } catch (error) {
      console.error('Error getting user invitations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user invitations',
        error: error.message
      });
    }
  },

  // Generate social media sharing data
  getSocialShareData: async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { platform } = req.query;

      if (!shareToken) {
        return res.status(400).json({
          success: false,
          message: 'Share token is required'
        });
      }

      const shareData = await shareService.getShareLink(shareToken);
      const socialData = shareService.generateSocialShareData(shareData, platform);

      res.status(200).json({
        success: true,
        message: 'Social sharing data generated successfully',
        data: socialData
      });

    } catch (error) {
      console.error('Error generating social share data:', error);
      
      let statusCode = 500;
      if (error.message.includes('not found') || error.message.includes('expired')) {
        statusCode = 404;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }
  },

  // Bulk operations
  deactivateAllShareLinks: async (req, res) => {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;

      if (!roomId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Room ID and User ID are required'
        });
      }

      const stats = await shareService.getRoomShareStats(roomId, userId);
      const activeLinks = stats.shareLinks.filter(link => link.isActive);

      let deactivatedCount = 0;
      for (const link of activeLinks) {
        try {
          await shareService.deactivateShareLink(link.shareToken, userId);
          deactivatedCount++;
        } catch (error) {
          console.error(`Error deactivating link ${link.shareToken}:`, error);
        }
      }

      res.status(200).json({
        success: true,
        message: `${deactivatedCount} share links deactivated successfully`,
        data: {
          deactivatedCount,
          totalLinks: activeLinks.length
        }
      });

    } catch (error) {
      console.error('Error deactivating all share links:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to deactivate share links',
        error: error.message
      });
    }
  }
};

module.exports = shareController; 