import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;

export interface MacosCommandResult {
  stdout: string;
  stderr: string;
  output: string;
}

interface RunMacosCommandOptions {
  allowNonZeroExit?: boolean;
}

export const runMacosCommand = async (
  command: string,
  args: string[] = [],
  options: RunMacosCommandOptions = {}
): Promise<MacosCommandResult> => {
  if (process.platform !== 'darwin') {
    throw new Error('macOS command runner is only available on macOS.');
  }

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER_BYTES
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      output: `${stdout}${stderr ? `\n${stderr}` : ''}`.trim()
    };
  } catch (error) {
    if (!options.allowNonZeroExit) {
      throw error;
    }

    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    const stdout = execError.stdout?.trim() || '';
    const stderr = execError.stderr?.trim() || '';

    return {
      stdout,
      stderr,
      output: `${stdout}${stderr ? `\n${stderr}` : ''}`.trim()
    };
  }
};

export const runMacosTextCommand = async (
  command: string,
  args: string[] = [],
  options: RunMacosCommandOptions = {}
): Promise<string> => {
  const result = await runMacosCommand(command, args, options);
  return result.output;
};
