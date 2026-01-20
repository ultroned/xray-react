import { exec } from 'child_process';
import { platform } from 'process';
import fs from 'fs';
import os from 'os';

/**
 * Finds the full path to a command by checking common locations
 * @param {string} cmd - Command name (e.g., 'subl', 'code')
 * @returns {string|null} Full path to command or null if not found
 */
function findCommandPath(cmd) {
  const commonPaths = [
    `/usr/local/bin/${cmd}`,
    `/opt/homebrew/bin/${cmd}`,
    `/Applications/Sublime Text.app/Contents/SharedSupport/bin/${cmd}`,
    `/Applications/Sublime Text 2.app/Contents/SharedSupport/bin/${cmd}`,
    `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/${cmd}`,
    `/Applications/Cursor.app/Contents/Resources/app/bin/${cmd}`,
    `${os.homedir()}/.local/bin/${cmd}`,
    `/usr/bin/${cmd}`,
  ];

  for (const testPath of commonPaths) {
    try {
      if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
        return testPath;
      }
    } catch {
      // Continue checking
    }
  }

  return null;
}

/**
 * Detects and returns the command to open files in the user's preferred editor
 * @returns {string} Command to execute for opening files
 */
export function getEditorCommand() {
  const { XRAY_REACT_EDITOR } = process.env;

  if (XRAY_REACT_EDITOR) {
    if (!XRAY_REACT_EDITOR.includes('/') && !XRAY_REACT_EDITOR.includes('\\')) {
      const fullPath = findCommandPath(XRAY_REACT_EDITOR);
      if (fullPath) {
        return fullPath;
      }
    }
    return XRAY_REACT_EDITOR;
  }

  const commonEditors = ['subl', 'code', 'cursor', 'webstorm'];
  if (platform === 'darwin') {
    const macEditors = [...commonEditors, 'mate'];
    for (const editor of macEditors) {
      const fullPath = findCommandPath(editor);
      if (fullPath) return fullPath;
    }
  } else {
    for (const editor of commonEditors) {
      const fullPath = findCommandPath(editor);
      if (fullPath) return fullPath;
    }
  }

  switch (platform) {
    case 'darwin':
      return 'open';
    case 'win32':
      return 'start';
    default:
      return 'xdg-open';
  }
}

/**
 * Opens a file in the user's preferred editor
 * @param {string} filepath - Path to the file to open
 * @param {string} editorCmd - Optional editor command (defaults to detected editor)
 */
export function openFile(filepath, editorCmd = null) {
  const cmd = editorCmd || getEditorCommand();

  let command;
  if (cmd === 'open' && platform === 'darwin') {
    command = `open "${filepath}"`;
  } else if (cmd === 'start' && platform === 'win32') {
    command = `start "" "${filepath}"`;
  } else if (
    cmd.includes('code') ||
    cmd.includes('cursor') ||
    cmd.includes('webstorm') ||
    cmd.includes('subl')
  ) {
    command = `"${cmd}" "${filepath}"`;
  } else {
    command = `"${cmd}" "${filepath}"`;
  }

  const shell = platform === 'win32' ? 'cmd.exe' : '/bin/bash';
  const env = {
    ...process.env,
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin',
  };

  exec(command, { shell: shell, env: env }, (error, stdout, stderr) => {
    if (error) {
      console.error(`xray-react: Failed to open file in editor: ${error.message}`);
      console.error(`xray-react: Command: ${command}`);
      if (stderr) console.error(`xray-react: Stderr: ${stderr}`);
    }
  });
}
