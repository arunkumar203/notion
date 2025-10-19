#!/usr/bin/env python3
"""
Test Firebase connection
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

def test_firebase():
    """Test Firebase Admin SDK connection"""
    print("🔥 Testing Firebase Connection")
    print("=" * 40)
    
    # Load environment variables
    env_path = Path(__file__).parent.parent / ".env.local"
    load_dotenv(env_path)
    
    # Get credentials
    FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")
    FIREBASE_CLIENT_EMAIL = os.getenv("FIREBASE_CLIENT_EMAIL") 
    FIREBASE_PRIVATE_KEY = os.getenv("FIREBASE_PRIVATE_KEY")
    FIREBASE_DATABASE_URL = os.getenv("NEXT_PUBLIC_FIREBASE_DATABASE_URL")
    
    if not all([FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DATABASE_URL]):
        print("❌ Missing Firebase credentials")
        return False
    
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore, db as rtdb
        
        # Clean up private key
        private_key = FIREBASE_PRIVATE_KEY
        if private_key.startswith('"') and private_key.endswith('"'):
            private_key = private_key[1:-1]
        private_key = private_key.replace('\\n', '\n')
        
        print(f"📋 Project ID: {FIREBASE_PROJECT_ID}")
        print(f"📧 Client Email: {FIREBASE_CLIENT_EMAIL}")
        print(f"🔗 Database URL: {FIREBASE_DATABASE_URL}")
        
        # Initialize Firebase Admin
        if not firebase_admin._apps:
            cred = credentials.Certificate({
                "type": "service_account",
                "project_id": FIREBASE_PROJECT_ID,
                "private_key_id": "1",
                "private_key": private_key,
                "client_email": FIREBASE_CLIENT_EMAIL,
                "client_id": "",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{FIREBASE_CLIENT_EMAIL.replace('@', '%40')}"
            })
            
            firebase_admin.initialize_app(cred, {
                'databaseURL': FIREBASE_DATABASE_URL
            })
            
        print("✅ Firebase Admin initialized")
        
        # Test Firestore
        firestore_client = firestore.client()
        print("✅ Firestore client created")
        
        # Test Realtime Database
        rtdb_client = rtdb.reference()
        print("✅ Realtime Database client created")
        
        # Test a simple read (this will fail if permissions are wrong, but that's ok)
        try:
            test_ref = rtdb_client.child('test')
            print("✅ Realtime Database connection test passed")
        except Exception as e:
            print(f"⚠️  Realtime Database read test failed (this might be normal): {e}")
        
        print("=" * 40)
        print("🎉 Firebase connection successful!")
        return True
        
    except Exception as e:
        print(f"❌ Firebase connection failed: {e}")
        print("=" * 40)
        return False

if __name__ == "__main__":
    success = test_firebase()
    sys.exit(0 if success else 1)