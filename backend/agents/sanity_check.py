import os
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings

load_dotenv()

print("🚀 Testing connection to Gemini Embeddings...", flush=True)

try:
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001", google_api_key=os.getenv("GEMINI_API_KEY")
    )
    # Test a simple embedding
    vector = embeddings.embed_query("This is a test of the vector brain.")
    print(
        f"✅ Connection successful! Received vector of size: {len(vector)}", flush=True
    )
except Exception as e:
    print(f"❌ Connection failed. Detailed Error: {e}", flush=True)
