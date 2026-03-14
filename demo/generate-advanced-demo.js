// Need to require the TypeScript file since the tools module isn't built to CJS right here.
// Actually we can just run this with tsx.
const { scaffoldProject } = require('../mcp-server/src/tools/scaffold.ts');
const fs = require('fs');
const path = require('path');

const result = scaffoldProject({
    framework: 'express',
    db: 'mongodb',
    version: '1.10.10',
    authMode: 'cookies',
    appName: 'awesome-node-auth-advanced-demo',
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
    emailVerificationMode: 'strict',
    enableOAuth: true,
    enableCsrf: true,
    enableCors: true,
    enableAdmin: true,
    enableRbac: true,
    enableSessions: true,
    enableTenants: true,
    enableToolsRouter: true,
    enableApiKeys: true,
});

const outDir = path.join(__dirname, 'advanced-telemetry-webhooks');

// Remove if exists
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const [filePath, content] of Object.entries(result.files)) {
    const fullPath = path.join(outDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
}

console.log('✅ Generated advanced demo in', outDir);
console.log('Instructions:', result.instructions);
