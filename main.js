const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const localServerPort = 43127;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const assets = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8']
};

let server;
let serverPort;

function startLocalServer() {
    if (serverPort) return Promise.resolve(serverPort);

    return new Promise((resolve, reject) => {
        server = http.createServer((request, response) => {
            const asset = assets[new URL(request.url, 'http://127.0.0.1').pathname];
            if (!asset || !['GET', 'HEAD'].includes(request.method)) {
                response.writeHead(404).end();
                return;
            }

            fs.readFile(path.join(__dirname, asset[0]), (error, content) => {
                if (error) {
                    response.writeHead(500).end();
                    return;
                }
                response.writeHead(200, { 'Content-Type': asset[1] });
                response.end(request.method === 'HEAD' ? undefined : content);
            });
        });
        server.once('error', reject);
        server.listen(localServerPort, '127.0.0.1', () => {
            server.removeListener('error', reject);
            serverPort = localServerPort;
            resolve(serverPort);
        });
    });
}

async function createWindow() {
    const port = await startLocalServer();
    const window = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 1024,
        minHeight: 720,
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    window.loadURL(`http://127.0.0.1:${port}/index.html`);
}

if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.whenReady().then(createWindow);
}

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    if (server) server.close();
});