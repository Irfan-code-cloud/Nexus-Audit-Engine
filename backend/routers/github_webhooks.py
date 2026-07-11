import zipfile
import io
import hmac
import hashlib
import os
import logging
import httpx
import json
import re
from fastapi import APIRouter, Request, HTTPException, Header, BackgroundTasks
from firebase_client import db
from firebase_admin import firestore
from groq import AsyncGroq
from dotenv import load_dotenv

# Force load the vault in this specific router
load_dotenv()

router = APIRouter()

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s // %(levelname)s // %(message)s"
)
logger = logging.getLogger(__name__)

GITHUB_WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

# Add a strict boot check
if not GITHUB_WEBHOOK_SECRET:
    logger.error(
        "SYSTEM HALT: GITHUB_WEBHOOK_SECRET is missing from the environment vault."
    )

# NEW: Initialize the Async Groq client for non-blocking AI inference
ai_client = AsyncGroq()


def verify_github_signature(payload_body: bytes, signature_header: str) -> bool:
    if not signature_header:
        return False
    hash_object = hmac.new(
        GITHUB_WEBHOOK_SECRET.encode("utf-8"),
        msg=payload_body,
        digestmod=hashlib.sha256,
    )
    expected_signature = "sha256=" + hash_object.hexdigest()
    return hmac.compare_digest(expected_signature, signature_header)


def sanitize_runner_logs(logs_text: str, repo_name: str) -> str:
    """
    Strips out GitHub runner directory structures (/home/runner/work/repo/repo/)
    to prevent the LLM from hallucinating absolute environment paths into code patches.
    """
    if not logs_text:
        return ""
    # Extract just the short repo name (e.g., 'broken-pipeline' from 'Irfan-code-cloud/broken-pipeline')
    short_name = repo_name.split("/")[-1]

    # Pattern to match standard GitHub Action workspace runners
    pattern = rf"/home/runner/work/{short_name}/{short_name}/"

    # Replace absolute runner pathing with clean relative path markers
    sanitized = re.sub(pattern, "", logs_text)
    return sanitized


async def execute_rollback_protocol(repo_name: str, pr_number: int):
    """Hits the GitHub API to leave an alert comment and force-close the unstable PR."""

    # --- RUNTIME TOKEN EXTRACTION ---
    runtime_token = os.getenv("GITHUB_TOKEN")
    if not runtime_token:
        logger.error("SYSTEM HALT: GITHUB_TOKEN missing. Cannot execute rollback.")
        return

    headers = {
        "Authorization": f"Bearer {runtime_token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient() as client:
        comment_url = (
            f"https://api.github.com/repos/{repo_name}/issues/{pr_number}/comments"
        )
        comment_payload = {
            "body": "🚨 **NEXUS ENGINE: ROLLBACK PROTOCOL ENGAGED** 🚨\n\nCI/CD Pipeline failure detected on this branch. To maintain structural integrity, the engine has automatically closed this Pull Request. The failure logs are being routed back to the Architect Agent for a revised patch."
        }
        await client.post(comment_url, headers=headers, json=comment_payload)

        pr_url = f"https://api.github.com/repos/{repo_name}/pulls/{pr_number}"
        close_payload = {"state": "closed"}
        response = await client.patch(pr_url, headers=headers, json=close_payload)

        if response.status_code == 200:
            logger.info(f"THREAT NEUTRALIZED: PR #{pr_number} successfully closed.")
        else:
            logger.error(f"FAILED TO CLOSE PR. GitHub API returned: {response.text}")


# NEW: The Learning Loop (Diagnostic Advisory V2)
async def execute_self_healing_loop(
    repo_name: str, pr_number: int, error_logs: str, head_branch: str
):
    """Routes the CI/CD failure logs to the Architect Agent to draft a DevOps Advisory."""
    logger.info(f"🧠 INITIATING DIAGNOSTIC LOOP FOR PR #{pr_number}...")

    # --- THE ANTI-HALLUCINATION SANITIZER ---
    clean_logs = sanitize_runner_logs(error_logs, repo_name)

    v2_prompt = f"""
    You are the Nexus Architect Agent, acting as a Lead DevOps and CI/CD Pipeline Expert. 
    A deployment pipeline or GitHub Action workflow has just failed for {repo_name}.
    
    CRITICAL FAILURE LOGS:
    {clean_logs}
    
    MISSION:
    1. Analyze the pipeline failure logs above.
    2. Determine exactly why the pipeline or deployment failed (e.g., missing dependencies, database connection refused, syntax errors, missing environment variables).
    3. Formulate a precise, highly technical "DevOps Advisory" telling the human engineer exactly what they need to fix manually.
    
    Output valid JSON exactly matching this structure:
    {{
      "pipeline_advisories": [
        {{
          "target_component": "The specific file, configuration, or workflow step that failed",
          "failure_reason": "DEVOPS DIAGNOSIS: Explain the exact root cause from the logs.",
          "recommended_fix": "SOLUTION: Provide explicit, step-by-step instructions. YOU MUST STRICTLY FORMAT THIS USING MARKDOWN. Use single backticks (`file_name`) for files, paths, and variables. Use triple backticks (```yaml ... ``` or ```php ... ```) to display multi-line configuration blocks or code snippets.",
          "impact_level": "CRITICAL"
        }}
      ]
    }}
    """

    try:
        response = await ai_client.chat.completions.create(
            messages=[{"role": "user", "content": v2_prompt}],
            model="openai/gpt-oss-120b",
            response_format={"type": "json_object"},
            max_tokens=3000,
        )

        v2_blueprint = json.loads(response.choices[0].message.content)

        # We grab the first advisory for logging and safety checks
        advisory = v2_blueprint.get("pipeline_advisories", [{}])[0]

        # The Silent Fail Pivot: If the AI returns an empty reason, we abort.
        if not advisory.get("failure_reason"):
            logger.warning(
                "🛑 SILENT FAIL ENGAGED: AI could not diagnose the logs. Suppressing UI modal."
            )
            return

        logger.info(
            f"✅ DEVOPS ADVISORY DRAFTED FOR: {advisory.get('target_component')}"
        )

        # --- VAULT THE ADVISORY (FIRESTORE) ---
        blueprint_payload = {
            "repo_name": repo_name,
            "pr_number": pr_number,
            "head_branch": head_branch,
            "type": "advisory",
            "blueprint": v2_blueprint,
            "status": "pending",
            "timestamp": firestore.SERVER_TIMESTAMP,
        }

        # Write to the 'nexus_state' collection, into a document named 'latest_blueprint'
        db.collection("nexus_state").document("latest_blueprint").set(blueprint_payload)
        logger.info("🔥 Advisory vaulted in FIRESTORE memory. Pushing to UI.")

    except Exception as e:
        logger.error(f"⚠️ Diagnostic Loop failed to parse V2 JSON: {e}")


# Download and extract the raw logs from a failed GitHub Action run
async def fetch_github_action_logs(repo_name: str, run_id: str) -> str:
    """Downloads standard logs, with a dynamic fallback to Check Run Annotations for YAML syntax errors."""

    # --- RUNTIME TOKEN EXTRACTION ---
    runtime_token = os.getenv("GITHUB_TOKEN")
    if not runtime_token:
        logger.error("CRITICAL ERROR: GITHUB_TOKEN is missing at runtime!")
    else:
        logger.info(f"Token loaded successfully. Prefix: {runtime_token[:4]}...")

    headers = {
        "Authorization": f"Bearer {runtime_token}",
        "Accept": "application/vnd.github.v3+json",
    }

    async with httpx.AsyncClient() as client:
        # --- ATTEMPT 1: STANDARD ZIP LOGS ---
        log_url = f"https://api.github.com/repos/{repo_name}/actions/runs/{run_id}/logs"
        response = await client.get(log_url, headers=headers, follow_redirects=True)

        full_logs = ""
        if response.status_code == 200:
            with zipfile.ZipFile(io.BytesIO(response.content)) as z:
                for filename in sorted(z.namelist()):
                    lower_name = filename.lower()
                    if (
                        "post run" in lower_name
                        or "set up" in lower_name
                        or "complete job" in lower_name
                    ):
                        continue
                    if filename.endswith(".txt"):
                        with z.open(filename) as f:
                            log_content = f.read().decode("utf-8")
                            full_logs += f"\n--- STEP: {filename} ---\n"
                            full_logs += log_content[-2000:]

        # --- ATTEMPT 2: THE PHANTOM LOG FALLBACK (ANNOTATIONS API) ---
        # If the zip file was missing or empty, the pipeline aborted before booting.
        if not full_logs.strip():
            logger.warning(
                "Standard logs empty or missing. Falling back to Check Run Annotations API..."
            )

            # First, get the jobs associated with this run
            jobs_url = (
                f"https://api.github.com/repos/{repo_name}/actions/runs/{run_id}/jobs"
            )
            jobs_res = await client.get(jobs_url, headers=headers)

            if jobs_res.status_code == 200:
                jobs_data = jobs_res.json().get("jobs", [])

                # Loop through the jobs and extract their specific annotations
                for job in jobs_data:
                    job_id = job.get("id")
                    annotations_url = f"https://api.github.com/repos/{repo_name}/check-runs/{job_id}/annotations"
                    ann_res = await client.get(annotations_url, headers=headers)

                    if ann_res.status_code == 200:
                        annotations = ann_res.json()
                        for ann in annotations:
                            full_logs += f"\n--- CRITICAL YAML ANNOTATION ERROR in {ann.get('path', 'Unknown')} ---\n"
                            full_logs += f"Message: {ann.get('message', '')}\n"

        if not full_logs.strip():
            return "Could not fetch logs or annotations: Pipeline failed but no trace was left."

        # Return a large chunk to guarantee the AI sees the entire stack trace or annotation
        return full_logs[-8000:]


async def process_diagnostic_workflow(
    repo_name: str, pr_number, run_id: str, head_branch: str
):
    """Background task to handle heavy AI processing without blocking the webhook."""
    logger.info(f"⚙️ BACKGROUND TASK STARTED for {repo_name} PR #{pr_number}")

    # 1. Fetch the logs
    error_logs = await fetch_github_action_logs(repo_name, run_id)
    logger.info(f"LOGS RETRIEVED: {len(error_logs)} characters extracted.")

    # 2. Engage Rollback if a PR exists
    if pr_number:
        await execute_rollback_protocol(repo_name, pr_number)

    # 3. Engage AI Healing Loop (Writes to Firestore)
    await execute_self_healing_loop(
        repo_name, pr_number or "N/A", error_logs, head_branch
    )


@router.post("/api/webhooks/github")
async def github_webhook_interceptor(
    request: Request,
    background_tasks: BackgroundTasks,  # <-- NEW: Inject the background task manager
    x_hub_signature_256: str = Header(None),
    x_github_event: str = Header(None),
):
    payload_body = await request.body()
    if not verify_github_signature(payload_body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid signature")

    payload = await request.json()

    logger.info(f"DEBUG: Received Event: {x_github_event}")

    if x_github_event == "workflow_run":
        action = payload.get("action")
        workflow_run = payload.get("workflow_run", {})

        if action == "completed" and workflow_run.get("conclusion") == "failure":
            repo_name = payload.get("repository", {}).get("full_name")
            run_id = str(workflow_run.get("id"))

            pull_requests = workflow_run.get("pull_requests", [])
            pr_number = pull_requests[0].get("number") if pull_requests else None
            head_branch = workflow_run.get("head_branch", "main")

            # --- THE FIX ---
            # Hand the heavy lifting off to the background task instantly
            background_tasks.add_task(
                process_diagnostic_workflow, repo_name, pr_number, run_id, head_branch
            )

            # Instantly return 200 OK so Google Cloud Run doesn't kill the container!
            return {"status": "Accepted: Processing in background."}

    return {"status": "Event ignored."}
