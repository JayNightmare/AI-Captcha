import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { GitService } from './git/gitService';
import { getSidebarHtml } from './sidebarHtml';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'gitcaptcha.sidebarView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private _extensionSecret: string,
        private _gitService: GitService,
        private _getCwd: () => string | undefined,
        private _getGitHubToken: () => Promise<string | undefined>,
        private _fetchSnippets: (diff: string) => Promise<any | undefined>
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = getSidebarHtml();
        webviewView.webview.onDidReceiveMessage(msg => this._handleMessage(msg));
    }

    public refresh() {
        if (this._view) {
            this._view.webview.postMessage({ command: 'fullState', data: this._getFullState() });
        }
    }

    private _getFullState() {
        const cwd = this._getCwd();
        if (!cwd) return { view: 'no-folder' };
        if (!this._gitService.isRepo(cwd)) return { view: 'no-repo' };

        const status = this._gitService.status(cwd);
        const branch = this._gitService.currentBranch(cwd);
        const branches = this._gitService.listBranches(cwd);
        const remotes = this._gitService.listRemotes(cwd);
        const user = this._gitService.getUser(cwd);
        let sync = { ahead: 0, behind: 0, branch, upstream: null as string | null };
        try { sync = this._gitService.getSyncStatus(cwd); } catch {}

        return { view: 'repo', status, branch, branches, remotes, sync, user };
    }

    private async _handleMessage(msg: any) {
        const cwd = this._getCwd();
        const post = (command: string, data?: any) => this._view?.webview.postMessage({ command, ...data });

        try {
            switch (msg.command) {
                case 'getState': this.refresh(); break;

                case 'init':
                    if (cwd) { this._gitService.init(cwd); this.refresh(); }
                    break;

                case 'publishGitHub':
                    vscode.commands.executeCommand('github.publish');
                    break;

                case 'stage':
                    if (cwd) { this._gitService.stage(cwd, msg.file); this.refresh(); }
                    break;

                case 'stageAll':
                    if (cwd) { this._gitService.stageAll(cwd); this.refresh(); }
                    break;

                case 'unstage':
                    if (cwd) { this._gitService.unstage(cwd, msg.file); this.refresh(); }
                    break;

                case 'unstageAll':
                    if (cwd) { this._gitService.unstageAll(cwd); this.refresh(); }
                    break;

                case 'discard': {
                    const ans = await vscode.window.showWarningMessage(
                        `Discard changes to "${msg.file}"? This cannot be undone.`,
                        { modal: true }, 'Discard'
                    );
                    if (ans === 'Discard' && cwd) {
                        this._gitService.discard(cwd, msg.file);
                        this.refresh();
                    }
                    break;
                }

                case 'requestCaptcha':
                    await this._handleCaptchaRequest(msg.commitMessage);
                    break;

                case 'captchaAnswer':
                    await this._handleCaptchaAnswer(msg.choice, msg.realSnippet, msg.commitMessage, msg.diff);
                    break;

                case 'push':
                    if (cwd) { post('info', { message: this._gitService.push(cwd) }); this.refresh(); }
                    break;

                case 'pull':
                    if (cwd) { post('info', { message: this._gitService.pull(cwd) }); this.refresh(); }
                    break;

                case 'fetch':
                    if (cwd) { this._gitService.fetch(cwd); post('info', { message: 'Fetched.' }); this.refresh(); }
                    break;

                case 'checkout':
                    if (cwd) { this._gitService.checkout(cwd, msg.branch); this.refresh(); }
                    break;

                case 'openDiff':
                    if (cwd) this._openDiff(cwd, msg.file);
                    break;
            }
        } catch (e: any) {
            post('error', { message: e.message || String(e) });
        }
    }

    private _openDiff(cwd: string, filePath: string) {
        const fileUri = vscode.Uri.file(this._gitService.resolveFilePath(cwd, filePath));
        const gitUri = fileUri.with({ scheme: 'git', query: JSON.stringify({ path: fileUri.fsPath, ref: 'HEAD' }) });
        vscode.commands.executeCommand('vscode.diff', gitUri, fileUri, `${filePath} (Working Tree)`);
    }

    private async _handleCaptchaRequest(commitMessage: string) {
        const cwd = this._getCwd();
        if (!cwd) return;
        const post = (command: string, data?: any) => this._view?.webview.postMessage({ command, ...data });

        try {
            const diffStr = require('child_process').execSync('git diff --cached', { cwd, encoding: 'utf-8' });
            if (!diffStr) { post('error', { message: 'No staged changes.' }); return; }

            let snippets: any;
            try { snippets = await this._fetchSnippets(diffStr); } catch {}

            if (!snippets) {
                snippets = {
                    real: diffStr.substring(0, 200),
                    fake1: 'console.log("This is not your code");',
                    fake2: 'function placeholder() { return null; }'
                };
            }

            const choices = [snippets.real, snippets.fake1, snippets.fake2].sort(() => Math.random() - 0.5);
            post('captchaChallenge', { choices, realSnippet: snippets.real, diff: diffStr, commitMessage });
        } catch (e: any) {
            post('error', { message: 'CAPTCHA generation failed: ' + e.message });
        }
    }

    private async _handleCaptchaAnswer(choice: string, realSnippet: string, commitMessage: string, diff: string) {
        const cwd = this._getCwd();
        if (!cwd) return;
        const post = (command: string, data?: any) => this._view?.webview.postMessage({ command, ...data });

        const isCorrect = choice === realSnippet;
        let tag: string;
        if (isCorrect) {
            const hash = crypto.createHmac('sha256', this._extensionSecret).update(diff + Date.now()).digest('hex').slice(0, 16);
            tag = `success-${hash}`;
        } else {
            tag = 'fail';
        }

        try {
            this._gitService.commit(cwd, `${commitMessage} [CAPTCHA:${tag}]`);
            post('commitResult', { success: true, captchaPass: isCorrect, message: isCorrect ? 'Committed ✓' : 'Committed with CAPTCHA fail tag.' });
            this.refresh();
        } catch (e: any) {
            post('error', { message: 'Commit failed: ' + e.message });
        }
    }
}
