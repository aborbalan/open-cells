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

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ProjectError } from '../project.js';

const execFileAsync = promisify(execFile);

/** Application name accepted by `@open-cells/create-app`. */
const APP_NAME_PATTERN = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Templates offered by the scaffolder. */
export const APP_TEMPLATES = {
  blank: 'blankWebapp',
  example: 'exampleWebapp',
} as const;

export type AppTemplate = keyof typeof APP_TEMPLATES;

export interface CreateAppOptions {
  name: string;
  template: AppTemplate;
  /** Existing directory the application folder is created in. */
  destination: string;
  timeoutMs?: number;
}

export interface CreateAppResult {
  appDirectory: string;
  command: string;
  stdout: string;
  nextSteps: string[];
}

/**
 * Runs `@open-cells/create-app` non-interactively. The CLI answers its prompts from the `--type`
 * and `--name` flags, so no TTY is needed. Requires network access to fetch the package.
 */
export async function createApp(options: CreateAppOptions): Promise<CreateAppResult> {
  const { name, template } = options;

  if (!APP_NAME_PATTERN.test(name)) {
    throw new ProjectError(
      `Invalid application name: "${name}".`,
      'Use digits, hyphens and lowercase letters, e.g. "my-app".',
    );
  }

  const destination = path.resolve(options.destination);
  if (!fs.existsSync(destination) || !fs.statSync(destination).isDirectory()) {
    throw new ProjectError(
      `Destination directory not found: ${destination}`,
      'Create the directory first, or point "destination" at an existing one.',
    );
  }

  const appDirectory = path.join(destination, name);
  if (fs.existsSync(appDirectory)) {
    throw new ProjectError(
      `${appDirectory} already exists.`,
      'Choose another name, or remove the existing directory.',
    );
  }

  const args = [
    'exec',
    '--yes',
    '@open-cells/create-app',
    '--',
    '--type',
    APP_TEMPLATES[template],
    '--name',
    name,
  ];
  const command = `npm ${args.join(' ')}`;

  let stdout = '';
  try {
    const result = await execFileAsync('npm', args, {
      cwd: destination,
      timeout: options.timeoutMs ?? 180_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, CI: '1' },
    });
    stdout = result.stdout;
  } catch (error) {
    const details = error as { stdout?: string; stderr?: string; message: string };
    throw new ProjectError(
      `create-app failed: ${details.stderr?.trim() || details.message}`,
      'The scaffolder downloads @open-cells/create-app from npm, so it needs network access. Run it manually with: ' +
        command,
    );
  }

  if (!fs.existsSync(appDirectory)) {
    throw new ProjectError(
      `create-app finished but ${appDirectory} was not created.`,
      `Output was:\n${stdout.trim().slice(-2000)}`,
    );
  }

  return {
    appDirectory,
    command,
    stdout: stdout.trim().slice(-4000),
    nextSteps: [`cd ${appDirectory}`, 'npm install', 'npm run dev'],
  };
}
