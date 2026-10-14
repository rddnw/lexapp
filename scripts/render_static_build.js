const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const frontendUrl = process.env.LEX_API_BASE_URL;

if (!frontendUrl) {
    throw new Error('LEX_API_BASE_URL must be set to the deployed LEX backend URL.');
}

const apiUrl = new URL(
    frontendUrl.startsWith('http://') || frontendUrl.startsWith('https://')
        ? frontendUrl
        : `https://${frontendUrl}`
);

if (apiUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(apiUrl.hostname)) {
    throw new Error('The deployed LEX backend URL must use HTTPS.');
}

apiUrl.pathname = apiUrl.pathname.replace(/\/+$/, '');
apiUrl.search = '';
apiUrl.hash = '';
const apiBaseUrl = apiUrl.toString().replace(/\/$/, '');

fs.mkdirSync(output, { recursive: true });
for (const page of [
    'index.html',
    'dashboard.html',
    'lawyer-dashboard.html',
    'lawyer-registration.html',
    'admin.html',
]) {
    fs.copyFileSync(path.join(root, page), path.join(output, page));
}
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
fs.writeFileSync(
    path.join(output, 'assets', 'js', 'config.js'),
    `window.LEX_CONFIG = Object.freeze({\n    apiBaseUrl: ${JSON.stringify(apiBaseUrl)}\n});\n`
);
