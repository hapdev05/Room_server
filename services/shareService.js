const { admin } = require('../config/firebase');
const crypto = require('crypto');
const roomService = require('./roomService');

// Get reference to Realtime Database
const db = admin.database();
const shareLinksRef = db.ref('shareLinks');
const shareStatsRef = db.ref('shareStats');
const invitationsRef = db.ref('invitations');

class ShareService {
  constructor() {
    this.activeShares = new Map(); // Track active share links in memory
  }

  // Generate unique share token
  generateShareToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Generate shareable link for room
  async generateShareLink(roomId, creatorUserId, options = {}) {
    try {
      // Verify room exists and user has permission
      const room = await roomService.getRoomById(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      if (room.createdBy !== creatorUserId) {
        throw new Error('Only room creator can generate share links');
      }

      const shareToken = this.generateShareToken();
      const expiryHours = options.expiryHours || 24; // Default 24 hours
      const maxUses = options.maxUses || null; // Unlimited by default
      
      const shareData = {
        shareToken,
        roomId,
        roomCode: room.roomCode,
        roomName: room.roomName,
        createdBy: creatorUserId,
        creatorName: room.creatorName,
        shareType: options.shareType || 'public', // 'public', 'private', 'invite-only'
        maxUses: maxUses,
        currentUses: 0,
        expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        isActive: true,
        // Share settings
        allowPreview: options.allowPreview !== false, // Default true
        requireApproval: options.requireApproval || false,
        message: options.message || `Join ${room.roomName}!`,
        // Social sharing
        title: options.title || `Join ${room.roomName}`,
        description: options.description || room.description || `You're invited to join ${room.roomName}`,
        // Tracking
        views: 0,
        clicks: 0,
        joins: 0
      };

      // Generate share URL
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      shareData.shareUrl = `${baseUrl}/join/${shareToken}`;
      shareData.directUrl = `${baseUrl}/room/${room.roomCode}`;

      // Save to Firebase
      await shareLinksRef.child(shareToken).set(shareData);

      // Track in memory
      this.activeShares.set(shareToken, shareData);

      console.log(`🔗 Share link generated for room ${room.roomCode}: ${shareToken}`);
      
      return shareData;

    } catch (error) {
      console.error('Error generating share link:', error);
      throw error;
    }
  }

  // Get share link details
  async getShareLink(shareToken) {
    try {
      const snapshot = await shareLinksRef.child(shareToken).once('value');
      const shareData = snapshot.val();

      if (!shareData) {
        throw new Error('Share link not found');
      }

      if (!shareData.isActive) {
        throw new Error('Share link is no longer active');
      }

      if (new Date(shareData.expiresAt) < new Date()) {
        throw new Error('Share link has expired');
      }

      if (shareData.maxUses && shareData.currentUses >= shareData.maxUses) {
        throw new Error('Share link has reached maximum uses');
      }

      // Increment view count
      await shareLinksRef.child(shareToken).update({
        views: shareData.views + 1,
        lastViewedAt: new Date().toISOString()
      });

      return shareData;

    } catch (error) {
      console.error('Error getting share link:', error);
      throw error;
    }
  }

  // Use share link (when someone clicks to join)
  async useShareLink(shareToken, userId) {
    try {
      const shareData = await this.getShareLink(shareToken);
      
      // Increment click count
      await shareLinksRef.child(shareToken).update({
        clicks: shareData.clicks + 1,
        lastClickedAt: new Date().toISOString()
      });

      // Add to usage tracking
      const usageData = {
        shareToken,
        userId,
        clickedAt: new Date().toISOString(),
        userAgent: 'api-request' // Would get from request headers
      };

      await shareLinksRef.child(shareToken).child('usage').push(usageData);

      return shareData;

    } catch (error) {
      console.error('Error using share link:', error);
      throw error;
    }
  }

  // Track successful join via share link
  async trackShareJoin(shareToken, userId) {
    try {
      const snapshot = await shareLinksRef.child(shareToken).once('value');
      const shareData = snapshot.val();

      if (shareData) {
        await shareLinksRef.child(shareToken).update({
          joins: (shareData.joins || 0) + 1,
          currentUses: (shareData.currentUses || 0) + 1,
          lastJoinedAt: new Date().toISOString()
        });

        // Track join event
        await shareLinksRef.child(shareToken).child('joins').push({
          userId,
          joinedAt: new Date().toISOString()
        });

        console.log(`📊 Share join tracked: ${shareToken} by ${userId}`);
      }

    } catch (error) {
      console.error('Error tracking share join:', error);
    }
  }

  // Create personal invitation
  async createInvitation(roomId, fromUserId, toUserEmail, options = {}) {
    try {
      const room = await roomService.getRoomById(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Check if user has permission to invite
      const userMember = room.members.find(member => member.userId === fromUserId);
      if (!userMember || !userMember.isActive) {
        throw new Error('You must be a room member to send invitations');
      }

      const inviteToken = this.generateShareToken();
      const expiryHours = options.expiryHours || 72; // Default 72 hours for personal invites

      const invitationData = {
        inviteToken,
        roomId,
        roomCode: room.roomCode,
        roomName: room.roomName,
        fromUserId,
        fromUserName: userMember.userName,
        toUserEmail,
        personalMessage: options.message || `${userMember.userName} invited you to join ${room.roomName}`,
        status: 'pending', // 'pending', 'accepted', 'declined', 'expired'
        expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        // Invitation settings
        requireResponse: options.requireResponse || false,
        allowForward: options.allowForward !== false // Default true
      };

      // Generate invitation URL
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      invitationData.inviteUrl = `${baseUrl}/invite/${inviteToken}`;

      // Save to Firebase
      await invitationsRef.child(inviteToken).set(invitationData);

      console.log(`💌 Invitation created: ${fromUserId} → ${toUserEmail} for room ${room.roomCode}`);
      
      return invitationData;

    } catch (error) {
      console.error('Error creating invitation:', error);
      throw error;
    }
  }

  // Get invitation details
  async getInvitation(inviteToken) {
    try {
      const snapshot = await invitationsRef.child(inviteToken).once('value');
      const invitation = snapshot.val();

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      if (invitation.status !== 'pending') {
        throw new Error(`Invitation is ${invitation.status}`);
      }

      if (new Date(invitation.expiresAt) < new Date()) {
        // Mark as expired
        await invitationsRef.child(inviteToken).update({
          status: 'expired',
          expiredAt: new Date().toISOString()
        });
        throw new Error('Invitation has expired');
      }

      return invitation;

    } catch (error) {
      console.error('Error getting invitation:', error);
      throw error;
    }
  }

  // Respond to invitation
  async respondToInvitation(inviteToken, response, userId = null) {
    try {
      const invitation = await this.getInvitation(inviteToken);
      
      const responseData = {
        status: response, // 'accepted' or 'declined'
        respondedAt: new Date().toISOString(),
        respondedBy: userId
      };

      await invitationsRef.child(inviteToken).update(responseData);

      console.log(`📨 Invitation ${response}: ${inviteToken}`);
      
      return { ...invitation, ...responseData };

    } catch (error) {
      console.error('Error responding to invitation:', error);
      throw error;
    }
  }

  // Get room share statistics
  async getRoomShareStats(roomId, userId) {
    try {
      const room = await roomService.getRoomById(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      if (room.createdBy !== userId) {
        throw new Error('Only room creator can view share statistics');
      }

      // Get share links for this room
      const shareSnapshot = await shareLinksRef.orderByChild('roomId').equalTo(roomId).once('value');
      const shareLinks = shareSnapshot.val() || {};

      // Get invitations for this room
      const inviteSnapshot = await invitationsRef.orderByChild('roomId').equalTo(roomId).once('value');
      const invitations = inviteSnapshot.val() || {};

      // Calculate statistics
      const shareStats = {
        totalShareLinks: Object.keys(shareLinks).length,
        activeShareLinks: Object.values(shareLinks).filter(link => link.isActive && new Date(link.expiresAt) > new Date()).length,
        totalViews: Object.values(shareLinks).reduce((sum, link) => sum + (link.views || 0), 0),
        totalClicks: Object.values(shareLinks).reduce((sum, link) => sum + (link.clicks || 0), 0),
        totalJoins: Object.values(shareLinks).reduce((sum, link) => sum + (link.joins || 0), 0),
        
        totalInvitations: Object.keys(invitations).length,
        pendingInvitations: Object.values(invitations).filter(inv => inv.status === 'pending').length,
        acceptedInvitations: Object.values(invitations).filter(inv => inv.status === 'accepted').length,
        declinedInvitations: Object.values(invitations).filter(inv => inv.status === 'declined').length,
        
        conversionRate: 0,
        shareLinks: Object.values(shareLinks),
        invitations: Object.values(invitations)
      };

      // Calculate conversion rate
      if (shareStats.totalClicks > 0) {
        shareStats.conversionRate = (shareStats.totalJoins / shareStats.totalClicks * 100).toFixed(2);
      }

      return shareStats;

    } catch (error) {
      console.error('Error getting room share stats:', error);
      throw error;
    }
  }

  // Deactivate share link
  async deactivateShareLink(shareToken, userId) {
    try {
      const shareData = await this.getShareLink(shareToken);
      
      if (shareData.createdBy !== userId) {
        throw new Error('Only creator can deactivate share link');
      }

      await shareLinksRef.child(shareToken).update({
        isActive: false,
        deactivatedAt: new Date().toISOString(),
        deactivatedBy: userId
      });

      // Remove from memory
      this.activeShares.delete(shareToken);

      console.log(`🚫 Share link deactivated: ${shareToken}`);
      
      return true;

    } catch (error) {
      console.error('Error deactivating share link:', error);
      throw error;
    }
  }

  // Get user's share links
  async getUserShareLinks(userId) {
    try {
      const snapshot = await shareLinksRef.orderByChild('createdBy').equalTo(userId).once('value');
      const shareLinks = snapshot.val() || {};

      return Object.values(shareLinks).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    } catch (error) {
      console.error('Error getting user share links:', error);
      throw error;
    }
  }

  // Get user's invitations (received)
  async getUserInvitations(userEmail) {
    try {
      const snapshot = await invitationsRef.orderByChild('toUserEmail').equalTo(userEmail).once('value');
      const invitations = snapshot.val() || {};

      return Object.values(invitations).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    } catch (error) {
      console.error('Error getting user invitations:', error);
      throw error;
    }
  }

  // Generate social media sharing data
  generateSocialShareData(shareData, platform = 'general') {
    const { shareUrl, title, description, roomName } = shareData;
    
    const socialData = {
      url: shareUrl,
      title: title,
      description: description,
      hashtags: ['roomchat', 'join', 'collaboration']
    };

    switch (platform) {
      case 'twitter':
        socialData.text = `${title} ${shareUrl} #roomchat`;
        socialData.twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(socialData.text)}`;
        break;
        
      case 'facebook':
        socialData.facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        break;
        
      case 'whatsapp':
        socialData.whatsappText = `${title}\n${description}\n\nJoin: ${shareUrl}`;
        socialData.whatsappUrl = `https://wa.me/?text=${encodeURIComponent(socialData.whatsappText)}`;
        break;
        
      case 'telegram':
        socialData.telegramText = `${title}\n${description}\n\nJoin: ${shareUrl}`;
        socialData.telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`;
        break;
        
      case 'email':
        socialData.emailSubject = `Invitation to join ${roomName}`;
        socialData.emailBody = `Hi!\n\n${description}\n\nClick here to join: ${shareUrl}\n\nBest regards!`;
        socialData.emailUrl = `mailto:?subject=${encodeURIComponent(socialData.emailSubject)}&body=${encodeURIComponent(socialData.emailBody)}`;
        break;
    }

    return socialData;
  }
}

// Create singleton instance
const shareService = new ShareService();

module.exports = shareService; 