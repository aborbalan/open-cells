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

import { describe, expect, it } from 'vitest';
import { USAGE, parseArgs } from '../src/cli.js';
import { SERVER_NAME, SERVER_VERSION } from '../src/constants.js';

describe('parseArgs', () => {
  it('asks for nothing when given nothing', () => {
    expect(parseArgs([])).toEqual({ help: false });
  });

  it('reads --project-root as a separate argument', () => {
    expect(parseArgs(['--project-root', 'apps/shop'])).toEqual({
      projectRoot: 'apps/shop',
      help: false,
    });
  });

  it('reads --project-root=value in one argument', () => {
    expect(parseArgs(['--project-root=apps/shop'])).toEqual({
      projectRoot: 'apps/shop',
      help: false,
    });
  });

  it('keeps a value that contains an equals sign', () => {
    expect(parseArgs(['--project-root=C:/a=b/app']).projectRoot).toBe('C:/a=b/app');
  });

  it('accepts both spellings of help', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('ignores flags it does not know, so a client can pass extras', () => {
    expect(parseArgs(['--colour=always', 'positional', '-x'])).toEqual({ help: false });
  });

  it('does not read the value of --project-root as a flag of its own', () => {
    // The value is skipped deliberately: a project called "--help" must not trigger help.
    expect(parseArgs(['--project-root', '--help'])).toEqual({
      projectRoot: '--help',
      help: false,
    });
  });

  it('takes the last --project-root when it is repeated', () => {
    expect(parseArgs(['--project-root', 'first', '--project-root', 'second']).projectRoot).toBe(
      'second',
    );
  });

  it('omits projectRoot rather than setting it undefined, so spreads stay clean', () => {
    expect('projectRoot' in parseArgs([])).toBe(false);
  });

  it('treats a trailing --project-root with no value as absent', () => {
    expect(parseArgs(['--project-root'])).toEqual({ help: false });
  });

  it('treats an empty --project-root= as absent rather than as the empty string', () => {
    expect(parseArgs(['--project-root='])).toEqual({ help: false });
  });

  it('combines help with a project root', () => {
    expect(parseArgs(['--project-root', 'apps/shop', '--help'])).toEqual({
      projectRoot: 'apps/shop',
      help: true,
    });
  });
});

describe('USAGE', () => {
  it('names the server and its version, which is what --help is for', () => {
    expect(USAGE).toContain(SERVER_NAME);
    expect(USAGE).toContain(SERVER_VERSION);
  });

  it('documents every flag parseArgs understands', () => {
    for (const flag of ['--project-root', '-h', '--help']) {
      expect(USAGE).toContain(flag);
    }
  });
});
