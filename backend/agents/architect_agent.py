# backend/agents/architect_agent.py
import os
import json
from groq import Groq
from dotenv import load_dotenv

# Load the vault
load_dotenv()

# Initialize the Groq client
client = Groq()

ARCHITECT_INSTRUCTIONS = """
You are the Lead Backend Architect Agent for an enterprise product intelligence engine.
Your job is to ingest categorized production feedback (bugs, feature requests, crashes) and design the exact backend infrastructure needed to resolve them.

For the data provided, you must generate a strictly valid JSON object containing:
1. "fastapi_schemas": Python code containing the Pydantic models needed to support the new features or fix the bugs.
2. "endpoints": A list of FastAPI route signatures (e.g., `@app.post("/api/v1/checkout")`) with brief descriptions of the logic.
3. "tech_debt_flags": A list of architectural warnings. You MUST explicitly flag things like missing database indexes, outdated dependencies, and enforce syntax rules (e.g., remind the team that any internal Flet tooling must transition to using `ft.run` instead of legacy initialization).

Output ONLY valid JSON. No markdown formatting, no conversational text.
"""


def read_staged_sentiment():
    """Reads the output from Sprint 1"""
    file_path = os.path.join(
        os.path.dirname(__file__), "..", "tests", "staged_sentiment_output.json"
    )
    if not os.path.exists(file_path):
        raise FileNotFoundError(
            f"Could not find {file_path}. Run sentiment_agent.py first."
        )
    with open(file_path, "r") as file:
        return file.read()


def run_architect():
    print("Batman's Batcomputer: Initializing Architect Agent...")

    # 1. Fetch the data categorized by the Sentiment Agent
    print("Reading parsed sentiment data...")
    sentiment_data = read_staged_sentiment()

    prompt = f"Design the FastAPI backend contracts to resolve these production issues:\n\n{sentiment_data}"

    # 2. Call the Groq API (Using Llama 3.1 for heavy code generation)
    print("Drafting FastAPI schemas and Tech Debt report...")
    chat_completion = client.chat.completions.create(
        messages=[
            {"role": "system", "content": ARCHITECT_INSTRUCTIONS},
            {"role": "user", "content": prompt},
        ],
        model="llama-3.1-8b-instant",
        response_format={"type": "json_object"},
    )

    output_text = chat_completion.choices[0].message.content

    print("\n--- Architect Trace Log & Generated Contracts ---")
    print(output_text)

    # 3. Stage the output locally for the Validation Agent
    output_path = os.path.join(
        os.path.dirname(__file__), "..", "tests", "staged_architect_output.json"
    )
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output_text)

    print(f"\n[Success] API Contracts staged locally at {output_path}!")


if __name__ == "__main__":
    run_architect()
