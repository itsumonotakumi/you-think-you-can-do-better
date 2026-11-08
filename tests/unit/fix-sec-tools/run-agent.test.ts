// run-agent.sh の MODEL 許可リストと PROMPT_FILE の置き場所の制限。
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { tmpdir } from 'node:os';

const script = join(process.cwd(), 'tools', 'dev', 'run-agent.sh');

function run(args: string[]): { status: number | null; stderr: string } {
  const result = spawnSync('bash', [script, ...args], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr ?? '' };
}

describe('run-agent.sh の入力検証', () => {
  it('opencode-go/ 以外の MODEL を拒否する', () => {
    for (const model of ['other/model', '--help', 'opencode-go/', 'opencode-go/a b']) {
      const result = run(['agent-test', 'prompt.md', model]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('MODEL');
    }
  });

  it('リポジトリ外のプロンプトを拒否する', () => {
    for (const prompt of ['/etc/passwd', join(tmpdir(), 'nope.md'), '--help']) {
      const result = run(['agent-test', prompt, 'opencode-go/test-model']);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('PROMPT_FILE');
    }
  });
});
