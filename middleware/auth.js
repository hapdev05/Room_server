const { admin } = require('../config/firebase');

// Middleware để verify Firebase ID token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token không được cung cấp hoặc sai định dạng'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token với Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Thêm thông tin user vào request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture
    };
    
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ'
    });
  }
};

module.exports = {
  verifyToken
}; 