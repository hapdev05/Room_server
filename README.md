# Room Server - Firebase Google Authentication API

Một REST API Node.js với Express và Firebase Authentication hỗ trợ đăng nhập bằng Google, lưu trữ thông tin người dùng trong Firebase Realtime Database.

## 🚀 Tính năng

- ✅ Đăng nhập bằng Google qua Firebase Auth
- ✅ Verify JWT tokens
- ✅ Middleware bảo vệ routes
- ✅ **Lưu trữ thông tin user trong Firebase Realtime Database**
- ✅ **Realtime user tracking và online/offline status**
- ✅ **Server-Sent Events cho realtime updates**
- ✅ **User presence detection**
- ✅ **Profile management**
- ✅ RESTful API design
- ✅ Error handling
- ✅ CORS support

## 📁 Cấu trúc thư mục

```
├── config/
│   ├── firebase.js                    # Cấu hình Firebase + Service Account
│   └── room-online-d9d28-*.json      # Firebase Service Account Key
├── controllers/
│   ├── authController.js             # Logic xử lý authentication
│   └── realtimeController.js         # Logic xử lý realtime features
├── middleware/
│   └── auth.js                       # Middleware xác thực
├── routes/
│   └── auth.js                       # API routes
├── services/
│   └── userService.js                # User service với Realtime Database
├── utils/
│   └── helpers.js                    # Utility functions
├── index.js                          # Entry point
├── package.json
└── README.md
```

## 🛠️ Cài đặt

### 1. Clone repository
```bash
git clone <your-repo-url>
cd RoomServer
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình Firebase

#### 3.1. Tạo Firebase Project
1. Truy cập [Firebase Console](https://console.firebase.google.com/)
2. Tạo project mới
3. Enable **Authentication** và chọn **Google Sign-in**
4. Enable **Realtime Database**

#### 3.2. Lấy Service Account Key
1. Vào **Project Settings** → **Service Accounts**
2. **Generate new private key**
3. Download file JSON và đặt vào thư mục `config/`
4. Cập nhật đường dẫn file trong `config/firebase.js`

#### 3.3. Cấu hình Firebase Config
Cập nhật thông tin Firebase Client SDK trong `config/firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### 4. Chạy server

#### Development
```bash
npm run dev
```

#### Production
```bash
npm start
```

Server sẽ chạy tại `http://localhost:3001`

## 📚 API Documentation

### Base URL
```
http://localhost:3001/api/auth
```

### 🔐 Authentication Endpoints

#### 1. Đăng nhập bằng Google
```http
POST /api/auth/google-login
```

**Body:**
```json
{
  "idToken": "firebase-id-token-from-client"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": {
    "user": {
      "uid": "user-uid",
      "email": "user@gmail.com",
      "displayName": "User Name",
      "photoURL": "https://...",
      "emailVerified": true,
      "profile": {
        "firstName": "User",
        "lastName": "Name",
        "avatar": "https://...",
        "locale": "vi",
        "timezone": "Asia/Ho_Chi_Minh"
      },
      "settings": {
        "notifications": true,
        "theme": "light",
        "language": "vi"
      },
      "metadata": {
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "lastLoginAt": "2024-01-01T00:00:00.000Z",
        "loginCount": 1,
        "isActive": true,
        "isOnline": true
      }
    },
    "tokens": {
      "customToken": "custom-token",
      "idToken": "id-token"
    },
    "loginInfo": {
      "loginTime": "2024-01-01T00:00:00.000Z",
      "loginCount": 1,
      "isFirstLogin": true
    }
  }
}
```

#### 2. Verify Token
```http
POST /api/auth/verify-token
```

#### 3. Lấy thông tin user hiện tại
```http
GET /api/auth/me
```

#### 4. Cập nhật profile
```http
PUT /api/auth/profile
```

**Body:**
```json
{
  "profile": {
    "firstName": "New Name",
    "locale": "en"
  },
  "settings": {
    "theme": "dark",
    "notifications": false
  }
}
```

#### 5. Đăng xuất
```http
POST /api/auth/logout
```

### 🔄 Realtime Endpoints

#### 6. Setup user presence
```http
POST /api/auth/presence
```

#### 7. Lấy số lượng users online (public)
```http
GET /api/auth/online-count
```

### 📡 Server-Sent Events (Realtime)

#### 8. Stream user updates
```http
GET /api/auth/stream/user
```

**Client-side example:**
```javascript
const eventSource = new EventSource('/api/auth/stream/user', {
  headers: {
    'Authorization': 'Bearer ' + idToken
  }
});

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('User updated:', data);
};
```

## 🔒 Authentication Flow

### Client-side (Frontend)
```javascript
// 1. Đăng nhập bằng Google popup
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const provider = new GoogleAuthProvider();
const result = await signInWithPopup(auth, provider);
const idToken = await result.user.getIdToken();

// 2. Gửi idToken lên server
const response = await fetch('/api/auth/google-login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ idToken })
});

const data = await response.json();
console.log('User data:', data.data.user);

// 3. Setup presence detection
await fetch('/api/auth/presence', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + idToken
  }
});

// 4. Listen to realtime updates
const eventSource = new EventSource('/api/auth/stream/user', {
  headers: {
    'Authorization': 'Bearer ' + idToken
  }
});

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  if (data.success) {
    console.log('Realtime update:', data.data);
  }
};
```

## 💾 Cấu trúc dữ liệu trong Realtime Database

```json
{
  "users": {
    "user-uid-1": {
      "email": "user@gmail.com",
      "displayName": "User Name",
      "photoURL": "https://...",
      "emailVerified": true,
      "phoneNumber": null,
      "provider": "google",
      "profile": {
        "firstName": "User",
        "lastName": "Name",
        "avatar": "https://...",
        "locale": "vi",
        "timezone": "Asia/Ho_Chi_Minh"
      },
      "settings": {
        "notifications": true,
        "theme": "light",
        "language": "vi"
      },
      "metadata": {
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "lastLoginAt": "2024-01-01T00:00:00.000Z",
        "loginCount": 5,
        "isActive": true,
        "isOnline": true,
        "lastSeenAt": "2024-01-01T00:00:00.000Z"
      }
    }
  }
}
```

## 🎯 Các tính năng nổi bật

### 1. **Realtime User Tracking**
- Tự động track online/offline status
- Realtime updates qua Server-Sent Events
- Presence detection với Firebase

### 2. **Smart User Management**
- Tự động tạo/cập nhật user profile
- Lưu trữ thông tin chi tiết (profile, settings, metadata)
- Login tracking và user analytics

### 3. **Flexible Profile System**
- Customizable user profiles
- User settings management
- Multi-language support

## 🌐 Frontend Integration

### HTML Example
```html
<!DOCTYPE html>
<html>
<head>
    <title>Firebase Auth Demo</title>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"></script>
</head>
<body>
    <div id="loginSection">
        <button id="loginBtn">Đăng nhập bằng Google</button>
    </div>
    
    <div id="userSection" style="display:none">
        <h3>Chào mừng <span id="userName"></span>!</h3>
        <img id="userPhoto" width="50" height="50">
        <p>Online users: <span id="onlineCount">0</span></p>
        <button id="logoutBtn">Đăng xuất</button>
    </div>

    <script>
        // Firebase config
        const firebaseConfig = {
            // Your Firebase config here
        };
        
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        
        // Google login
        document.getElementById('loginBtn').onclick = async () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await auth.signInWithPopup(provider);
            const idToken = await result.user.getIdToken();
            
            // Send to server
            const response = await fetch('/api/auth/google-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });
            
            const data = await response.json();
            if (data.success) {
                showUserSection(data.data.user);
                setupPresence(idToken);
                loadOnlineCount();
            }
        };
        
        // Setup presence
        async function setupPresence(token) {
            await fetch('/api/auth/presence', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
        }
        
        // Load online count
        async function loadOnlineCount() {
            const response = await fetch('/api/auth/online-count');
            const data = await response.json();
            document.getElementById('onlineCount').textContent = data.data.onlineCount;
        }
        
        function showUserSection(user) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('userSection').style.display = 'block';
            document.getElementById('userName').textContent = user.displayName;
            document.getElementById('userPhoto').src = user.photoURL;
        }
    </script>
</body>
</html>
```

## 🛠️ Development

### Thêm user field mới
```javascript
// services/userService.js
const userInfo = {
  // ... existing fields
  newField: userData.newField || 'default value'
};
```

### Tạo custom middleware
```javascript
// middleware/customMiddleware.js
const customMiddleware = (req, res, next) => {
  // Your logic here
  next();
};

module.exports = customMiddleware;
```

### Extend realtime features
```javascript
// services/userService.js
listenToCustomData(callback) {
  this.db.ref('custom-path').on('value', callback);
}
```

## 🐛 Troubleshooting

### Lỗi thường gặp

1. **Firebase configuration error**
   - Kiểm tra service account key file
   - Verify Firebase project ID
   - Ensure Realtime Database is enabled

2. **Database permission error**
   - Check Firebase Database Rules
   - Verify service account permissions
   - Ensure project ID matches

3. **Realtime connection issues**
   - Check database URL format
   - Verify network connectivity
   - Review CORS settings

### Firebase Database Rules
```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

## 📝 License

MIT License

## 🤝 Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request 