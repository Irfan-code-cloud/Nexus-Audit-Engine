# backend/agents/validation_agent.py
import httpx
from datetime import datetime, timezone

BASE_URL = "http://127.0.0.1:8000"


def run_integration_tests():
    print("Batman's Batcomputer: Initializing Validation Agent...")
    print("Executing 'Honor System' Integration Tests on auto-generated contracts...\n")

    passed = 0
    failed = 0
    test_logs = []

    def log_test(name, is_success, details):
        nonlocal passed, failed
        if is_success:
            passed += 1
            test_logs.append({"test": name, "status": "✅ PASS", "details": details})
            print(f"  ✅ PASS: {name}")
        else:
            failed += 1
            test_logs.append({"test": name, "status": "❌ FAIL", "details": details})
            print(f"  ❌ FAIL: {name} - {details}")

    try:
        # --- TEST 1: Health Check ---
        res = httpx.get(f"{BASE_URL}/")
        log_test("Core Engine Health", res.status_code == 200, "Server is online.")

        # --- TEST 2: Ingest Issue ---
        mock_issue = {
            "id": "VAL-9999",
            "source": "Validation Agent",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": "Automated Test",
            "severity": "Low",
            "raw_text": "Testing the issue ingestion schema.",
        }
        res = httpx.post(f"{BASE_URL}/api/v1/issues", json=mock_issue)
        log_test(
            "Issue Ingestion Schema",
            res.status_code == 200,
            "Schema accepted and parsed correctly.",
        )

        # --- TEST 3: Checkout Guardrail ---
        valid_checkout = {"stripe_session_token": "tok_mock_123", "product_id": 101}
        res_valid = httpx.post(f"{BASE_URL}/api/v1/checkout", json=valid_checkout)

        invalid_checkout = {"stripe_session_token": "", "product_id": 101}
        res_fail = httpx.post(f"{BASE_URL}/api/v1/checkout", json=invalid_checkout)

        guardrail_passed = res_valid.status_code == 200 and res_fail.status_code == 400
        log_test(
            "Checkout Guardrail (CR-2049)",
            guardrail_passed,
            "Valid checkout succeeded, missing token blocked.",
        )

        # --- TEST 4: Inventory Sync ---
        res = httpx.post(f"{BASE_URL}/api/v2/inventory/sync")
        log_test(
            "Inventory Sync Execution",
            res.status_code == 200,
            "Endpoint executed without timing out.",
        )

    except httpx.ConnectError:
        return {
            "success": False,
            "passed": 0,
            "failed": 1,
            "logs": [
                {
                    "test": "Connection",
                    "status": "❌ CRITICAL",
                    "details": "Could not connect to API Engine.",
                }
            ],
        }

    is_approved = failed == 0
    return {
        "success": is_approved,
        "passed": passed,
        "failed": failed,
        "logs": test_logs,
    }


if __name__ == "__main__":
    run_integration_tests()
