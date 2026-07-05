# backend/agents/sentiment_agent.py
import os
import json
from groq import Groq
from dotenv import load_dotenv
from instructions import SENTIMENT_AGENT_INSTRUCTIONS

# Load the vault
load_dotenv()

# Initialize the Groq client (it automatically finds GROQ_API_KEY)
client = Groq()


def read_mcp_data():
    """Simulates the MCP Server read since we removed the Google SDK overhead"""
    file_path = os.path.join(
        os.path.dirname(__file__), "..", "mcp", "mock_feedback.json"
    )
    with open(file_path, "r") as file:
        return file.read()


def run_ingestion():
    print("Batman's Batcomputer: Initializing Groq Agent...")

    # 1. Fetch the raw data
    raw_data = read_mcp_data()
    prompt = f"Categorize the following production feedback. Filter out all PII. Output strictly valid JSON.\n\nDATA:\n{raw_data}"

    # 2. Call the Groq API (Using the active Llama 3.1 model)
    print("Routing to Groq Llama 3.1...")
    chat_completion = client.chat.completions.create(
        messages=[
            {"role": "system", "content": SENTIMENT_AGENT_INSTRUCTIONS},
            {"role": "user", "content": prompt},
        ],
        model="llama-3.1-8b-instant",  # <-- UPDATED TO ACTIVE MODEL
        response_format={"type": "json_object"},
    )

    output_text = chat_completion.choices[0].message.content

    print("\n--- Agent Trace Log & Output ---")
    print(output_text)

    # 3. Stage the output locally
    output_path = os.path.join(
        os.path.dirname(__file__), "..", "tests", "staged_sentiment_output.json"
    )
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output_text)

    print(f"\n[Success] Parsed data staged locally at {output_path} for manual review.")


if __name__ == "__main__":
    run_ingestion()
