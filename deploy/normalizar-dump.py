#!/usr/bin/env python3
"""Normaliza exports SQL do AdminCentral para a stack self-hosted atual.

O arquivo original nunca é alterado. A saída normalizada é gravada em /tmp
e pode ser reaplicada com segurança pelo reparar.sh.

Correções aplicadas:
  1. `USER-DEFINED` / `ARRAY` (categorias do information_schema) viram tipos reais.
  2. Corpos de função sem o `;` final ganham o terminador.
  3. Colunas GENERATED da versão atual do GoTrue saem dos INSERTs de Auth.
  4. Literais JSON (`[...]`) destinados a colunas text[] viram literais de array.
  5. Grants para papéis internos da origem que não existem na stack são removidos.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SQL_DIR = Path(__file__).resolve().parent / "postgres-stack" / "sql"
SCHEMA_FILE = "020-schema.sql"


# --------------------------------------------------------------------------
# utilidades
# --------------------------------------------------------------------------
def split_sql_values(value_list: str) -> list[str]:
    values: list[str] = []
    start = 0
    depth = 0
    quoted = False
    index = 0
    while index < len(value_list):
        char = value_list[index]
        if char == "'":
            if quoted and index + 1 < len(value_list) and value_list[index + 1] == "'":
                index += 2
                continue
            quoted = not quoted
        elif not quoted:
            if char in "([":
                depth += 1
            elif char in ")]":
                depth -= 1
            elif char == "," and depth == 0:
                values.append(value_list[start:index].strip())
                start = index + 1
        index += 1
    values.append(value_list[start:].strip())
    return values


def find_matching_paren(text: str, open_index: int) -> int:
    """Retorna o índice do ')' que fecha o '(' em open_index (respeita aspas)."""
    depth = 0
    quoted = False
    index = open_index
    while index < len(text):
        char = text[index]
        if char == "'":
            if quoted and index + 1 < len(text) and text[index + 1] == "'":
                index += 2
                continue
            quoted = not quoted
        elif not quoted:
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    return index
        index += 1
    return -1


# --------------------------------------------------------------------------
# 1. tipos do information_schema
# --------------------------------------------------------------------------
def fix_column_types(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        kind = match.group(2)
        replacement = "text[]" if kind == "ARRAY" else "public.app_role"
        return f"{match.group(1)}{replacement}"

    # somente linhas de definição de coluna dentro de CREATE TABLE
    return re.sub(r"(?m)^(\s+[A-Za-z_][\w]*\s+)(ARRAY|USER-DEFINED)\b", replace, text)


# --------------------------------------------------------------------------
# 2. terminador dos corpos de função
# --------------------------------------------------------------------------
def fix_function_terminators(text: str) -> str:
    tag = "$function$"
    out: list[str] = []
    cursor = 0
    inside = False
    while True:
        index = text.find(tag, cursor)
        if index == -1:
            out.append(text[cursor:])
            break
        end = index + len(tag)
        out.append(text[cursor:end])
        if inside:
            # fechamento: garante ';' logo em seguida
            rest = text[end:]
            if not re.match(r"\s*;", rest):
                out.append(";")
        inside = not inside
        cursor = end
    return "".join(out)


# --------------------------------------------------------------------------
# 3. auth.users.confirmed_at
# --------------------------------------------------------------------------
def remove_insert_columns(line: str, table: str, columns_to_remove: set[str]) -> str:
    """Remove colunas incompatíveis de um INSERT preservando a ordem dos valores."""
    prefix = f"INSERT INTO {table} ("
    if not line.startswith(prefix) or ") VALUES (" not in line:
        return line

    columns_end = line.index(") VALUES (")
    columns = [column.strip() for column in line[len(prefix):columns_end].split(",")]
    remove_indexes = [
        index for index, column in enumerate(columns) if column in columns_to_remove
    ]
    if not remove_indexes:
        return line

    values_start = columns_end + len(") VALUES (")
    suffix_marker = ") ON CONFLICT"
    values_end = line.rfind(suffix_marker)
    if values_end < values_start:
        return line

    values = split_sql_values(line[values_start:values_end])
    if len(values) != len(columns):
        raise ValueError(
            f"{table} possui {len(columns)} colunas e {len(values)} valores"
        )

    for generated_index in reversed(remove_indexes):
        del columns[generated_index]
        del values[generated_index]
    return (
        prefix
        + ", ".join(columns)
        + ") VALUES ("
        + ", ".join(values)
        + line[values_end:]
    )


# --------------------------------------------------------------------------
# 4. literais JSON em colunas text[]
# --------------------------------------------------------------------------
def load_array_columns(schema_path: Path) -> dict[str, set[str]]:
    """Mapeia tabela -> colunas declaradas como ARRAY/text[] no dump de schema."""
    mapping: dict[str, set[str]] = {}
    if not schema_path.exists():
        return mapping
    table: str | None = None
    for line in schema_path.read_text(encoding="utf-8").splitlines():
        create = re.match(r"\s*CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)", line)
        if create:
            table = create.group(1)
            continue
        if line.startswith(");"):
            table = None
            continue
        if table:
            column = re.match(r"\s+(\w+)\s+(ARRAY|text\[\])\b", line)
            if column:
                mapping.setdefault(table, set()).add(column.group(1))
    return mapping


def json_to_pg_array(literal: str) -> str | None:
    """Converte strings JSON normais/E-string em ARRAY[...]::text[]."""
    is_escape_string = literal.startswith("E'")
    quote_start = 1 if is_escape_string else 0
    if len(literal) < 2 or literal[quote_start] != "'" or literal[-1] != "'":
        return None
    inner = literal[quote_start + 1:-1].replace("''", "'")
    if is_escape_string:
        inner = inner.replace("\\\\", "\\")
    stripped = inner.strip()
    if not stripped.startswith("[") or not stripped.endswith("]"):
        return None
    try:
        parsed = json.loads(stripped)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(parsed, list):
        return None
    elements: list[str] = []
    for item in parsed:
        if item is None:
            elements.append("NULL")
            continue
        if isinstance(item, (dict, list)):
            return None  # array multidimensional/objeto: não converte
        as_text = item if isinstance(item, str) else json.dumps(item)
        elements.append("'" + as_text.replace("'", "''") + "'")
    return "ARRAY[" + ",".join(elements) + "]::text[]"


def fix_array_values(text: str, array_columns: dict[str, set[str]]) -> str:
    if not array_columns:
        return text

    pattern = re.compile(r"INSERT INTO public\.(\w+)\s*\(")
    out: list[str] = []
    cursor = 0
    while True:
        match = pattern.search(text, cursor)
        if not match:
            out.append(text[cursor:])
            break
        table = match.group(1)
        columns_open = match.end() - 1
        columns_close = find_matching_paren(text, columns_open)
        targets = array_columns.get(table)
        if columns_close == -1 or not targets:
            out.append(text[cursor:match.end()])
            cursor = match.end()
            continue

        values_match = re.match(r"\s*VALUES\s*\(", text[columns_close + 1:])
        if not values_match:
            out.append(text[cursor:match.end()])
            cursor = match.end()
            continue

        values_open = columns_close + 1 + values_match.end() - 1
        values_close = find_matching_paren(text, values_open)
        if values_close == -1:
            out.append(text[cursor:match.end()])
            cursor = match.end()
            continue

        columns = [c.strip() for c in text[columns_open + 1:columns_close].split(",")]
        values = split_sql_values(text[values_open + 1:values_close])
        if len(columns) != len(values):
            out.append(text[cursor:values_close + 1])
            cursor = values_close + 1
            continue

        changed = False
        for index, column in enumerate(columns):
            if column in targets:
                converted = json_to_pg_array(values[index])
                if converted is not None:
                    values[index] = converted
                    changed = True

        out.append(text[cursor:values_open + 1])
        out.append(", ".join(values) if changed else text[values_open + 1:values_close])
        cursor = values_close
    return "".join(out)


# --------------------------------------------------------------------------
# 5. cron deve chamar a stack local, nunca o backend antigo
# --------------------------------------------------------------------------
def fix_cron_urls(text: str, source_name: str) -> str:
    if source_name != "090-cron.sql":
        return text
    return re.sub(
        r"https://[a-z0-9-]+\.supabase\.co/functions/v1/",
        "http://gateway:8000/functions/v1/",
        text,
    )


# --------------------------------------------------------------------------
# 6. papéis internos exclusivos da infraestrutura de origem
# --------------------------------------------------------------------------
def remove_source_only_role_grants(text: str) -> str:
    """Remove GRANTs para papéis internos que não pertencem à stack própria."""
    return re.sub(
        r"(?mi)^\s*GRANT\s+.+?\s+TO\s+sandbox_exec\s*;\s*$\n?",
        "",
        text,
    )


# --------------------------------------------------------------------------
def normalize(source: Path, destination: Path) -> None:
    text = source.read_text(encoding="utf-8")
    text = fix_column_types(text)
    text = fix_function_terminators(text)

    schema_path = source.parent / SCHEMA_FILE
    if not schema_path.exists():
        schema_path = SQL_DIR / SCHEMA_FILE
    text = fix_array_values(text, load_array_columns(schema_path))
    text = fix_cron_urls(text, source.name)
    text = remove_source_only_role_grants(text)

    lines: list[str] = []
    for line in text.splitlines():
        line = remove_insert_columns(line, "auth.users", {"confirmed_at"})
        line = remove_insert_columns(line, "auth.identities", {"email"})
        lines.append(line)
    destination.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    if len(sys.argv) != 3:
        print("uso: normalizar-dump.py ORIGEM DESTINO", file=sys.stderr)
        return 2
    try:
        normalize(Path(sys.argv[1]), Path(sys.argv[2]))
    except (OSError, ValueError) as error:
        print(f"falha ao normalizar dump: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
