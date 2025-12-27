"""
Context builder for injecting project-aware context into prompts.
Handles README.md, directory tree, and selected source files.
"""
import os
import fnmatch
from pathlib import Path
from typing import List, Optional


class ContextBuilder:
    """Builds project context from files and directory structure."""
    
    def __init__(self, project_root: Optional[str] = None):
        """
        Initialize context builder.
        
        Args:
            project_root: Root directory of the project. If None, uses current working directory.
        """
        if project_root is None:
            project_root = os.getcwd()
        self.project_root = Path(project_root).resolve()
    
    def get_readme(self) -> Optional[str]:
        """Read README.md if it exists."""
        readme_path = self.project_root / "README.md"
        if readme_path.exists():
            try:
                return readme_path.read_text(encoding="utf-8")
            except Exception as e:
                print(f"Warning: Could not read README.md: {e}")
                return None
        return None
    
    def get_directory_tree(self, max_depth: int = 3, ignore_patterns: List[str] = None) -> str:
        """
        Generate a directory tree representation.
        
        Args:
            max_depth: Maximum depth to traverse
            ignore_patterns: List of patterns to ignore (e.g., ["__pycache__", ".git"])
        """
        if ignore_patterns is None:
            ignore_patterns = [
                "__pycache__", ".git", ".venv", "venv", "node_modules",
                ".pytest_cache", ".mypy_cache", ".idea", ".vscode", "dist", "build"
            ]
        
        lines = []
        
        def should_ignore(path: Path) -> bool:
            """Check if path should be ignored."""
            parts = path.parts
            for pattern in ignore_patterns:
                if pattern in parts:
                    return True
            return False
        
        def build_tree(directory: Path, prefix: str = "", depth: int = 0):
            """Recursively build tree structure."""
            if depth > max_depth:
                return
            
            if should_ignore(directory):
                return
            
            try:
                entries = sorted(directory.iterdir(), key=lambda x: (x.is_file(), x.name))
                entries = [e for e in entries if not should_ignore(e)]
                
                for i, entry in enumerate(entries):
                    is_last = i == len(entries) - 1
                    current_prefix = "└── " if is_last else "├── "
                    lines.append(f"{prefix}{current_prefix}{entry.name}")
                    
                    if entry.is_dir() and depth < max_depth:
                        next_prefix = prefix + ("    " if is_last else "│   ")
                        build_tree(entry, next_prefix, depth + 1)
            except PermissionError:
                pass
        
        lines.append(str(self.project_root))
        build_tree(self.project_root)
        return "\n".join(lines)
    
    def is_binary_file(self, file_path: Path) -> bool:
        """
        Check if a file is likely binary based on extension and content.
        
        Args:
            file_path: Path to the file
        
        Returns:
            True if file appears to be binary
        """
        # Common binary file extensions
        binary_extensions = {
            '.pkl', '.pickle', '.parquet', '.h5', '.hdf5', '.npy', '.npz',
            '.bin', '.exe', '.dll', '.so', '.dylib', '.o', '.obj',
            '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
            '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv',
            '.db', '.sqlite', '.sqlite3', '.mdb',
            '.pyc', '.pyo', '.pyd', '.class',
            '.woff', '.woff2', '.ttf', '.eot', '.otf',
            '.jar', '.war', '.ear'
        }
        
        if file_path.suffix.lower() in binary_extensions:
            return True
        
        # Also check by reading first few bytes
        try:
            with open(file_path, 'rb') as f:
                chunk = f.read(512)
                # Check for null bytes or high percentage of non-text characters
                if b'\x00' in chunk:
                    return True
                # Check if more than 30% are non-printable (excluding common whitespace)
                non_printable = sum(1 for b in chunk if b < 32 and b not in (9, 10, 13))
                if len(chunk) > 0 and non_printable / len(chunk) > 0.3:
                    return True
        except Exception:
            pass
        
        return False
    
    def read_file(self, file_path: str) -> Optional[str]:
        """
        Read a file relative to project root.
        Skips binary files automatically.
        
        Args:
            file_path: Path relative to project root
        
        Returns:
            File contents or None if file doesn't exist, is binary, or can't be read
        """
        full_path = self.project_root / file_path
        try:
            # Security: Ensure the path is within project root
            full_path = full_path.resolve()
            if not str(full_path).startswith(str(self.project_root)):
                return None
            
            if not full_path.exists() or not full_path.is_file():
                return None
            
            # Skip binary files
            if self.is_binary_file(full_path):
                return None
            
            # Try to read as text
            return full_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # File is likely binary or has encoding issues
            return None
        except Exception as e:
            # Only log non-binary-related errors
            if 'codec' not in str(e).lower() and 'decode' not in str(e).lower():
                print(f"Warning: Could not read file {file_path}: {e}")
        return None
    
    def get_all_files(self, max_depth: int = 5, ignore_patterns: List[str] = None, text_only: bool = True) -> List[str]:
        """
        Get all files in the project directory.
        
        Args:
            max_depth: Maximum depth to traverse
            ignore_patterns: List of patterns to ignore
            text_only: If True, only include text files (skip binary files)
        
        Returns:
            List of file paths relative to project root
        """
        if ignore_patterns is None:
            ignore_patterns = [
                "__pycache__", ".git", ".venv", "venv", "node_modules",
                ".pytest_cache", ".mypy_cache", ".idea", ".vscode", "dist", "build",
                ".env", ".DS_Store", "*.pyc", "__pycache__", "*.pkl", "*.parquet",
                "*.h5", "*.hdf5", "*.npy", "*.npz", "*.bin", "*.db", "*.sqlite"
            ]
        
        files = []
        
        def should_ignore(path: Path) -> bool:
            """Check if path should be ignored."""
            parts = path.parts
            name = path.name
            for pattern in ignore_patterns:
                if pattern in parts or name.startswith(pattern.replace('*', '')):
                    return True
                if '*' in pattern:
                    if fnmatch.fnmatch(name, pattern):
                        return True
            return False
        
        def scan_directory(directory: Path, depth: int = 0):
            """Recursively scan directory for files."""
            if depth > max_depth:
                return
            
            if should_ignore(directory):
                return
            
            try:
                for entry in directory.iterdir():
                    if should_ignore(entry):
                        continue
                    
                    if entry.is_file():
                        # Skip binary files if text_only is True
                        if text_only and self.is_binary_file(entry):
                            continue
                        
                        try:
                            rel_path = entry.relative_to(self.project_root)
                            files.append(str(rel_path).replace('\\', '/'))
                        except ValueError:
                            pass
                    elif entry.is_dir():
                        scan_directory(entry, depth + 1)
            except PermissionError:
                pass
        
        scan_directory(self.project_root)
        return sorted(files)
    
    def build_context(
        self,
        selected_files: Optional[List[str]] = None,
        include_readme: bool = True,
        include_tree: bool = True,
        include_all_files: bool = False,
        max_file_size: int = 100000  # 100KB default limit
    ) -> str:
        """
        Build complete context string from project files.
        
        Args:
            selected_files: List of file paths relative to project root
            include_readme: Whether to include README.md
            include_tree: Whether to include directory tree
            include_all_files: Whether to include all files in project (ignores selected_files if True)
            max_file_size: Maximum file size to read (in bytes)
        
        Returns:
            Formatted context string
        """
        parts = []
        
        # Add directory tree
        if include_tree:
            tree = self.get_directory_tree()
            parts.append("## Project Structure\n```\n" + tree + "\n```\n")
        
        # Add README
        if include_readme:
            readme = self.get_readme()
            if readme:
                parts.append("## README.md\n```markdown\n" + readme + "\n```\n")
        
        # Add selected files or all files
        files_to_include = selected_files or []
        if include_all_files and not selected_files:
            # Get all files in project (text files only)
            files_to_include = self.get_all_files(text_only=True)
        
        if files_to_include:
            parts.append("## Selected Files\n")
            skipped_binary = []
            for file_path in files_to_include:
                content = self.read_file(file_path)
                if content is None:
                    # Check if it's a binary file
                    full_path = self.project_root / file_path
                    if full_path.exists() and self.is_binary_file(full_path):
                        skipped_binary.append(file_path)
                        continue
                    # Otherwise, file not found or couldn't be read
                    parts.append(f"### {file_path}\n```\n[File not found or could not be read]\n```\n")
                    continue
                
                # Check file size
                full_path = self.project_root / file_path
                if full_path.exists():
                    file_size = full_path.stat().st_size
                    if file_size > max_file_size:
                        parts.append(f"### {file_path}\n```\n[File too large: {file_size} bytes, skipped]\n```\n")
                    else:
                        # Try to detect language for syntax highlighting
                        ext = full_path.suffix.lower()
                        lang_map = {
                            ".py": "python",
                            ".js": "javascript",
                            ".ts": "typescript",
                            ".html": "html",
                            ".css": "css",
                            ".json": "json",
                            ".md": "markdown",
                            ".rs": "rust",
                            ".go": "go",
                            ".java": "java",
                            ".cpp": "cpp",
                            ".c": "c",
                            ".sh": "bash",
                            ".yaml": "yaml",
                            ".yml": "yaml",
                            ".toml": "toml",
                            ".xml": "xml",
                        }
                        lang = lang_map.get(ext, "")
                        lang_prefix = lang + "\n" if lang else ""
                        parts.append(f"### {file_path}\n```{lang_prefix}{content}\n```\n")
            
            # Note about skipped binary files
            if skipped_binary:
                parts.append(f"\n*Note: {len(skipped_binary)} binary file(s) skipped: {', '.join(skipped_binary[:5])}{'...' if len(skipped_binary) > 5 else ''}*\n")
        
        return "\n".join(parts)

