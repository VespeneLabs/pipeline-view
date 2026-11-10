#!/usr/bin/env node
/**
 * Runs after `changeset version` (see `pnpm version-packages`). Changes to the saved model go into their
 * own "### Model" section at the top of the new CHANGELOG entry, so integrators who store diagrams can
 * see them at a glance.
 *
 * Convention: in a changeset, start a line or paragraph with `Model:` to describe what changed in the
 * saved JSON. Example:
 *
 *   Model: the saved model is now version 2. v1 documents are migrated on load.
 *
 * This script moves every such paragraph from the newest "## x.y.z" section into "### Model"
 * (dropping the prefix). Running it again is a no-op.
 *
 * Usage: node scripts/changelog-model.mjs [CHANGELOG.md ...]   (default: packages/pipeline-view/CHANGELOG.md)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Optional bullet, and the commit hash that @changesets/cli/changelog puts before each summary.
const MODEL = /^(\s*)(?:[-*]\s+(?:[0-9a-f]{7,40}:\s+)?)?Model:\s*(.*)$/;

/** Returns the changelog with the newest version's `Model:` paragraphs gathered into "### Model". */
export function liftModelNotes(changelog) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => /^## /.test(l));
  if (start < 0) return changelog;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;

  const notes = [];
  const kept = [];
  let section = '';
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (/^### /.test(line)) section = line.slice(4).trim();
    const m = section !== 'Model' && MODEL.exec(line);
    if (!m) {
      kept.push(line);
      continue;
    }
    // The paragraph continues on following non-blank lines indented at least as deep, that don't start a new bullet.
    const indent = m[1].length;
    const text = [m[2].trim()];
    while (i + 1 < end) {
      const next = lines[i + 1];
      if (!next.trim() || /^\s*[-*]\s/.test(next) || /^#/.test(next)) break;
      if (next.length - next.trimStart().length < indent) break;
      text.push(next.trim());
      i++;
    }
    notes.push(text.join(' '));
  }
  if (notes.length === 0) return changelog;

  const body = tidy(kept);
  const existing = body.findIndex((l) => l.trim() === '### Model');
  let out;
  if (existing >= 0) {
    // Append to an existing Model section (e.g. written by hand).
    let at = existing + 1;
    while (at < body.length && !/^### /.test(body[at])) at++;
    while (at > existing + 1 && !body[at - 1].trim()) at--;
    out = [...body.slice(0, at), ...notes.map((n) => `- ${n}`), ...body.slice(at)];
  } else {
    out = ['', '### Model', '', ...notes.map((n) => `- ${n}`), ...body];
  }
  return [...lines.slice(0, start + 1), ...tidy(out), ...lines.slice(end)].join('\n');
}

/** Drops "### X" headings left with no entries and collapses runs of blank lines. */
function tidy(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^### /.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length || /^#{2,3} /.test(lines[j])) {
        i = j - 1;
        continue;
      }
    }
    if (!lines[i].trim() && !(out.at(-1) ?? 'x').trim()) continue;
    out.push(lines[i]);
  }
  if (out.length && out.at(-1).trim()) out.push('');
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = process.argv.slice(2);
  if (files.length === 0) files.push(join(root, 'packages/pipeline-view/CHANGELOG.md'));
  for (const file of files) {
    const before = readFileSync(file, 'utf8');
    const after = liftModelNotes(before);
    if (after !== before) {
      writeFileSync(file, after);
      console.log(`${file}: moved Model: notes into "### Model"`);
    }
  }
}
