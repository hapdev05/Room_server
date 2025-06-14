const userService = require('../services/userService');
const { formatResponse } = require('../utils/helpers');

// Server-Sent Events cho realtime user updates
const streamUserUpdates = (req, res) => {
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  const { uid } = req.user;
  
  // Send initial data
  res.write(`data: ${JSON.stringify(formatResponse(true, 'Connected to user stream'))}\n\n`);

  // Listen to user changes
  const unsubscribe = userService.listenToUser(uid, (userData) => {
    if (userData) {
      res.write(`data: ${JSON.stringify(formatResponse(true, 'User updated', userData))}\n\n`);
    }
  });

  // Clean up on disconnect
  req.on('close', () => {
    unsubscribe();
  });

  req.on('end', () => {
    unsubscribe();
  });
};

// Set user presence
const setUserPresence = async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Setup presence monitoring
    await userService.setupUserPresence(uid);
    
    return res.status(200).json(
      formatResponse(true, 'User presence setup successfully')
    );

  } catch (error) {
    console.error('Error setting up user presence:', error);
    return res.status(500).json(
      formatResponse(false, 'Error setting up user presence', null, error.message)
    );
  }
};

// Get online users count (public endpoint)
const getOnlineUsersCount = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    const onlineCount = users.filter(user => user.metadata?.isOnline === true).length;
    
    return res.status(200).json(
      formatResponse(true, 'Online users count retrieved', { onlineCount })
    );

  } catch (error) {
    console.error('Error getting online users count:', error);
    return res.status(500).json(
      formatResponse(false, 'Error getting online users count', null, error.message)
    );
  }
};

module.exports = {
  streamUserUpdates,
  setUserPresence,
  getOnlineUsersCount
}; 