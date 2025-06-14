// Utility functions for the application

/**
 * Validate email format
 * @param {string} email 
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Generate random string
 * @param {number} length 
 * @returns {string}
 */
const generateRandomString = (length = 10) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Format response object
 * @param {boolean} success 
 * @param {string} message 
 * @param {any} data 
 * @param {any} error 
 * @returns {object}
 */
const formatResponse = (success, message, data = null, error = null) => {
  const response = {
    success,
    message,
    timestamp: new Date().toISOString()
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  if (error !== null) {
    response.error = error;
  }
  
  return response;
};

/**
 * Sanitize user data for response
 * @param {object} userData 
 * @returns {object}
 */
const sanitizeUserData = (userData) => {
  const {
    uid,
    email,
    displayName,
    photoURL,
    emailVerified,
    customClaims
  } = userData;
  
  return {
    uid,
    email,
    displayName,
    photoURL,
    emailVerified,
    customClaims: customClaims || {}
  };
};

/**
 * Log error with timestamp
 * @param {string} context 
 * @param {Error} error 
 */
const logError = (context, error) => {
  console.error(`[${new Date().toISOString()}] ${context}:`, error);
};

/**
 * Log info with timestamp
 * @param {string} context 
 * @param {string} message 
 */
const logInfo = (context, message) => {
  console.log(`[${new Date().toISOString()}] ${context}: ${message}`);
};

module.exports = {
  isValidEmail,
  generateRandomString,
  formatResponse,
  sanitizeUserData,
  logError,
  logInfo
}; 