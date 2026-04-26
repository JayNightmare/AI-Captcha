import * as vscode from 'vscode';
import * as net from 'net';
import * as crypto from 'crypto';

export function showWebview(snippets: any, socket: net.Socket, diffStr: string, secret: string) {
    const panel = vscode.window.createWebviewPanel(
        'captcha',
        'Pick Your Code',
        vscode.ViewColumn.Active,
        { enableScripts: true }
    );

    panel.webview.html = getHtml(snippets);

    let grace = false;
    panel.onDidChangeViewState(e => {
        if (!e.webviewPanel.active && !grace) {
            setTimeout(() => {
                try {
                    socket.write('fail');
                    socket.end();
                    panel.dispose();
                } catch (e) {
                    console.error('Socket already closed', e);
                }
            }, 1000);
        }
    });

    panel.webview.onDidReceiveMessage(message => {
        grace = true; // prevent unfocus fail while processing
        if (message.command === 'submit') {
            if (message.choice === snippets.real) {
                const hash = crypto.createHmac('sha256', secret).update(diffStr + Date.now()).digest('hex').slice(0, 16);
                socket.write('success-' + hash);
            } else {
                socket.write('fail');
            }
            socket.end();
            setTimeout(() => panel.dispose(), 500);
        }
    });
}

function getHtml(snippets: any) {
    const choices = [snippets.real, snippets.fake1, snippets.fake2].sort(() => Math.random() - 0.5);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CAPTCHA</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
        body { margin: 0; padding: 20px; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); overflow: hidden; height: 100vh; width: 100vw; box-sizing: border-box; }
        .snippet { border: 1px solid var(--vscode-panel-border); padding: 10px; margin: 10px; cursor: pointer; border-radius: 4px; background: var(--vscode-editorWidget-background); max-width: 800px; width: 100%; white-space: pre-wrap; font-family: monospace; overflow-y: auto; max-height: 200px; }
        .snippet:hover { border-color: var(--vscode-focusBorder); }
        .snippet.selected { border-color: var(--vscode-button-background); background: var(--vscode-list-activeSelectionBackground); }
        button { margin-top: 20px; padding: 10px 20px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; border-radius: 2px; font-size: 16px; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const vscode = acquireVsCodeApi();
        function App() {
            const [selected, setSelected] = React.useState(null);
            const choices = \`${JSON.stringify(choices).replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\`;
            const parsedChoices = JSON.parse(choices);
            
            const handleSubmit = () => {
                if (selected !== null) {
                    vscode.postMessage({ command: 'submit', choice: parsedChoices[selected] });
                }
            };
            
            return (
                <div style={{width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                    <h2>Which code is yours?</h2>
                    <p>Select the correct diff snippet you just staged to commit.</p>
                    {parsedChoices.map((code, idx) => (
                        <div 
                            key={idx} 
                            className={'snippet ' + (selected === idx ? 'selected' : '')}
                            onClick={() => setSelected(idx)}
                        >
                            {code}
                        </div>
                    ))}
                    <button onClick={handleSubmit} disabled={selected === null}>This is mine</button>
                </div>
            );
        }
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>`;
}
