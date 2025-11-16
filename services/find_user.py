#!/usr/bin/env python3
"""
Find user ID by email for testing RAG
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

def find_user_by_email(email: str):
    """Find user ID by email address"""
    print(f"🔍 Looking for user with email: {email}")
    print("=" * 50)
    
    # Load environment variables
    env_path = Path(__file__).parent.parent / ".env.local"
    load_dotenv(env_path)
    
    try:
        import firebase_admin
        from firebase_admin import credentials, auth as admin_auth
        
        # Firebase setup
        FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")
        FIREBASE_CLIENT_EMAIL = os.getenv("FIREBASE_CLIENT_EMAIL") 
        FIREBASE_PRIVATE_KEY = os.getenv("FIREBASE_PRIVATE_KEY")
        FIREBASE_DATABASE_URL = os.getenv("NEXT_PUBLIC_FIREBASE_DATABASE_URL")
        
        if not firebase_admin._apps:
            private_key = FIREBASE_PRIVATE_KEY
            if private_key.startswith('"') and private_key.endswith('"'):
                private_key = private_key[1:-1]
            private_key = private_key.replace('\\n', '\n')
            
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
        
        # Try to find user by email
        try:
            user_record = admin_auth.get_user_by_email(email)
            print(f"✅ Found user!")
            print(f"   User ID: {user_record.uid}")
            print(f"   Email: {user_record.email}")
            print(f"   Email Verified: {user_record.email_verified}")
            print(f"   Created: {user_record.user_metadata.creation_timestamp}")
            
            return user_record.uid
            
        except admin_auth.UserNotFoundError:
            print(f"❌ No user found with email: {email}")
            return None
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def main():
    if len(sys.argv) != 2:
        print("Usage: python find_user.py <email>")
        print("Example: python find_user.py admin@gmail.com")
        sys.exit(1)
    
    email = sys.argv[1]
    user_id = find_user_by_email(email)
    
    if user_id:
        print("=" * 50)
        print(f"🚀 Test RAG with this user ID:")
        print(f"   python services/test_rag.py {user_id}")

if __name__ == "__main__":
    main()