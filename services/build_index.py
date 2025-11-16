#!/usr/bin/env python3
"""
Build RAG index for a user (non-interactive)
Called by the API route
"""

import sys
from pathlib import Path

# Add services directory to path
sys.path.insert(0, str(Path(__file__).parent))

from rag_pipeline import RAGPipeline

def main():
    if len(sys.argv) != 2:
        print("Usage: python build_index.py <user_id>")
        sys.exit(1)
    
    user_id = sys.argv[1]
    
    try:
        print(f"Starting RAG build for user: {user_id}")
        rag = RAGPipeline(user_id)
        rag.build_rag_index()
        print(f"RAG build completed successfully for user: {user_id}")
        
    except Exception as e:
        print(f"ERROR: RAG build failed for user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()