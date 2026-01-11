#!/usr/bin/env python3
"""
Test script for RAG pipeline
"""

import sys
import os
from pathlib import Path

# Add services directory to path
sys.path.insert(0, str(Path(__file__).parent))

from rag_pipeline import RAGPipeline

def test_rag_pipeline(user_id: str):
    """Test the RAG pipeline with a user ID"""
    print(f"Testing RAG pipeline for user: {user_id}")
    print("=" * 50)
    
    try:
        # Initialize RAG pipeline
        rag = RAGPipeline(user_id)
        
        # Test loading pages
        print("1. Loading user pages...")
        pages = rag.load_user_pages()
        print(f"   Found {len(pages)} pages")
        
        if not pages:
            print("   No pages found. Make sure the user has some content.")
            return
        
        # Test chunking
        print("2. Creating chunks...")
        chunks = rag.create_chunks_with_metadata(pages)
        print(f"   Created {len(chunks)} chunks")
        
        if not chunks:
            print("   No chunks created. Pages might be empty.")
            return
        
        # Test embeddings (just first few)
        print("3. Testing embeddings (first 3 chunks)...")
        test_chunks = chunks[:3]
        embeddings = rag.generate_embeddings(test_chunks)
        print(f"   Generated {len(embeddings)} embeddings")
        print(f"   Embedding dimension: {len(embeddings[0]) if embeddings else 0}")
        
        # Test storage
        print("4. Testing Firestore storage...")
        rag.store_vectors_in_firestore(test_chunks, embeddings)
        print("   ✅ Storage test completed")
        
        # Test search
        print("5. Testing search...")
        test_query = "test query"
        results = rag.search_similar_chunks(test_query, top_k=2)
        print(f"   Found {len(results)} similar chunks")
        
        # Test chat
        print("6. Testing RAG chat...")
        chat_result = rag.rag_chat("What is this about?")
        print(f"   Answer: {chat_result['answer'][:100]}...")
        print(f"   Used {len(chat_result['matches'])} sources")
        
        print("=" * 50)
        print("🎉 RAG pipeline test completed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

def rag_chat_query(user_id: str, question: str):
    """Handle RAG chat query and return JSON result"""
    import json
    import sys
    
    try:
        # Suppress stdout during initialization to avoid JSON parsing issues
        original_stdout = sys.stdout
        sys.stdout = sys.stderr  # Redirect prints to stderr
        
        # Initialize RAG pipeline
        rag = RAGPipeline(user_id)
        
        # Restore stdout for JSON output
        sys.stdout = original_stdout
        
        # Perform RAG chat
        result = rag.rag_chat(question)
        
        # Return JSON result (only thing that should go to stdout)
        print(json.dumps(result))
        
    except Exception as e:
        # Restore stdout if there was an error
        sys.stdout = original_stdout
        
        # Return error as JSON
        error_result = {
            "answer": f"Error processing your question: {str(e)}",
            "matches": [],
            "context_used": 0,
            "error": str(e)
        }
        print(json.dumps(error_result))

def main():
    if len(sys.argv) == 2:
        # Test mode
        user_id = sys.argv[1]
        test_rag_pipeline(user_id)
    elif len(sys.argv) == 3:
        # Chat mode
        user_id = sys.argv[1]
        question = sys.argv[2]
        rag_chat_query(user_id, question)
    else:
        print("Usage:")
        print("  Test mode: python test_rag.py <user_id>")
        print("  Chat mode: python test_rag.py <user_id> <question>")
        sys.exit(1)

if __name__ == "__main__":
    main()