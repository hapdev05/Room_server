const { admin } = require('../config/firebase');
const { signInWithPopup, GoogleAuthProvider, signOut } = require('firebase/auth');
const userService = require('../services/userService');
const { formatResponse, sanitizeUserData } = require('../utils/helpers');

// Controller đăng nhập bằng Google
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json(
        formatResponse(false, 'ID token không được cung cấp')
      );
    }

    // Verify ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Lấy thông tin user từ Firebase Auth
    const userRecord = await admin.auth().getUser(decodedToken.uid);
    
    // Tạo custom token (optional)
    const customToken = await admin.auth().createCustomToken(decodedToken.uid);
    
    // Lưu hoặc cập nhật thông tin user vào local storage
    const savedUser = await userService.createOrUpdateUser({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      emailVerified: userRecord.emailVerified,
      phoneNumber: userRecord.phoneNumber,
      customClaims: userRecord.customClaims || {}
    });

    if (!savedUser) {
      return res.status(500).json(
        formatResponse(false, 'Lỗi lưu thông tin người dùng')
      );
    }

    // Prepare response data
    const responseData = {
      user: sanitizeUserData(savedUser),
      tokens: {
        customToken: customToken,
        idToken: idToken
      },
      loginInfo: {
        loginTime: new Date().toISOString(),
        loginCount: savedUser.metadata.loginCount,
        isFirstLogin: savedUser.metadata.loginCount === 1
      }
    };

    return res.status(200).json(
      formatResponse(true, 'Đăng nhập thành công', responseData)
    );

  } catch (error) {
    console.error('Error in Google login:', error);
    return res.status(401).json(
      formatResponse(false, 'Đăng nhập thất bại', null, error.message)
    );
  }
};

// Controller verify token
const verifyToken = async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json(
        formatResponse(false, 'Token không được cung cấp')
      );
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Lấy thông tin user từ local storage
    const localUser = await userService.findUserByUid(decodedToken.uid);
    
    const userData = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
      localUserData: localUser ? sanitizeUserData(localUser) : null
    };
    
    return res.status(200).json(
      formatResponse(true, 'Token hợp lệ', userData)
    );

  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(401).json(
      formatResponse(false, 'Token không hợp lệ', null, error.message)
    );
  }
};

// Controller lấy thông tin user hiện tại
const getCurrentUser = async (req, res) => {
  try {
    // req.user đã được set bởi middleware verifyToken
    const userRecord = await admin.auth().getUser(req.user.uid);
    const localUser = await userService.findUserByUid(req.user.uid);
    
    const userData = {
      firebase: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        emailVerified: userRecord.emailVerified,
        customClaims: userRecord.customClaims || {}
      },
      profile: localUser ? sanitizeUserData(localUser) : null
    };
    
    return res.status(200).json(
      formatResponse(true, 'Lấy thông tin user thành công', userData)
    );

  } catch (error) {
    console.error('Error getting current user:', error);
    return res.status(500).json(
      formatResponse(false, 'Lỗi lấy thông tin user', null, error.message)
    );
  }
};

// Controller cập nhật profile user
const updateProfile = async (req, res) => {
  try {
    const { uid } = req.user;
    const updateData = req.body;
    
    // Validate dữ liệu đầu vào
    const allowedFields = ['profile', 'settings'];
    const filteredData = {};
    
    allowedFields.forEach(field => {
      if (updateData[field]) {
        filteredData[field] = updateData[field];
      }
    });
    
    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json(
        formatResponse(false, 'Không có dữ liệu để cập nhật')
      );
    }
    
    const updatedUser = await userService.updateUser(uid, filteredData);
    
    if (!updatedUser) {
      return res.status(404).json(
        formatResponse(false, 'Không tìm thấy user')
      );
    }
    
    return res.status(200).json(
      formatResponse(true, 'Cập nhật profile thành công', sanitizeUserData(updatedUser))
    );

  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json(
      formatResponse(false, 'Lỗi cập nhật profile', null, error.message)
    );
  }
};

// Controller đăng xuất
const logout = async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Revoke refresh token từ Firebase
    await admin.auth().revokeRefreshTokens(uid);
    
    // Cập nhật trạng thái offline trong local storage
    await userService.updateOnlineStatus(uid, false);
    
    return res.status(200).json(
      formatResponse(true, 'Đăng xuất thành công')
    );

  } catch (error) {
    console.error('Error in logout:', error);
    return res.status(500).json(
      formatResponse(false, 'Lỗi đăng xuất', null, error.message)
    );
  }
};

module.exports = {
  googleLogin,
  verifyToken,
  getCurrentUser,
  updateProfile,
  logout
}; 