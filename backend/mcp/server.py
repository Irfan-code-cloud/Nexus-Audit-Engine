# backend/mcp/server.py
import json
import os
from mcp.server.fastmcp import FastMCP

# Initialize the MCP Server
mcp = FastMCP("FeedbackIngestion")


@mcp.resource("mock://production-feedback")
def get_production_feedback() -> str:
    """
    Securely reads and returns the mock production feedback and crash logs.
    This acts as the ingestion point for the Sentiment Agent.
    """
    # Ensure the path resolves correctly from the backend root
    file_path = os.path.join(os.path.dirname(__file__), "mock_feedback.json")

    try:
        with open(file_path, "r") as file:
            data = json.load(file)
            return json.dumps(data, indent=2)
    except FileNotFoundError:
        return json.dumps(
            {"error": "Mock data file not found. Ensure mock_feedback.json exists."}
        )


if __name__ == "__main__":
    mcp.run()
