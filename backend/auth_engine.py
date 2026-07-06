# backend/auth_engine.py
import os
import time
import jwt
import requests
from dotenv import load_dotenv

load_dotenv()

GITHUB_APP_ID = os.getenv("GITHUB_APP_ID")
# Locate the .pem file in the same directory as this script
PEM_FILE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "batcomputer-private-key.pem")
)


def get_signing_key():
    """
    Fetches the signing key. Checks the environment variable first (Google Cloud),
    then falls back to reading the local .pem file (Local machine).
    """
    # 1. Try to load from Google Cloud Environment Variable
    env_key = os.getenv("GITHUB_PRIVATE_KEY")
    if env_key:
        # Reformat literal '\n' characters back into true structural line breaks if escaped
        return env_key.replace("\\n", "\n").encode("utf-8")

    # 2. Fallback to Local machine file system
    if os.path.exists(PEM_FILE_PATH):
        with open(PEM_FILE_PATH, "rb") as pem_file:
            return pem_file.read()

    raise ValueError(
        "CRITICAL: GITHUB_PRIVATE_KEY environment variable or local .pem file is missing."
    )


def get_dynamic_github_token(repo_path: str):
    """
    Generates a JWT to authenticate as the App, then exchanges it for a
    temporary 1-hour Installation Token for the specific repository.
    """
    print(f"🔐 Negotiating bank-grade security token for {repo_path}...")

    if not GITHUB_APP_ID:
        raise ValueError("Missing GITHUB_APP_ID. Check your vault.")

    # Dynamically resolve the key based on environment context
    try:
        signing_key = get_signing_key()
    except ValueError as e:
        raise ValueError(str(e))

    # SYSTEM CLOCK SKEW FIX: Subtract 60 seconds from the 'iat' (issued at) time
    # This prevents GitHub from dropping the connection if your local clock is slightly fast.
    current_time = int(time.time())
    payload = {
        "iat": current_time - 60,
        "exp": current_time + (10 * 60),  # JWT expires in 10 minutes
        "iss": GITHUB_APP_ID,
    }

    encoded_jwt = jwt.encode(payload, signing_key, algorithm="RS256")

    headers = {
        "Authorization": f"Bearer {encoded_jwt}",
        "Accept": "application/vnd.github.v3+json",
    }

    try:
        # 2. Ask GitHub for the Installation ID (ADDED TIMEOUT)
        repo_url = f"https://api.github.com/repos/{repo_path}/installation"
        repo_res = requests.get(repo_url, headers=headers, timeout=10)

        if repo_res.status_code != 200:
            raise Exception(
                f"❌ GitHub App is not installed on {repo_path}. Status: {repo_res.status_code} - {repo_res.text}"
            )

        installation_id = repo_res.json().get("id")

        # 3. Exchange the Installation ID for a 1-Hour Access Token (ADDED TIMEOUT)
        token_url = (
            f"https://api.github.com/app/installations/{installation_id}/access_tokens"
        )
        token_res = requests.post(token_url, headers=headers, timeout=10)

        if token_res.status_code != 201:
            raise Exception(
                f"❌ Failed to generate the temporary Installation Token: {token_res.text}"
            )

        print("✅ 1-Hour Dynamic Token acquired successfully.")
        return token_res.json().get("token")

    except requests.exceptions.RequestException as e:
        # Gracefully catch network drops (like RemoteDisconnected) so the server doesn't crash
        print(f"⚠️ Network Connection Error during authentication: {e}")
        raise Exception(
            "GitHub Authentication API dropped the connection. Please try again."
        )
