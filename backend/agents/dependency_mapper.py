import os
import json
from tree_sitter import Language, Parser
import tree_sitter_javascript as tsjs


class TacticalDependencyMapper:
    def __init__(self, repo_path: str):
        self.repo_path = repo_path
        self.JS_LANGUAGE = Language(tsjs.language())
        self.parser = Parser(self.JS_LANGUAGE)
        self.repo_map = {}

    def extract_imports_from_text(self, code: str, file_path: str) -> list:
        """Parses raw code from memory and extracts imported modules."""
        imports = []
        try:
            tree = self.parser.parse(bytes(code, "utf8"))
            root_node = tree.root_node

            for child in root_node.children:
                if child.type == "import_statement":
                    for node in child.children:
                        if node.type == "string":
                            val = code[node.start_byte : node.end_byte].strip("'\"")
                            imports.append(val)

                elif child.type in ["lexical_declaration", "variable_declaration"]:
                    code_snippet = code[child.start_byte : child.end_byte]
                    if "require(" in code_snippet:
                        try:
                            req_val = (
                                code_snippet.split("require(")[1]
                                .split(")")[0]
                                .strip("'\"` ")
                            )
                            imports.append(req_val)
                        except IndexError:
                            continue
        except Exception as e:
            print(f"⚠️ AST Parser skipped {file_path}: {e}")

        return imports

    def map_from_documents(self, documents: list):
        """Scans in-memory LangChain documents instead of the hard drive."""
        print(f"🗺️ Initiating In-Memory AST Scan for {self.repo_path}...")

        for doc in documents:
            # Get the file path from LangChain's metadata (usually stored as 'source')
            file_path = doc.metadata.get("source", "unknown.js")

            # Only parse JavaScript/TypeScript files
            if (
                file_path.endswith(".js")
                or file_path.endswith(".jsx")
                or file_path.endswith(".ts")
            ):
                # Extract the imports directly from the document's text
                dependencies = self.extract_imports_from_text(
                    doc.page_content, file_path
                )

                # Clean up the file path for the JSON map
                relative_path = file_path.replace("\\", "/")
                # Prevent duplicate chunks from overwriting with partial imports
                if relative_path in self.repo_map:
                    self.repo_map[relative_path].extend(dependencies)
                    # Remove duplicate dependencies
                    self.repo_map[relative_path] = list(
                        set(self.repo_map[relative_path])
                    )
                else:
                    self.repo_map[relative_path] = dependencies

        # Save the blueprint to the backend folder
        output_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "repo_map.json"
        )
        with open(output_path, "w") as f:
            json.dump(self.repo_map, f, indent=4)

        print(f"✅ Repository Map generated with {len(self.repo_map)} files tracked.")
        return self.repo_map
