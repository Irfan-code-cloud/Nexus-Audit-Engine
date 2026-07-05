# backend/agents/vector_brain.py
import os
import requests
import shutil
from dotenv import load_dotenv
from agents.dependency_mapper import TacticalDependencyMapper
from auth_engine import get_dynamic_github_token

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS


load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

FAISS_INDEX_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "faiss_index")
)


def fetch_code_from_github(repo_path: str):
    """Fetches live code dynamically with strict timeouts and explicit logging."""
    print(f"📡 Connecting to GitHub API for repo: {repo_path}...")

    dynamic_token = get_dynamic_github_token(repo_path)

    headers = {
        "Authorization": f"Bearer {dynamic_token}",
        "Accept": "application/vnd.github.v3+json",
    }

    # 1. Fetch repo info with a strict 10-second timeout
    repo_info_url = f"https://api.github.com/repos/{repo_path}"
    try:
        repo_res = requests.get(repo_info_url, headers=headers, timeout=10)
    except requests.exceptions.Timeout:
        print("❌ GitHub API timed out while fetching repo details.")
        return []

    if repo_res.status_code != 200:
        print(f"❌ Failed to fetch repo info. Status: {repo_res.status_code}.")
        return []

    default_branch = repo_res.json().get("default_branch", "main")
    print(f"🌿 Detected default branch: {default_branch}")

    # 2. Fetch the file tree
    tree_url = f"https://api.github.com/repos/{repo_path}/git/trees/{default_branch}?recursive=1"
    try:
        response = requests.get(tree_url, headers=headers, timeout=45)
    except requests.exceptions.Timeout:
        print("❌ GitHub API timed out while fetching repository file tree.")
        return []

    if response.status_code != 200:
        print(
            f"❌ Failed to fetch repository tree. Status Code: {response.status_code}"
        )
        return []

    tree_data = response.json()
    documents = []

    valid_extensions = (
        ".py",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".dart",
        ".java",
        ".cpp",
        ".c",
        ".go",
        ".rb",
        ".php",
        ".yml",
        ".yaml",
    )

    # Count how many total files match before downloading
    matching_items = [
        item
        for item in tree_data.get("tree", [])
        if item.get("type") == "blob"
        and item.get("path", "").endswith(valid_extensions)
        and not any(
            ignored in item.get("path", "")
            for ignored in [
                "venv/",
                ".venv/",
                "__pycache__",
                "node_modules/",
                ".git/",
                "build/",
                "dist/",
            ]
        )
    ]

    print(f"📂 Found {len(matching_items)} matching code files to index.")

    # 3. Download matching files with timeouts
    for index, item in enumerate(matching_items, 1):
        file_path = item.get("path", "")
        print(f"📥 [{index}/{len(matching_items)}] Downloading: {file_path}...")

        raw_url = f"https://api.github.com/repos/{repo_path}/contents/{file_path}"
        try:
            file_res = requests.get(raw_url, headers=headers, timeout=20)
            if file_res.status_code == 200:
                file_data = file_res.json()
                import base64

                content = base64.b64decode(file_data.get("content", "")).decode("utf-8")
                doc = Document(
                    page_content=content,
                    metadata={"source": f"github://{repo_path}/{file_path}"},
                )
                documents.append(doc)
        except requests.exceptions.Timeout:
            print(f"⚠️ Timeout skipping file: {file_path}")
        except Exception as e:
            print(f"⚠️ Error processing {file_path}: {e}")

    return documents


def build_vector_brain(repo_path: str):
    print(f"🧠 Initiating brain build for {repo_path}...")

    # 1. THE MEMORY WIPE: Delete the old FAISS index folder if it exists
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    index_path = os.path.join(base_dir, "faiss_index")

    if os.path.exists(index_path):
        print("🧹 Wiping old FAISS memory to prevent data bleed...")
        shutil.rmtree(index_path)

    # 2. Fetch the new code
    documents = fetch_code_from_github(repo_path)
    if not documents:
        print("❌ No valid code found to build brain.")
        return False

        # NEW: 2.5 THE AST DEPENDENCY SCAN (In-Memory)
    try:
        mapper = TacticalDependencyMapper(repo_path)
        # Pass the downloaded documents directly into the mapper!
        mapper.map_from_documents(documents)
    except Exception as e:
        print(f"⚠️ Dependency mapping failed, but continuing brain build: {e}")

    # 3. Rebuild from scratch
    print(f"📚 Chunking {len(documents)} files for new brain...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    chunks = text_splitter.split_documents(documents)

    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001", google_api_key=os.getenv("GEMINI_API_KEY")
    )

    vector_db = FAISS.from_documents(chunks, embeddings)
    vector_db.save_local(index_path)

    print(f"🏆 FAISS Brain Compiled for {repo_path}!")
    return True
