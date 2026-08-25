/**
 * Minimal RFC 4180-style CSV reader.
 *
 * Written by hand rather than pulled in as a dependency because the admin importer only
 * needs the core rules: quoted fields, `""` escapes inside quotes, and CRLF/LF/CR line
 * endings. Rows are returned raw — interpreting the header is the caller's job.
 */
export function parseCsv(input: string): string[][] {
  // Strip a UTF-8 BOM so the first header cell doesn't come back as "﻿question".
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++; // treat CRLF as one break
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Flush the final field unless the file ended on a line break.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely blank (trailing newlines, spacer lines).
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

/** Normalises a header cell so `Question Text`, `question_text`, and `questiontext` all match. */
export function normaliseHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
