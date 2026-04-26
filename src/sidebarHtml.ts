/**
 * Returns the full HTML string for the SCM sidebar webview.
 * Contains all CSS and JS inline (required for VS Code webviews).
 */
export function getSidebarHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);overflow-x:hidden}
h3{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-sideBarSectionHeader-foreground);padding:8px 12px 4px;font-weight:700}
.pad{padding:0 12px}
.hidden{display:none!important}

/* Header */
.header{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border,#333)}
.branch-name{font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sync-badge{font-size:11px;opacity:.8}
.platform-icon{width:18px;height:18px;opacity:.7;cursor:pointer;flex-shrink:0}
.platform-icon:hover{opacity:1}

/* Buttons */
.btn{display:block;width:100%;padding:6px 12px;border:none;border-radius:2px;cursor:pointer;font-size:13px;font-family:var(--vscode-font-family);text-align:center}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-primary:hover{background:var(--vscode-button-hoverBackground)}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.btn-sm{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:none;border-radius:2px;cursor:pointer;background:transparent;color:var(--vscode-foreground);font-size:14px;opacity:.6;flex-shrink:0}
.btn-sm:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground,rgba(255,255,255,.1))}

/* Commit area */
.commit-area{padding:8px 12px}
.commit-input{width:100%;padding:6px 8px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);border-radius:2px;font-family:var(--vscode-font-family);font-size:13px;resize:vertical;min-height:56px}
.commit-input:focus{outline:none;border-color:var(--vscode-focusBorder)}
.commit-input::placeholder{color:var(--vscode-input-placeholderForeground)}
.commit-btns{display:flex;gap:4px;margin-top:6px}
.commit-btns .btn{flex:1}

/* Action bar */
.action-bar{display:flex;gap:2px;padding:6px 12px;border-bottom:1px solid var(--vscode-panel-border,#333)}
.action-bar .btn-sm{width:auto;padding:2px 8px;font-size:12px;opacity:.8}

/* File list */
.section-header{display:flex;align-items:center;padding:6px 12px 2px;cursor:pointer;user-select:none}
.section-header h3{padding:0;flex:1}
.section-header .count{font-size:11px;opacity:.6;margin-left:4px}
.section-actions{display:flex;gap:2px;margin-left:auto}
.file-list{list-style:none}
.file-item{display:flex;align-items:center;gap:4px;padding:2px 12px 2px 20px;cursor:pointer;font-size:13px}
.file-item:hover{background:var(--vscode-list-hoverBackground)}
.file-badge{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:3px;font-size:10px;font-weight:700;flex-shrink:0;color:#fff}
.badge-M{background:#e2b93d}.badge-A{background:#73c991}.badge-D{background:#e06c75}.badge-R{background:#61afef}.badge-U{background:#c678dd}
.file-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-actions{display:flex;gap:1px;opacity:0}
.file-item:hover .file-actions{opacity:1}

/* Branch dropdown */
.branch-select{background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);border:1px solid var(--vscode-dropdown-border,transparent);border-radius:2px;padding:2px 4px;font-size:12px;font-family:var(--vscode-font-family);max-width:140px;cursor:pointer}

/* Snippet cards */
.snippet-card{border:1px solid var(--vscode-panel-border,#333);border-radius:4px;padding:8px;margin:4px 12px;cursor:pointer;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:100px;overflow-y:auto;background:var(--vscode-editor-background)}
.snippet-card:hover{border-color:var(--vscode-focusBorder)}
.snippet-card.selected{border-color:var(--vscode-button-background);box-shadow:0 0 0 1px var(--vscode-button-background)}

/* Banners */
.banner{padding:8px 12px;font-size:12px;text-align:center;margin:6px 12px;border-radius:4px}
.banner-ok{background:rgba(50,180,50,.12);color:var(--vscode-terminal-ansiGreen)}
.banner-err{background:rgba(220,50,50,.12);color:var(--vscode-terminal-ansiRed)}
.banner-info{background:rgba(50,120,220,.12);color:var(--vscode-terminal-ansiBlue)}

/* Empty state */
.empty{text-align:center;padding:32px 16px;color:var(--vscode-descriptionForeground)}
.empty p{margin-bottom:12px;line-height:1.5}
.empty .btn{margin-top:8px}

.spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--vscode-foreground);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div id="root"></div>
<script>
const vscode = acquireVsCodeApi();
let S = { view:'loading', status:null, branch:'', branches:[], remotes:[], sync:null, user:null, commitMsg:'', captcha:null, selectedIdx:null, banner:null };

function setState(p){ Object.assign(S,p); render(); }
function esc(s){ return s?s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):''; }
function post(command,data){ vscode.postMessage({command,...data}); }

// Request initial state
post('getState');

window.addEventListener('message', e => {
    const m = e.data;
    switch(m.command){
        case 'fullState': setState({...m.data, captcha:null, selectedIdx:null, banner:null}); break;
        case 'captchaChallenge': setState({captcha:m, selectedIdx:null}); break;
        case 'commitResult': setState({captcha:null, banner:{type:m.captchaPass?'ok':'err', text:m.message}}); break;
        case 'error': setState({captcha:null, banner:{type:'err', text:m.message}}); break;
        case 'info': setState({banner:{type:'info', text:m.message}}); break;
    }
});

function render(){
    const r = document.getElementById('root');
    if(S.view==='loading'){ r.innerHTML='<div class="empty"><span class="spinner"></span></div>'; return; }
    if(S.view==='no-folder'){ r.innerHTML='<div class="empty"><p>Open a folder to use Source Control.</p></div>'; return; }
    if(S.view==='no-repo'){ r.innerHTML=renderNoRepo(); bind(); return; }
    if(S.captcha){ r.innerHTML=renderCaptcha(); bind(); return; }
    r.innerHTML=renderRepo();
    bind();
}

function renderNoRepo(){
    return '<div class="empty">' +
        '<p>The folder doesn\\'t have a Git repository.</p>' +
        '<p>Initialize a repository to enable source control.</p>' +
        '<button class="btn btn-primary" data-act="init">Initialize Repository</button>' +
        '<button class="btn btn-secondary" data-act="publishGitHub" style="margin-top:8px">Publish to GitHub</button>' +
    '</div>';
}

function renderRepo(){
    let html = '';
    // Banner
    if(S.banner) html += '<div class="banner banner-'+S.banner.type+'">'+esc(S.banner.text)+'</div>';

    // Header
    const plat = S.remotes.length>0 ? S.remotes[0].platform : 'other';
    const platIcon = {github:'⊙',gitlab:'◆',bitbucket:'◈',other:'⊕'}[plat]||'⊕';
    const syncTxt = S.sync ? (S.sync.ahead?'↑'+S.sync.ahead:'')+(S.sync.behind?' ↓'+S.sync.behind:'') : '';
    html += '<div class="header">' +
        '<span class="platform-icon" title="'+esc(plat)+'">'+platIcon+'</span>' +
        '<select class="branch-select" data-act="branchSelect">' +
        S.branches.map(b=>'<option value="'+esc(b.name)+'"'+(b.name===S.branch?' selected':'')+'>'+esc(b.name)+'</option>').join('') +
        '</select>' +
        (syncTxt?'<span class="sync-badge">'+syncTxt+'</span>':'') +
    '</div>';

    // Commit area
    html += '<div class="commit-area">' +
        '<textarea class="commit-input" id="commitMsg" placeholder="Message (press Commit to trigger CAPTCHA)">'+esc(S.commitMsg)+'</textarea>' +
        '<div class="commit-btns">' +
        '<button class="btn btn-primary" data-act="commit">Commit</button>' +
        '</div></div>';

    // Action bar
    html += '<div class="action-bar">' +
        '<button class="btn-sm" data-act="push" title="Push">↑ Push</button>' +
        '<button class="btn-sm" data-act="pull" title="Pull">↓ Pull</button>' +
        '<button class="btn-sm" data-act="fetch" title="Fetch">⟳ Fetch</button>' +
        '<button class="btn-sm" data-act="refresh" title="Refresh" style="margin-left:auto">↻</button>' +
    '</div>';

    // Staged
    const st = S.status||{staged:[],unstaged:[],untracked:[],mergeConflicts:[]};
    html += renderFileSection('Staged Changes', st.staged, 'staged');
    html += renderFileSection('Changes', st.unstaged, 'unstaged');
    if(st.untracked.length>0){
        html += '<div class="section-header"><h3>Untracked<span class="count">('+st.untracked.length+')</span></h3>' +
            '<div class="section-actions"><button class="btn-sm" data-act="stageAll" title="Stage All">+</button></div></div>';
        html += '<ul class="file-list">' + st.untracked.map(f =>
            '<li class="file-item" data-file="'+esc(f)+'">' +
            '<span class="file-badge badge-A">?</span>' +
            '<span class="file-name" data-act="openDiff" data-file="'+esc(f)+'">'+esc(f)+'</span>' +
            '<span class="file-actions"><button class="btn-sm" data-act="stage" data-file="'+esc(f)+'" title="Stage">+</button></span>' +
            '</li>'
        ).join('') + '</ul>';
    }

    // User info
    if(S.user) html += '<div style="padding:8px 12px;font-size:11px;opacity:.5;border-top:1px solid var(--vscode-panel-border,#333)">'+esc(S.user.name)+' &lt;'+esc(S.user.email)+'&gt;</div>';

    return html;
}

function renderFileSection(title, files, type){
    if(!files||files.length===0) return '';
    const isStaged = type==='staged';
    let html = '<div class="section-header"><h3>'+title+'<span class="count">('+files.length+')</span></h3>' +
        '<div class="section-actions">';
    if(isStaged) html += '<button class="btn-sm" data-act="unstageAll" title="Unstage All">−</button>';
    else html += '<button class="btn-sm" data-act="stageAll" title="Stage All">+</button>';
    html += '</div></div><ul class="file-list">';
    for(const f of files){
        const badge = f.indexStatus!=='.'?f.indexStatus:f.worktreeStatus;
        html += '<li class="file-item">' +
            '<span class="file-badge badge-'+badge+'">'+badge+'</span>' +
            '<span class="file-name" data-act="openDiff" data-file="'+esc(f.path)+'">'+esc(f.path)+'</span>' +
            '<span class="file-actions">';
        if(isStaged) html += '<button class="btn-sm" data-act="unstage" data-file="'+esc(f.path)+'" title="Unstage">−</button>';
        else{
            html += '<button class="btn-sm" data-act="discard" data-file="'+esc(f.path)+'" title="Discard">✕</button>';
            html += '<button class="btn-sm" data-act="stage" data-file="'+esc(f.path)+'" title="Stage">+</button>';
        }
        html += '</span></li>';
    }
    html += '</ul>';
    return html;
}

function renderCaptcha(){
    const c = S.captcha;
    let html = '<h3 style="padding:12px 12px 4px">Which code is yours?</h3>' +
        '<p class="pad" style="font-size:12px;opacity:.7;margin-bottom:8px">Select the snippet matching your staged changes.</p>';
    c.choices.forEach((code,i)=>{
        html += '<div class="snippet-card'+(S.selectedIdx===i?' selected':'')+'" data-act="selectSnippet" data-idx="'+i+'">'+esc(code)+'</div>';
    });
    html += '<div class="pad" style="margin-top:8px"><button class="btn btn-primary" data-act="confirmCaptcha"'+(S.selectedIdx===null?' disabled':'')+'>This is mine</button>' +
        '<button class="btn btn-secondary" data-act="cancelCaptcha" style="margin-top:6px">Cancel</button></div>';
    return html;
}

function bind(){
    document.querySelectorAll('[data-act]').forEach(el=>{
        const act = el.dataset.act;
        if(act==='branchSelect'){
            el.addEventListener('change', ()=>post('checkout',{branch:el.value}));
        } else if(act==='selectSnippet'){
            el.addEventListener('click', ()=>setState({selectedIdx:parseInt(el.dataset.idx)}));
        } else if(act==='confirmCaptcha'){
            el.addEventListener('click', ()=>{
                if(S.selectedIdx===null) return;
                post('captchaAnswer',{choice:S.captcha.choices[S.selectedIdx],realSnippet:S.captcha.realSnippet,commitMessage:S.captcha.commitMessage,diff:S.captcha.diff});
            });
        } else if(act==='cancelCaptcha'){
            el.addEventListener('click', ()=>setState({captcha:null}));
        } else if(act==='commit'){
            el.addEventListener('click', ()=>{
                const msg = document.getElementById('commitMsg')?.value?.trim();
                if(!msg) return;
                S.commitMsg = msg;
                post('requestCaptcha',{commitMessage:msg});
            });
        } else if(act==='openDiff'){
            el.addEventListener('click', e=>{ e.stopPropagation(); post('openDiff',{file:el.dataset.file}); });
        } else if(['stage','unstage','discard'].includes(act)){
            el.addEventListener('click', e=>{ e.stopPropagation(); post(act,{file:el.dataset.file}); });
        } else if(['init','publishGitHub','stageAll','unstageAll','push','pull','fetch','refresh'].includes(act)){
            el.addEventListener('click', ()=>{ if(act==='refresh') post('getState'); else post(act); });
        }
    });
}

render();
</script>
</body>
</html>`;
}
