/*
 * Copyright 2024 Bilbao Vizcaya Argentaria, S.A.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { API_MODULES, GUIDES } from './reference.js';

/** One hit of a documentation search. */
export interface SearchHit {
  type: 'api' | 'guide';
  /** `core.navigate` for API entries, `guide.routing` for guides. */
  id: string;
  title: string;
  package?: string;
  summary: string;
  /** Fragment of the source text around the match. */
  snippet: string;
  score: number;
}

interface Document {
  type: 'api' | 'guide';
  id: string;
  title: string;
  package?: string;
  summary: string;
  /** Fields weighted highest: names and signatures. */
  keywords: string;
  body: string;
}

function buildCorpus(): Document[] {
  const documents: Document[] = [];

  for (const module of API_MODULES) {
    for (const entry of module.entries) {
      documents.push({
        type: 'api',
        id: `${module.id}.${entry.name}`,
        title: `${entry.name} (${module.package})`,
        package: module.package,
        summary: entry.summary,
        keywords: `${entry.name} ${module.id} ${module.package} ${entry.kind} ${entry.signature}`,
        body: `${entry.signature}\n${entry.summary}\n${entry.example ?? ''}`,
      });
    }
  }

  for (const guide of GUIDES) {
    documents.push({
      type: 'guide',
      id: `guide.${guide.id}`,
      title: guide.title,
      summary: guide.summary,
      keywords: `${guide.id} ${guide.title}`,
      body: guide.content,
    });
  }

  return documents;
}

const CORPUS = buildCorpus();

/** Splits a query into lowercase terms. */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9$_-]+/)
    .filter(term => term.length > 1);
}

/** Number of occurrences of a term in a text. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Extracts a short fragment of the body around the first match. */
function buildSnippet(body: string, term: string | undefined): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  const index = term ? normalized.toLowerCase().indexOf(term) : -1;
  if (index === -1) {
    return normalized.slice(0, 200);
  }
  const start = Math.max(0, index - 80);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, start + 220)}…`;
}

/**
 * Searches the Open Cells documentation. Matches on symbol names and signatures weigh more than
 * matches in prose, so `publish` returns the API entry before the guide that mentions it.
 */
export function searchDocs(query: string, limit = 5): SearchHit[] {
  const terms = tokenize(query);
  if (!terms.length) {
    return [];
  }

  const hits: SearchHit[] = [];

  for (const document of CORPUS) {
    const keywords = document.keywords.toLowerCase();
    const summary = document.summary.toLowerCase();
    const body = document.body.toLowerCase();
    let score = 0;
    let matchedTerms = 0;

    for (const term of terms) {
      const inKeywords = countOccurrences(keywords, term);
      const inSummary = countOccurrences(summary, term);
      const inBody = countOccurrences(body, term);
      const termScore = inKeywords * 10 + inSummary * 3 + inBody;

      if (termScore > 0) {
        matchedTerms += 1;
        score += termScore;
      }
    }

    if (!matchedTerms) {
      continue;
    }

    // Reward documents matching every term of the query.
    score *= matchedTerms / terms.length;

    const firstMatch = terms.find(term => body.includes(term) || summary.includes(term));
    hits.push({
      type: document.type,
      id: document.id,
      title: document.title,
      ...(document.package ? { package: document.package } : {}),
      summary: document.summary,
      snippet: buildSnippet(document.body, firstMatch),
      score: Math.round(score * 100) / 100,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
