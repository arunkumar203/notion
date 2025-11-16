#!/usr/bin/env python3
"""
Setup script for RAG service
Installs dependencies and verifies configuration
"""

import subprocess
import sys
import os
from pathlib import Path

def install_requirements():
    """Install Python requirements"""
    requirements_file = Path(__file__).parent / "requirements.txt"
    
    print("Installing Python dependencies...")
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-r", str(requirements_file)
        ])
        print("✅ Dependencies installed successfully")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        return False
    
    return True

def verify_env_vars():
    """Verify required environment variables using config checker"""
    try:
        # Import and run the config checker
        sys.path.insert(0, str(Path(__file__).parent))
        from check_config import check_config
        return check_config()
    except Exception as e:
        print(f"❌ Error checking configuration: {e}")
        return False

def test_imports():
    """Test that all required modules can be imported"""
    modules = [
        "google.genai",
        "firebase_admin",
        "bs4",
        "langchain.text_splitter"
    ]
    
    failed_imports = []
    for module in modules:
        try:
            __import__(module)
        except ImportError:
            failed_imports.append(module)
    
    if failed_imports:
        print("❌ Failed to import modules:")
        for module in failed_imports:
            print(f"   - {module}")
        return False
    
    print("✅ All required modules can be imported")
    return True

def main():
    print("🚀 Setting up RAG service...")
    print("=" * 50)
    
    # Load environment variables
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        print("Installing python-dotenv first...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "python-dotenv"])
        from dotenv import load_dotenv
        load_dotenv()
    
    success = True
    
    # Install dependencies
    if not install_requirements():
        success = False
    
    # Verify environment
    if not verify_env_vars():
        success = False
    
    # Test imports
    if not test_imports():
        success = False
    
    print("=" * 50)
    if success:
        print("🎉 RAG service setup completed successfully!")
        print("\nNext steps:")
        print("1. Make sure your Google AI API key is set in .env.local")
        print("2. Test the service with: python services/rag_pipeline.py <user_id>")
        print("3. Use the RAG toggle in the chat interface")
    else:
        print("❌ Setup failed. Please fix the issues above and try again.")
        sys.exit(1)

if __name__ == "__main__":
    main()