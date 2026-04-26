import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface GitFileChange {
    path: string;
    indexStatus: string;
    worktreeStatus: string;
    origPath?: string;
}

export interface GitStatus {
    staged: GitFileChange[];
    unstaged: GitFileChange[];
    untracked: string[];
    mergeConflicts: GitFileChange[];
}

export interface GitRemote {
    name: string;
    fetchUrl: string;
    pushUrl: string;
    platform: 'github' | 'gitlab' | 'bitbucket' | 'other';
}

export interface GitSyncStatus {
    ahead: number;
    behind: number;
    branch: string;
    upstream: string | null;
}

export interface GitUser {
    name: string;
    email: string;
}

/**
 * Stateless wrapper around git CLI operations.
 * All methods require a `cwd` (workspace root) parameter.
 */
export class GitService {
    private exec(args: string, cwd: string): string {
        try {
            return cp.execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        } catch (e: any) {
            const stderr = e.stderr?.toString().trim() || e.message;
            throw new Error(stderr);
        }
    }

    isRepo(cwd: string): boolean {
        try {
            this.exec('rev-parse --is-inside-work-tree', cwd);
            return true;
        } catch {
            return false;
        }
    }

    init(cwd: string): void {
        this.exec('init', cwd);
    }

    getUser(cwd: string): GitUser {
        const name = this.safeExec('config user.name', cwd) || 'Not configured';
        const email = this.safeExec('config user.email', cwd) || 'Not configured';
        return { name, email };
    }

    status(cwd: string): GitStatus {
        const raw = this.safeExec('status --porcelain=v2', cwd) || '';
        const staged: GitFileChange[] = [];
        const unstaged: GitFileChange[] = [];
        const untracked: string[] = [];
        const mergeConflicts: GitFileChange[] = [];

        for (const line of raw.split('\n')) {
            if (!line) continue;

            if (line.startsWith('? ')) {
                untracked.push(line.substring(2));
                continue;
            }

            if (line.startsWith('u ')) {
                const parts = line.split(' ');
                const filePath = parts.slice(10).join(' ');
                mergeConflicts.push({ path: filePath, indexStatus: 'U', worktreeStatus: 'U' });
                continue;
            }

            if (line.startsWith('1 ') || line.startsWith('2 ')) {
                const parts = line.split(' ');
                const xy = parts[1];
                const indexStatus = xy[0];
                const worktreeStatus = xy[1];

                let filePath: string;
                let origPath: string | undefined;

                if (line.startsWith('2 ')) {
                    const rest = parts.slice(8).join(' ');
                    const tabIdx = rest.indexOf('\t');
                    if (tabIdx >= 0) {
                        filePath = rest.substring(0, tabIdx);
                        origPath = rest.substring(tabIdx + 1);
                    } else {
                        filePath = rest;
                    }
                } else {
                    filePath = parts.slice(8).join(' ');
                }

                if (indexStatus !== '.') {
                    staged.push({ path: filePath, indexStatus, worktreeStatus: '.', origPath });
                }
                if (worktreeStatus !== '.') {
                    unstaged.push({ path: filePath, indexStatus: '.', worktreeStatus, origPath });
                }
            }
        }

        return { staged, unstaged, untracked, mergeConflicts };
    }

    stage(cwd: string, filePath: string): void {
        this.exec(`add -- "${filePath}"`, cwd);
    }

    stageAll(cwd: string): void {
        this.exec('add -A', cwd);
    }

    unstage(cwd: string, filePath: string): void {
        this.exec(`reset HEAD -- "${filePath}"`, cwd);
    }

    unstageAll(cwd: string): void {
        this.exec('reset HEAD', cwd);
    }

    discard(cwd: string, filePath: string): void {
        this.exec(`checkout -- "${filePath}"`, cwd);
    }

    commit(cwd: string, message: string): string {
        return this.exec(`commit -m "${message.replace(/"/g, '\\"')}"`, cwd);
    }

    push(cwd: string, remote?: string, branch?: string): string {
        const args = ['push'];
        if (remote) args.push(remote);
        if (branch) args.push(branch);
        return this.exec(args.join(' '), cwd);
    }

    pull(cwd: string, remote?: string, branch?: string): string {
        const args = ['pull'];
        if (remote) args.push(remote);
        if (branch) args.push(branch);
        return this.exec(args.join(' '), cwd);
    }

    fetch(cwd: string, remote?: string): string {
        return this.exec(remote ? `fetch ${remote}` : 'fetch --all', cwd);
    }

    currentBranch(cwd: string): string {
        return this.safeExec('branch --show-current', cwd) || 'HEAD (detached)';
    }

    listBranches(cwd: string): { name: string; current: boolean }[] {
        const raw = this.safeExec('branch --list --no-color', cwd) || '';
        return raw.split('\n').filter(Boolean).map(line => ({
            current: line.startsWith('* '),
            name: line.replace(/^\*?\s+/, '').trim()
        }));
    }

    checkout(cwd: string, branch: string): void {
        this.exec(`checkout "${branch}"`, cwd);
    }

    createBranch(cwd: string, name: string, checkout = true): void {
        if (checkout) {
            this.exec(`checkout -b "${name}"`, cwd);
        } else {
            this.exec(`branch "${name}"`, cwd);
        }
    }

    deleteBranch(cwd: string, name: string, force = false): void {
        this.exec(`branch ${force ? '-D' : '-d'} "${name}"`, cwd);
    }

    listRemotes(cwd: string): GitRemote[] {
        const raw = this.safeExec('remote -v', cwd) || '';
        const remoteMap = new Map<string, GitRemote>();

        for (const line of raw.split('\n')) {
            if (!line) continue;
            const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
            if (!match) continue;

            const [, name, url, type] = match;
            if (!remoteMap.has(name)) {
                remoteMap.set(name, { name, fetchUrl: '', pushUrl: '', platform: this.detectPlatform(url) });
            }
            const remote = remoteMap.get(name)!;
            if (type === 'fetch') remote.fetchUrl = url;
            if (type === 'push') remote.pushUrl = url;
        }

        return Array.from(remoteMap.values());
    }

    addRemote(cwd: string, name: string, url: string): void {
        this.exec(`remote add "${name}" "${url}"`, cwd);
    }

    removeRemote(cwd: string, name: string): void {
        this.exec(`remote remove "${name}"`, cwd);
    }

    getSyncStatus(cwd: string): GitSyncStatus {
        const branch = this.currentBranch(cwd);
        const upstream = this.safeExec(`rev-parse --abbrev-ref @{upstream}`, cwd) || null;

        let ahead = 0;
        let behind = 0;

        if (upstream) {
            const counts = this.safeExec('rev-list --left-right --count HEAD...@{upstream}', cwd) || '0\t0';
            const parts = counts.split('\t');
            ahead = parseInt(parts[0], 10) || 0;
            behind = parseInt(parts[1], 10) || 0;
        }

        return { ahead, behind, branch, upstream };
    }

    stash(cwd: string, message?: string): string {
        return this.exec(message ? `stash push -m "${message}"` : 'stash push', cwd);
    }

    stashPop(cwd: string): string {
        return this.exec('stash pop', cwd);
    }

    stashList(cwd: string): string[] {
        const raw = this.safeExec('stash list', cwd) || '';
        return raw.split('\n').filter(Boolean);
    }

    recentLog(cwd: string, count = 10): string {
        return this.safeExec(`log --oneline -n ${count}`, cwd) || '';
    }

    detectPlatform(url: string): 'github' | 'gitlab' | 'bitbucket' | 'other' {
        if (url.includes('github.com')) return 'github';
        if (url.includes('gitlab.com') || url.includes('gitlab')) return 'gitlab';
        if (url.includes('bitbucket.org') || url.includes('bitbucket')) return 'bitbucket';
        return 'other';
    }

    /**
     * Returns the absolute path of a file in the repo for use with vscode.Uri.
     */
    resolveFilePath(cwd: string, filePath: string): string {
        return path.resolve(cwd, filePath);
    }

    private safeExec(args: string, cwd: string): string | null {
        try {
            return this.exec(args, cwd);
        } catch {
            return null;
        }
    }
}
