# backend/main.py
import os
import json
import networkx as nx
import base64
import time
import datetime
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any
from agents.pr_agent import create_draft_pr
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception

from groq import Groq
from dotenv import load_dotenv

# --- RAG IMPORTS ---
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS

# 1. LOAD THE VAULT
load_dotenv()
client = Groq()


# --- RATE LIMIT DEFENDER ---
def is_rate_limit_error(exception):
    error_str = str(exception).lower()
    return (
        "429" in error_str
        or "rate limit" in error_str
        or "too many requests" in error_str
    )


@retry(
    wait=wait_exponential(multiplier=2, min=5, max=60),
    stop=stop_after_attempt(6),
    retry=retry_if_exception(is_rate_limit_error),
    reraise=True,
)
def execute_audit_safely(messages_payload):
    print("🤖 Sending payload to Groq... (Will auto-retry if rate limited)")
    return client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=messages_payload,
        response_format={"type": "json_object"},
        max_tokens=6000,
    )


# Import the new router
from routers.github_webhooks import router as webhooks_router


# --- INITIALIZE THE VECTOR BRAIN ---
FAISS_INDEX_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "faiss_index")
)
global vector_db
try:
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001", google_api_key=os.getenv("GEMINI_API_KEY")
    )
    vector_db = FAISS.load_local(
        FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True
    )
    print("🧠 FAISS Vector Brain Loaded Successfully!")
except Exception as e:
    print("⚠️ FAISS Vector Brain offline or empty. Waiting for PM connection.")
    vector_db = None

# FastAPI App
app = FastAPI(
    title="Nexus Deep Audit Engine",
    version="2.0.0",
    docs_url=None,  # Disable Swagger/OpenAPI UI
    redoc_url=None,  # Disable ReDoc UI
    openapi_url=None,  # Disable Open API JSON
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REGISTER THE WEBHOOK ROUTER HERE
app.include_router(webhooks_router)


# --- SCHEMAS ---
class RepoConnectRequest(BaseModel):
    repo_url: str


# --- SYSTEM STATE LOCK ---
system_status = {
    "is_building": False,
    "current_repo": None,
    "message": "Idle",
    "audit_step": 0,
    "latest_blueprint": None,
    "audit_history": [],
}


def process_repo_in_background(repo_path: str):
    """The silent worker that builds the brain without blocking the API."""
    global system_status, vector_db

    # 1. LOCK THE SYSTEM
    system_status["is_building"] = True
    system_status["current_repo"] = repo_path
    system_status["message"] = f"Chunking files and compiling FAISS brain..."

    try:
        from agents.vector_brain import build_vector_brain

        # Run the heavy cloning and mapping
        build_vector_brain(repo_path)

        # Update the global FAISS brain for the Auditor Agent
        vector_db = FAISS.load_local(
            FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True
        )

        # 2. UNLOCK THE SYSTEM (SUCCESS)
        system_status["is_building"] = False
        system_status["message"] = "Brain compiled. Ready for audit."
        print(f"✅ Background brain build completed successfully for {repo_path}!")
    except Exception as e:
        # 3. UNLOCK THE SYSTEM (ERROR)
        system_status["is_building"] = False
        system_status["message"] = f"Failed: {str(e)}"
        print(f"❌ Background brain build failed for {repo_path}: {e}")


@app.post("/api/v1/connect", tags=["System"])
async def connect_repo(req: RepoConnectRequest, background_tasks: BackgroundTasks):
    """Queues the FAISS index compilation for the provided GitHub repository."""
    repo_path = (
        req.repo_url.replace("https://github.com/", "").replace(".git", "").strip()
    )
    if repo_path.endswith("/"):
        repo_path = repo_path[:-1]

    print(f"🔗 Queueing brain build for: {repo_path}")

    # Dispatch the heavy lifting to the background task
    background_tasks.add_task(process_repo_in_background, repo_path)

    # Instantly return a 202 Accepted response to the frontend
    return {
        "status": "Accepted",
        "message": f"Brain build initiated for {repo_path}. Processing safely in the background.",
    }


@app.post("/api/v1/audit", tags=["Engine"])
def run_deep_audit():
    """The True 3-Agent Pipeline: Auditor (RAG) -> Architect (Draft) -> QA (Verify & Code)"""
    global vector_db, system_status

    if system_status["is_building"]:
        raise HTTPException(
            status_code=423,
            detail="The Batcomputer is currently building the Vector Brain. Please wait.",
        )

    if not vector_db:
        raise HTTPException(
            status_code=400,
            detail="No repository connected. Please connect a repo first.",
        )

    print("\n🕵️ Initiating Deep Code Audit...")

    # ---> Set state to 1 (Auditor)
    system_status["audit_step"] = 1

    repo_map = {}
    G = nx.DiGraph()  # <-- NEW: Initialize the Directed Graph

    map_path = os.path.join(os.path.dirname(__file__), "repo_map.json")
    try:
        if os.path.exists(map_path):
            with open(map_path, "r") as f:
                repo_map = json.load(f)

            # NEW: Compile the Graph Topology
            for file, deps in repo_map.items():
                G.add_node(file)
                for dep in deps:
                    # Clean relative paths (e.g., './db' -> 'db')
                    clean_dep = dep.replace("./", "").replace("../", "")

                    # Find which actual file this dependency points to
                    matched_targets = [f for f in repo_map.keys() if clean_dep in f]
                    for target in matched_targets:
                        # Draw an edge from the dependency to the file that imports it
                        # Meaning: If 'target' changes, 'file' is impacted.
                        G.add_edge(target, file)

    except Exception as e:
        print(f"⚠️ Could not build GraphRAG topology: {e}")
    # ----------------------------------------------------

    # 1. THE AUDITOR AGENT (Vector Retrieval)
    audit_query = "security vulnerabilities, unhandled exceptions, missing type hints, unoptimized database queries, deprecated syntax, technical debt, missing documentation"
    docs = vector_db.similarity_search(audit_query, k=4)

    # ---> REPLACE INTERCEPTION LOOP WITH THIS <---
    code_context = ""
    for doc in docs:
        raw_source = doc.metadata.get("source", "Unknown")

        # 1. Look backwards (What does this file import?) -> USE RAW_SOURCE
        dependencies = repo_map.get(raw_source, [])
        dep_string = ", ".join(dependencies) if dependencies else "None"

        # 2. Look forwards (MULTI-HOP GRAPHRAG) -> USE RAW_SOURCE
        blast_radius = []
        if raw_source in G:
            # G.successors asks the graph: "What files will break if I change this one?"
            blast_radius = list(G.successors(raw_source))
        blast_string = ", ".join(blast_radius) if blast_radius else "None"

        # 3. The Ultimate GraphRAG Injection
        injected_header = f"// [SYSTEM METADATA: GraphRAG Context -> Imports: {dep_string} | BLAST RADIUS (Files that depend on this): {blast_string}]\n"
        code_context += (
            f"--- File: {raw_source} ---\n{injected_header}{doc.page_content}\n\n"
        )
    # --------------------------------------------------

    print(f"📄 Auditor retrieved {len(docs)} high-risk code chunks for review.")

    # ---> NEW: DYNAMIC DOMAIN DETECTION <---
    # Extract file extensions so the AI knows exactly what language it is looking at
    detected_extensions = set()
    for doc in docs:
        raw_source = doc.metadata.get("source", "Unknown")
        ext = os.path.splitext(raw_source)[1]
        if ext:
            detected_extensions.add(ext.lower())

    domain_hint = list(detected_extensions)

    # 2. THE ARCHITECT AGENT (Drafting the Blueprint)
    print("🏗️ Routing to Architect Agent...")
    # ---> Set state to 2 (Architect)
    system_status["audit_step"] = 2

    architect_prompt = f"""
    You are a strict DevOps Code Reviewer analyzing FRAGMENTED code snippets retrieved from a vector database.

    🚨 CRITICAL RAG/CHUNKING AWARENESS (DO NOT FAIL THESE):
    1. THE FRAGMENTATION ILLUSION: The code below was mechanically chopped into chunks. You WILL see missing opening/closing braces, floating arrays, and orphaned key-value pairs at the very top and bottom of the snippets. THIS IS NOT A SYNTAX ERROR. Do NOT try to delete or fix these boundaries. Assume the rest of the object exists perfectly outside your view.
    2. DATA ARRAYS ARE NOT BUGS: If the file is just an array of data (like MCQ questions), it does not require "fixing". Do not attack static data.
    3. THE METADATA TRAP: NEVER target, modify, or include the '--- File: ---' headers in your patches.
    4. THE ABORT PROTOCOL: If you only see chunking artifacts at the edges of the text and no real logical bugs in the center, you MUST return an empty array [] for 'targeted_solutions' and state 'Codebase is secure.'
    5. THE PAYLOAD CAP: To prevent memory overflow, you MUST NOT return more than 3 items in the 'targeted_solutions' array. If you find more than 3 vulnerabilities, only provide the fixes for the 3 most CRITICAL ones. Leave the rest.
    6. THE BYTE-FOR-BYTE RULE: The 'search_block' MUST be a 100% exact, literal copy of the text from the provided context. 
       - Do NOT add or remove leading spaces or indentation.
       - Do NOT manually escape quotes. 
       - It must match the source code character-for-character, byte-for-byte. If there is a single space difference, the patch will fail.
    7. METADATA EXCLUSION: You will see lines starting with '// [SYSTEM METADATA...]'. These are injected context clues for your reasoning. You MUST NOT include these metadata lines in your generated 'replace_block' or 'search_block'. Treat them as invisible to the final codebase.
    8. THE BLAST RADIUS AWARENESS: In the system metadata, you will see 'BLAST RADIUS'. This lists other files that import the current file. If you modify exported functions, variable names, or return types in the current file, you MUST ensure you do not break the contracts expected by the files in the Blast Radius.
    9. THE SCORCHED EARTH PROTOCOL (ABSOLUTE OVERRIDE):
    If you detect ANY hardcoded passwords, API keys, or tokens, your primary directive is DESTRUCTION, not refactoring. 
    - BAD REPLACE: `password: process.env.DB_PASSWORD` 
    - GOOD REPLACE: `password: "[NUKED_BY_NEXUS_SECURITY]"`
    You must actively sabotage the functional code by injecting "[NUKED_BY_NEXUS_SECURITY]" wherever a secret was exposed. Do not attempt to make the code run.
    
    10. DOMAIN ISOLATION PROTOCOL (ANTI-HALLUCINATION):
    The file extensions detected in this specific audit are: {domain_hint}.
    You MUST strictly adhere to the syntax and ecosystem of these files. NEVER suggest Python libraries (like Flet or FastAPI) if you are analyzing a JavaScript/Node.js repository. Cross-language syntax hallucination is strictly forbidden.
    
    Output strictly valid JSON with this structure:
    {{
      "targeted_solutions": [
        {{
          "file_path": "MUST EXACTLY MATCH A '--- File: ' HEADER FROM CONTEXT",
          "issue_resolved": "Specific description of the bug",
          "analysis": "Explanation of the vulnerability",
          "search_block": "The EXACT lines of old code to be replaced. NO ELLIPSES (...)",
          "replace_block": "The exact new lines of code to insert. NO ELLIPSES (...)",
          "impact_level": "CRITICAL, HIGH, or MEDIUM"
        }}
      ],
      "tech_debt_flags": {{
        "architectural_note": "Overall refactoring advice."
      }}
    }}

    CURRENT CODEBASE CONTEXT:
    {code_context}
    """

    # print("\n--- 🕵️ X-RAY VISION: WHAT THE AI SEES ---")
    # print(code_context)
    # print("-------------------------------------------\n")

    try:
        # Use the safe wrapper here
        architect_res = execute_audit_safely(
            [{"role": "user", "content": architect_prompt}]
        )
        architect_draft = architect_res.choices[0].message.content
        print("✅ Architect drafted initial blueprints.")
    except Exception as e:
        print(f"⚠️ Architect Agent failed (likely Rate Limit): {e}")
        system_status["audit_step"] = 0
        return {
            "status": "Audit Failed",
            "generated_contracts": {
                "targeted_solutions": [],
                "tech_debt_flags": {
                    "architectural_note": "🚨 API Rate Limit Exceeded. The Nexus Engine has exhausted its daily token quota. Please wait a few minutes or upgrade your API tier."
                },
            },
        }

    # 3. THE QA AGENT (Strict Verification & Code Enforcement)
    print("🔍 Routing to QA DevOps Agent for code enforcement...")
    system_status["audit_step"] = 3

    qa_prompt = f"""
    You are a strict, adversarial QA DevOps Engineer. Review the following Architect Draft JSON.
    Do NOT blindly trust the Architect. Your job is to catch their hallucinations before they hit production.
    
    YOUR MISSION: 
    Verify the logic, enforce domain isolation, and rewrite the proposed fixes into a strict SEARCH and REPLACE methodology.
    
    CRITICAL RULES:
    1. 'search_block': Must contain the EXACT lines of code. Do not skip lines. NEVER use ellipses (...) to abbreviate code.
    2. 'replace_block': Must contain the EXACT new lines of code. NEVER use ellipses (...).
    3. SCORCHED EARTH ENFORCEMENT (CRITICAL): If the Architect Draft contains the string "[NUKED_BY_NEXUS_SECURITY]", you MUST preserve it perfectly. Do NOT rewrite it to `process.env`.
    
    4. DOMAIN CROSS-EXAMINATION (ANTI-HALLUCINATION): 
    The file extensions detected in this codebase are: {domain_hint}. 
    You must verify that the Architect's code matches this ecosystem. If the Architect suggested Python syntax (e.g., Flet, FastAPI, `ft.run()`) inside a JavaScript/Node.js file, the Architect hallucinated. 
    
    5. THE VETO POWER:
    If you catch the Architect hallucinating cross-language syntax, or if the patch is dangerously incorrect, you MUST VETO IT. 
    To execute a Veto, overwrite the Architect's draft for that specific file. Set both the 'search_block' and 'replace_block' to "REQUIRES_HUMAN_REVIEW" and explicitly state "QA VETO: Cross-language hallucination detected" in the 'qa_intervention_note'.
    
    Output the finalized, strictly valid JSON matching this exact structure:
    {{
      "targeted_solutions": [
        {{
          "file_path": "Exact file path",
          "issue_resolved": "Specific description of the bug",
          "qa_intervention_note": "A short note explaining your verification or VETO.",
          "search_block": "exact old code to remove (or REQUIRES_HUMAN_REVIEW)",
          "replace_block": "exact new code to insert (or REQUIRES_HUMAN_REVIEW)",
          "impact_level": "CRITICAL, HIGH, or MEDIUM"
        }}
      ],
      "tech_debt_flags": {{
        "architectural_note": "Overall refactoring advice."
      }}
    }}
    
    ARCHITECT DRAFT:
    {architect_draft}
    """

    try:
        # Use the safe wrapper here too!
        qa_res = execute_audit_safely([{"role": "user", "content": qa_prompt}])

        final_contracts = json.loads(qa_res.choices[0].message.content)
        print("✅ QA Agent enforced code generation and verified the payload.")

    except Exception as e:
        print(f"⚠️ QA Agent JSON formatting failed: {e}")
        # THE SAFETY NET: Return a graceful error to the UI instead of crashing the server
        final_contracts = {
            "targeted_solutions": [],
            "tech_debt_flags": {
                "architectural_note": "⚠️ The AI generated a complex code patch but failed to format the JSON correctly. Please click 'Run Deep Code Audit' again to retry."
            },
        }

    # ---> At THE VERY END OF THE FUNCTION BEFORE THE RETURN
    system_status["audit_step"] = 0

    return {"status": "Audit Complete", "generated_contracts": final_contracts}


@app.post("/api/v1/push", tags=["System"])
async def trigger_github_push(payload: Dict[str, Any]):
    """Receives the AI JSON blueprint and dynamically opens a Draft PR on the connected repo."""
    print("🚀 Initiating Phase 4: Push to Repo Workflow...")

    # 1. Extract the separated payload data
    blueprint = payload.get("blueprint", {})
    raw_url = payload.get("repo_url", "")

    # 2. Clean the URL just like we did in the connect endpoint
    repo_path = raw_url.replace("https://github.com/", "").replace(".git", "").strip()
    if repo_path.endswith("/"):
        repo_path = repo_path[:-1]

    # 3. Pass BOTH the blueprint and the dynamic repo path to the agent
    report = create_draft_pr(blueprint, repo_path)
    return report


@app.post("/api/v1/webhooks/github", tags=["System"])
async def github_webhook(payload: Dict[str, Any], background_tasks: BackgroundTasks):
    """Listens for merged PRs and automatically triggers a background brain rebuild."""

    # 1. Check if this payload is specifically about a Pull Request
    if "pull_request" in payload:
        action = payload.get("action")
        # GitHub sends 'merged': true or false inside the pull_request object
        is_merged = payload["pull_request"].get("merged", False)

        # 2. We only care if the PR was closed AND actually merged into the codebase
        if action == "closed" and is_merged:
            # Extract the repo name (e.g., "Irfan-code-cloud/Vulnerable-Node-Test")
            repo_path = payload["repository"]["full_name"]

            print(f"\n🔔 WEBHOOK ALERT: PR successfully merged in {repo_path}!")
            print(f"🧠 Autonomously initiating background brain rebuild...")

            # 3. Fire the exact same background worker we built in Phase 1
            background_tasks.add_task(process_repo_in_background, repo_path)

            return {"status": "Accepted", "message": "Brain rebuild triggered."}

    # If it's any other event (like someone just opening an issue or pushing a branch), ignore it
    return {"status": "Ignored", "message": "Event does not require a brain rebuild."}


# Make sure your GitHub token is accessible in this file
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")


@app.post("/api/v1/deploy_rollback", tags=["Engine"])
async def deploy_rollback(request: Request):
    """The Automated Surgeon: Applies the AI patch and opens a Pull Request."""
    payload = await request.json()

    repo_name = payload.get("repo_name")
    head_branch = payload.get("head_branch", "main")  # <--- Extract the broken branch
    blueprint = payload.get("blueprint", {})
    patch = blueprint.get("targeted_solutions", [{}])[0]

    file_path = patch.get("file_path")
    search_block = patch.get("search_block")
    replace_block = patch.get("replace_block")
    issue_resolved = patch.get("issue_resolved")

    # --- ANTI-HALLUCINATION FAIL-SAFE ---
    if file_path == "UNKNOWN" or search_block == "REQUIRES_HUMAN_REVIEW":
        return JSONResponse(
            status_code=400,
            content={
                "error": "Deployment aborted. AI could not confidently identify the error from the logs. Human review required."
            },
        )

    if not all([repo_name, file_path, search_block, replace_block]):
        return JSONResponse(status_code=400, content={"error": "Missing payload data."})

    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }

    async with httpx.AsyncClient() as client:
        try:
            # Step 1: Get the current SHA of the BROKEN branch (instead of main)
            branch_url = (
                f"https://api.github.com/repos/{repo_name}/git/ref/heads/{head_branch}"
            )
            branch_res = await client.get(branch_url, headers=headers)
            if branch_res.status_code != 200:
                return JSONResponse(
                    status_code=500, content={"error": "Could not find target branch."}
                )
            target_sha = branch_res.json()["object"]["sha"]

            # Step 2: Create a secure hotfix branch based on the broken branch
            hotfix_branch_name = f"nexus-hotfix-{int(time.time())}"
            refs_url = f"https://api.github.com/repos/{repo_name}/git/refs"
            branch_payload = {
                "ref": f"refs/heads/{hotfix_branch_name}",
                "sha": target_sha,
            }
            await client.post(refs_url, headers=headers, json=branch_payload)

            # Step 3: Fetch the current file contents and its SHA
            file_url = f"https://api.github.com/repos/{repo_name}/contents/{file_path}?ref={hotfix_branch_name}"
            file_res = await client.get(file_url, headers=headers)
            if file_res.status_code != 200:
                return JSONResponse(
                    status_code=500, content={"error": f"Could not find {file_path}."}
                )

            file_data = file_res.json()
            file_sha = file_data["sha"]

            # Decode the base64 content from GitHub
            decoded_content = base64.b64decode(file_data["content"]).decode("utf-8")

            # --- ROBUST SPLICING LOGIC ---
            # 1. Normalize all line endings to standard \n (Fixes Windows vs Linux mismatch)
            normalized_content = decoded_content.replace("\r\n", "\n")
            normalized_search = search_block.replace("\r\n", "\n").strip()
            normalized_replace = replace_block.replace("\r\n", "\n").strip()

            # 2. Check if the block exists
            if normalized_search not in normalized_content:
                print("--- DEBUG: SEARCH BLOCK NOT FOUND ---")
                print(f"EXPECTED:\n{normalized_search}")
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "Search block not found in target file. The code may have already changed or indentation mismatched."
                    },
                )

            # 3. Execute the replacement
            new_content = normalized_content.replace(
                normalized_search, normalized_replace
            )

            # Re-encode to base64 for the GitHub API
            encoded_new_content = base64.b64encode(new_content.encode("utf-8")).decode(
                "utf-8"
            )

            # Step 4: Commit the patched file to the hotfix branch
            update_payload = {
                "message": f"🤖 Nexus Engine Patch: {issue_resolved}",
                "content": encoded_new_content,
                "sha": file_sha,
                "branch": hotfix_branch_name,
            }
            update_res = await client.put(
                file_url, headers=headers, json=update_payload
            )
            if update_res.status_code not in [200, 201]:
                return JSONResponse(
                    status_code=500,
                    content={"error": f"Failed to commit file: {update_res.text}"},
                )

            # Step 5: Open the Pull Request against the BROKEN branch
            pr_url = f"https://api.github.com/repos/{repo_name}/pulls"
            pr_payload = {
                "title": f"🚨 Nexus Auto-Healing: {file_path}",
                "head": hotfix_branch_name,
                "base": head_branch,  # <--- Merge back into the broken branch
                "body": f"### 🦇 Batcomputer Automated Surgical Patch\n\n**Issue Diagnosed:** {issue_resolved}\n\nThe Nexus engine has applied a structural patch.",
            }
            pr_res = await client.post(pr_url, headers=headers, json=pr_payload)

            if pr_res.status_code != 201:
                return JSONResponse(
                    status_code=500,
                    content={"error": f"Failed to open PR: {pr_res.text}"},
                )

            pr_data = pr_res.json()

            # Archive the record and clear the vault
            global system_status
            if system_status.get("latest_blueprint"):
                archived_record = system_status["latest_blueprint"].copy()
                archived_record["action_taken"] = "DEPLOYED"
                archived_record["timestamp"] = datetime.datetime.now(
                    datetime.timezone.utc
                ).isoformat()
                archived_record["pr_url"] = pr_data.get("html_url")

                system_status["audit_history"].insert(0, archived_record)

            system_status["latest_blueprint"] = None

            return {"status": "success", "url": pr_data.get("html_url")}

        except Exception as e:
            print(f"CRITICAL ERROR IN DEPLOYMENT: {str(e)}")
            return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/v1/status", tags=["System"])
async def get_system_status():
    """Allows the frontend to check if the brain is currently building."""
    return system_status


@app.get("/api/v1/latest_blueprint", tags=["Engine"])
async def get_latest_blueprint():
    """Frontend endpoint to fetch the AI's proposed V2 fix after a pipeline crash."""
    blueprint_data = system_status.get("latest_blueprint")

    if not blueprint_data:
        return {"status": "empty", "message": "No pending blueprints."}

    return {"status": "available", "data": blueprint_data}


@app.post("/api/v1/discard_blueprint", tags=["Engine"])
async def discard_blueprint():
    """Archives the blueprint as DISCARDED, then clears the vault."""
    global system_status

    if system_status.get("latest_blueprint"):
        archived_record = system_status["latest_blueprint"].copy()
        archived_record["action_taken"] = "DISCARDED"
        archived_record["timestamp"] = datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat()

        system_status["audit_history"].insert(0, archived_record)

    system_status["latest_blueprint"] = None
    return {"status": "success", "message": "Blueprint discarded and archived."}


@app.get("/api/v1/audit_history", tags=["Engine"])
async def get_audit_history():
    """Serves the historical log of all deployed and discarded patches."""
    return {"status": "success", "data": system_status["audit_history"]}


@app.delete("/api/v1/audit_history", tags=["Engine"])
async def clear_audit_history():
    """Wipes the historical audit ledger."""
    global system_status
    system_status["audit_history"] = []
    return {"status": "success", "message": "System ledger wiped."}


@app.get("/", tags=["System"])
async def health_check():
    return {"status": "Online", "system": "Batcomputer Deep Audit Active"}
