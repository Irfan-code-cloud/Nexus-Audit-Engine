import firebase_admin
from firebase_admin import credentials, firestore
import os
import json
import logging

logger = logging.getLogger(__name__)

if not firebase_admin._apps:
    try:
        # 1. Local Fallback: Look for the file on your machine
        key_path = os.path.join(os.path.dirname(__file__), "firebase-key.json")

        if os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
            logger.info("🔥 Firebase initialized via local firebase-key.json")
        else:
            # 2. Production Cloud: Read the raw JSON string from environment variables
            firebase_json_str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
            if firebase_json_str:
                cred_dict = json.loads(firebase_json_str)
                cred = credentials.Certificate(cred_dict)
                logger.info("🔥 Firebase initialized via Cloud Environment Variable")
            else:
                raise ValueError(
                    "No Firebase credentials found in local files or environment variables."
                )

        firebase_admin.initialize_app(cred)
    except Exception as e:
        logger.error(f"❌ Failed to initialize Firebase: {e}")

db = firestore.client()
