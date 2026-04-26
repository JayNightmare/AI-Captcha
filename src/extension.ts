import * as vscode from 'vscode';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

import * as crypto from 'crypto';
import * as cp from 'child_process';

import { showWebview } from './webview';
import { SidebarProvider } from './sidebarProvider';
import { GitService } from './git/gitService';

let server: net.Server | undefined;
let extensionSecret = '';
const cache = new Map<string, any>();
const gitService = new GitService();

function getCwd(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('AI-Captcha extension is now active');

    extensionSecret = context.globalState.get('secret', crypto.randomBytes(32).toString('hex'));
    context.globalState.update('secret', extensionSecret);

    // --- Sidebar ---
    const sidebarProvider = new SidebarProvider(
        context.extensionUri,
        extensionSecret,
        gitService,
        getCwd,
        getGitHubToken,
        fetchSnippetsFromProxy
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('gitcaptcha.refreshSidebar', () => sidebarProvider.refresh())
    );

    // --- File watcher: auto-refresh sidebar on file changes ---
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    const debouncedRefresh = debounce(() => sidebarProvider.refresh(), 1000);
    watcher.onDidChange(debouncedRefresh);
    watcher.onDidCreate(debouncedRefresh);
    watcher.onDidDelete(debouncedRefresh);
    context.subscriptions.push(watcher);

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => sidebarProvider.refresh()));

    // --- Pre-cache debounce ---
    let debounceTimer: NodeJS.Timeout | undefined;
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            await preCacheDiff();
        }, 2000);
    }));

    // --- Hook fallback ---
    server = net.createServer(handleDiff);
    server.listen(0, () => {
        const address = server?.address();
        const port = typeof address === 'object' ? address?.port : undefined;
        if (port) {
            writeHook(port);
        }
    });

    const disposable = vscode.commands.registerCommand('gitcaptcha.commit', () => {
        vscode.window.showInformationMessage('Git CAPTCHA command executed.');
    });

    context.subscriptions.push(disposable);
}

function debounce(fn: () => void, ms: number) {
    let timer: NodeJS.Timeout | undefined;
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, ms);
    };
}

/**
 * Acquires a GitHub access token using VS Code's built-in GitHub auth provider.
 * Prompts the user to sign in on first use; cached afterwards.
 */
async function getGitHubToken(): Promise<string | undefined> {
    try {
        const session = await vscode.authentication.getSession('github', ['user:email'], { createIfNone: true });
        return session?.accessToken;
    } catch (e) {
        console.error('GitHub authentication failed', e);
        vscode.window.showWarningMessage('Git CAPTCHA: GitHub sign-in is required for CAPTCHA verification.');
        return undefined;
    }
}

/**
 * Sends a diff payload to the proxy backend, authenticated with a GitHub token.
 */
async function fetchSnippetsFromProxy(diffStr: string): Promise<any | undefined> {
    const token = await getGitHubToken();
    if (!token) return undefined;

    const endpointUrl = vscode.workspace.getConfiguration('ai-captcha').get<string>('endpointUrl') || 'https://captcha.endpoint-system.uk/generate';

    const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ diff: diffStr })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Proxy returned ${res.status}: ${errText}`);
    }

    return await res.json() as any;
}

async function preCacheDiff() {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) return;
    const gitAPI = gitExtension.exports.getAPI(1);
    if (!gitAPI.repositories || gitAPI.repositories.length === 0) return;

    const repo = gitAPI.repositories[0];
    try {
        const diffStr = cp.execSync('git diff --cached', { cwd: repo.rootUri.fsPath }).toString();
        if (!diffStr) return;

        const sha = crypto.createHash('sha256').update(diffStr).digest('hex');
        if (cache.has(sha)) return;

        try {
            const content = await fetchSnippetsFromProxy(diffStr);
            if (content && content.real) {
                cache.set(sha, content);
                console.log('Cached snippets for sha', sha);
            }
        } catch (fetchError) {
            console.log('Failed to fetch from proxy. Using dummy snippets.', fetchError);
            cache.set(sha, {
                real: diffStr.substring(0, 50) + '...',
                fake1: 'fake snippet 1',
                fake2: 'fake snippet 2'
            });
        }
    } catch (e) {
        console.error('Pre-cache error', e);
    }
}

async function handleDiff(socket: net.Socket) {
    let data = '';
    socket.on('data', chunk => {
        data += chunk.toString();
    });
    socket.on('end', async () => {
        console.log('Received diff for CAPTCHA');
        const diffStr = data;
        const sha = crypto.createHash('sha256').update(diffStr).digest('hex');

        let snippets = cache.get(sha);
        if (!snippets) {
            try {
                snippets = await fetchSnippetsFromProxy(diffStr);
            } catch (e) {
                console.log('Live fetch failed, using dummy snippets', e);
            }
            if (!snippets) {
                snippets = {
                    real: diffStr.substring(0, 50) + '...',
                    fake1: 'sync fake snippet 1',
                    fake2: 'sync fake snippet 2'
                };
            }
        }

        console.log('Snippets:', snippets);

        showWebview(snippets, socket, diffStr, extensionSecret);
    });
}

function writeHook(port: number) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const gitPath = path.join(workspaceFolders[0].uri.fsPath, '.git', 'hooks');
    if (!fs.existsSync(gitPath)) {
        fs.mkdirSync(gitPath, { recursive: true });
    }

    const hookPath = path.join(gitPath, 'pre-commit');
    const hookContent = `#!/usr/bin/env node
const net = require('net');
const cp = require('child_process');

const port = ${port};
let diff = '';

try {
  diff = cp.execSync('git diff --cached').toString();
} catch (e) {
  process.exit(0);
}

if (!diff) process.exit(0);

const client = net.connect(port, () => client.write(diff));

let tag = 'fail';
client.on('data', d => {
  tag = d.toString();
  client.end();
});

client.on('error', () => {
  // If extension is not running, just exit and allow commit without captcha
  process.exit(0);
});

setTimeout(() => {
  // Always commit after 5 seconds
  // Note: we can't easily amend the current commit inside a pre-commit hook because the commit hasn't happened yet.
  // Wait, the blueprint says: cp.execSync('git commit --amend -m "... [CAPTCHA:tag]"') inside setTimeout.
  // We'll write to a temporary file or let the current commit succeed, but amend later?
  // Let's stick to the blueprint for now, though it's technically a bit tricky since the current commit is blocked.
  // Actually, we can exit 0 right away after writing the tag to a file, or modify the commit message via commit-msg hook.
  // The blueprint uses pre-commit and setTimeout with git commit --amend. We will use that verbatim.
  try {
    const commitMsg = process.env.GIT_COMMIT_MSG || 'commit';
    cp.execSync(\`git commit --amend -m "\${commitMsg} [CAPTCHA:\${tag}]"\`);
  } catch (e) {}
  process.exit(0);
}, 5000);
`;
    fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
}

export function deactivate() {
    if (server) {
        server.close();
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const hookPath = path.join(workspaceFolders[0].uri.fsPath, '.git', 'hooks', 'pre-commit');
    if (fs.existsSync(hookPath)) {
        try {
            fs.unlinkSync(hookPath);
        } catch (e) {
            console.error('Failed to remove hook', e);
        }
    }
}
