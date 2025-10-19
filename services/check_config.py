#!/usr/bin/env python3
"""
Configuration checker for RAG service
Verifies all required environment variables and Firebase setup
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

def check_config():
    """Check all required configuration"""
    print("🔍 Checking RAG Service Configuration")
    print("=" * 50)
    
    # Load environment variables
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✅ Loaded .env.local from: {env_path}")
    else:
        print(f"❌ .env.local not found at: {env_path}")
        return False
    
    success = True
    
    # Check Google AI API Key (now per-user, not global)
    print("ℹ️  Google AI API Key: Using per-user keys from Firebase settings")
    print("   Users add their API keys in Account Settings → AI Configuration")
    
    # Check Firebase credentials
    firebase_vars = {
        "FIREBASE_PROJECT_ID": os.getenv("FIREBASE_PROJECT_ID"),
        "FIREBASE_CLIENT_EMAIL": os.getenv("FIREBASE_CLIENT_EMAIL"),
        "FIREBASE_PRIVATE_KEY": os.getenv("FIREBASE_PRIVATE_KEY"),
        "NEXT_PUBLIC_FIREBASE_DATABASE_URL": os.getenv("NEXT_PUBLIC_FIREBASE_DATABASE_URL")
    }
    
    for var_name, var_value in firebase_vars.items():
        if not var_value:
            print(f"❌ {var_name}: Missing")
            success = False
        else:
            if var_name == "FIREBASE_PRIVATE_KEY":
                # Check private key format - handle the quoted format from .env
                print(f"🔍 Checking private key format...")
                print(f"   Raw length: {len(var_value)} chars")
                starts_with_quote = var_value.startswith('"')
                ends_with_quote = var_value.endswith('"')
                print(f"   Starts with quote: {starts_with_quote}")
                print(f"   Ends with quote: {ends_with_quote}")
                
                # Clean up the private key
                clean_key = var_value
                if clean_key.startswith('"') and clean_key.endswith('"'):
                    clean_key = clean_key[1:-1]  # Remove outer quotes
                
                # Replace escaped newlines
                clean_key = clean_key.replace('\\n', '\n')
                
                print(f"   After cleanup - starts with BEGIN: {clean_key.startswith('-----BEGIN')}")
                print(f"   After cleanup - ends with END: {clean_key.strip().endswith('-----')}")
                
                # Check if it looks like a valid private key
                if ('-----BEGIN PRIVATE KEY-----' in clean_key and 
                    '-----END PRIVATE KEY-----' in clean_key):
                    print(f"✅ {var_name}: Valid format detected")
                else:
                    print(f"❌ {var_name}: Invalid format - missing BEGIN/END markers")
                    print(f"   Key preview: {clean_key[:50]}...{clean_key[-50:]}")
                    success = False
            else:
                print(f"✅ {var_name}: {var_value}")
    
    print("=" * 50)
    
    if success:
        print("🎉 Configuration looks good!")
        print("\nNext steps:")
        print("1. Make sure Python dependencies are installed:")
        print("   pip install -r services/requirements.txt")
        print("2. Test the RAG service:")
        print("   python services/test_rag.py <user_id>")
        return True
    else:
        print("❌ Configuration issues found. Please fix them and try again.")
        return False

if __name__ == "__main__":
    success = check_config()
    sys.exit(0 if success else 1)