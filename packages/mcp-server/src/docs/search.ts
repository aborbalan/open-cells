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
  /** Symbol or guide name, the strongest signal a document can match on. */
  name: string;
  summary: string;
  /** Module, package, kind and signature: what the document _is_. */
  keywords: string;
  /** Prose and examples. */
  body: string;
}

/**
 * Question words and glue that carry no intent. Queries arrive as natural language ("how do I
 * subscribe to a channel from a page"), and without this every document matching "how" or "page"
 * competes with the one that actually answers.
 */
const STOP_WORDS = new Set([
  'a',
  'about',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'do',
  'does',
  'each',
  'for',
  'from',
  'get',
  'has',
  'have',
  'how',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'need',
  'of',
  'on',
  'one',
  'or',
  'should',
  'so',
  'some',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'this',
  'to',
  'use',
  'using',
  'want',
  'was',
  'what',
  'when',
  'where',
  'which',
  'while',
  'why',
  'will',
  'with',
  'you',
  'your',
]);

/** Field weights. A symbol name match is worth far more than the same word buried in prose. */
const NAME_WEIGHT = 12;
const KEYWORDS_WEIGHT = 4;
const SUMMARY_WEIGHT = 3;
const BODY_WEIGHT = 1;

/** Bonus when the whole query names the symbol, e.g. "onPageEnter" or "on page enter". */
const EXACT_NAME_BONUS = 40;

/**
 * Crude singularisation, enough for the vocabulary of this corpus: "channels" and "channel",
 * "params" and "param", "routes" and "route" should be the same term.
 */
function normalizeToken(token: string): string {
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

/** Splits text into comparable terms, breaking camelCase so `onPageEnter` yields `on page enter`. */
function tokenizeText(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9$_]+/)
    .filter(Boolean)
    .map(normalizeToken);
}

/**
 * Terms of a query: tokenized, stripped of stop words. If the query is nothing but stop words the
 * unfiltered tokens are kept, so "what is this" still searches for something.
 */
function tokenizeQuery(query: string): string[] {
  const tokens = tokenizeText(query).filter(token => token.length > 1);
  const meaningful = tokens.filter(token => !STOP_WORDS.has(token));
  return meaningful.length ? meaningful : tokens;
}

/** Collapses a name to comparable characters, so `onPageEnter` === `on page enter`. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function countTokens(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

interface IndexedDocument {
  document: Document;
  nameTokens: Set<string>;
  normalizedName: string;
  keywords: Map<string, number>;
  summary: Map<string, number>;
  body: Map<string, number>;
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
        name: entry.name,
        summary: entry.summary,
        keywords: `${module.id} ${module.package} ${entry.kind} ${entry.signature}`,
        body: `${entry.signature}\n${entry.example ?? ''}`,
      });
    }
  }

  for (const guide of GUIDES) {
    documents.push({
      type: 'guide',
      id: `guide.${guide.id}`,
      title: guide.title,
      name: `${guide.id} ${guide.title}`,
      summary: guide.summary,
      keywords: 'guide',
      body: guide.content,
    });
  }

  return documents;
}

function indexDocument(document: Document): IndexedDocument {
  return {
    document,
    nameTokens: new Set(tokenizeText(document.name)),
    normalizedName: normalizeName(document.name),
    keywords: countTokens(tokenizeText(document.keywords)),
    summary: countTokens(tokenizeText(document.summary)),
    body: countTokens(tokenizeText(document.body)),
  };
}

const INDEX: IndexedDocument[] = buildCorpus().map(indexDocument);

/** How many documents contain each term, for the inverse document frequency weighting. */
const DOCUMENT_FREQUENCY: Map<string, number> = (() => {
  const frequency = new Map<string, number>();

  for (const indexed of INDEX) {
    const terms = new Set([
      ...indexed.nameTokens,
      ...indexed.keywords.keys(),
      ...indexed.summary.keys(),
      ...indexed.body.keys(),
    ]);
    for (const term of terms) {
      frequency.set(term, (frequency.get(term) ?? 0) + 1);
    }
  }

  return frequency;
})();

/**
 * Rare terms decide relevance; common ones barely move the needle. This is what keeps "page" from
 * outvoting "params" in a question that contains both.
 */
function inverseDocumentFrequency(term: string): number {
  const frequency = DOCUMENT_FREQUENCY.get(term) ?? 0;
  return Math.log(INDEX.length / (1 + frequency)) + 1;
}

/** Repeating a word helps, but with diminishing returns, so long documents cannot win by volume. */
function saturate(count: number): number {
  return count > 0 ? 1 + Math.log(count) : 0;
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
 * Searches the Open Cells documentation.
 *
 * Terms are weighted by how rare they are in the corpus and by the field they hit, so a symbol name
 * beats the same word in prose and a distinctive word beats a generic one. That is what makes
 * natural language questions land: "how do I react to route params changing in a page" is decided
 * by `params`, not by `page`.
 */
export function searchDocs(query: string, limit = 5): SearchHit[] {
  const terms = tokenizeQuery(query);
  if (!terms.length) {
    return [];
  }

  const normalizedQuery = normalizeName(query);
  const hits: SearchHit[] = [];

  for (const indexed of INDEX) {
    let score = 0;
    let matchedTerms = 0;

    for (const term of terms) {
      const fieldScore =
        (indexed.nameTokens.has(term) ? NAME_WEIGHT : 0) +
        KEYWORDS_WEIGHT * saturate(indexed.keywords.get(term) ?? 0) +
        SUMMARY_WEIGHT * saturate(indexed.summary.get(term) ?? 0) +
        BODY_WEIGHT * saturate(indexed.body.get(term) ?? 0);

      if (fieldScore > 0) {
        matchedTerms += 1;
        score += fieldScore * inverseDocumentFrequency(term);
      }
    }

    if (!matchedTerms) {
      continue;
    }

    // Asking for a symbol by its exact name should never be ambiguous.
    if (normalizedQuery && normalizedQuery === indexed.normalizedName) {
      score += EXACT_NAME_BONUS * inverseDocumentFrequency(terms[0]!);
    }

    // Documents answering the whole question rank above those matching one word of it.
    score *= matchedTerms / terms.length;

    const { document } = indexed;
    const haystack = `${document.summary}\n${document.body}`.toLowerCase();
    const firstMatch = terms.find(term => haystack.includes(term));

    hits.push({
      type: document.type,
      id: document.id,
      title: document.title,
      ...(document.package ? { package: document.package } : {}),
      summary: document.summary,
      snippet: buildSnippet(`${document.summary}\n${document.body}`, firstMatch),
      score: Math.round(score * 100) / 100,
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}
