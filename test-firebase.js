const { admin } = require('./config/firebase');

async function testFirebaseConnection() {
  try {
    console.log('🔥 Testing Firebase connection...');
    
    // Test Firebase Admin connection
    const app = admin.app();
    console.log('✅ Firebase Admin initialized successfully');
    console.log('📊 Project ID:', app.options.projectId);
    
    // Test creating a custom token (this will fail if connection is bad)
    const testUid = 'test-user-123';
    const customToken = await admin.auth().createCustomToken(testUid);
    console.log('✅ Custom token created successfully');
    console.log('🎫 Token length:', customToken.length);
    
    // Test getting users (this will work even if no users exist)
    const listUsersResult = await admin.auth().listUsers(1);
    console.log('✅ User list access successful');
    console.log('👥 Users count:', listUsersResult.users.length);
    
    console.log('\n🎉 Firebase connection test PASSED!');
    console.log('🚀 Your Firebase setup is working correctly');
    
  } catch (error) {
    console.error('❌ Firebase connection test FAILED!');
    console.error('🔍 Error details:', error.message);
    
    if (error.code) {
      console.error('🏷️  Error code:', error.code);
    }
    
    // Common error solutions
    console.log('\n🛠️  Common solutions:');
    console.log('1. Check if service account key file exists');
    console.log('2. Verify Firebase project ID is correct');
    console.log('3. Ensure Firebase Admin SDK is enabled in your project');
    console.log('4. Check if service account has proper permissions');
  }
}

testFirebaseConnection(); 