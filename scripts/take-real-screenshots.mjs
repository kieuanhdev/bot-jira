import fs from 'fs';
import { spawn } from 'child_process';

const cookieLine = fs.readFileSync('/tmp/cookies.txt', 'utf8')
  .split('\n')
  .find(line => line.includes('next-auth.session-token'));

if (!cookieLine) {
  console.error("No session cookie found");
  process.exit(1);
}

const sessionToken = cookieLine.split('\t')[6].trim();
console.log("Found session token:", sessionToken.slice(0, 20) + "...");

// Start Chrome headless with remote debugging
const chrome = spawn('google-chrome', [
  '--headless',
  '--remote-debugging-port=9222',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1440,900',
  'about:blank'
]);

await new Promise(r => setTimeout(r, 1500));

// Get websocket debugger URL
const res = await fetch('http://localhost:9222/json/version');
const versionInfo = await res.json();
const wsUrl = versionInfo.webSocketDebuggerUrl;
console.log("Connecting to CDP:", wsUrl);

const ws = new WebSocket(wsUrl);

await new Promise((resolve) => ws.onopen = resolve);

let idCounter = 1;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = idCounter++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// Create new target (page)
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const targetWsUrl = `ws://localhost:9222/devtools/page/${targetId}`;
const pageWs = new WebSocket(targetWsUrl);
await new Promise(r => pageWs.onopen = r);

function sendPage(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = idCounter++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        pageWs.removeEventListener('message', handler);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    pageWs.addEventListener('message', handler);
    pageWs.send(JSON.stringify({ id, method, params }));
  });
}

await sendPage('Page.enable');
await sendPage('Network.enable');

// Set NextAuth cookie
await sendPage('Network.setCookie', {
  name: 'next-auth.session-token',
  value: sessionToken,
  domain: 'localhost',
  path: '/',
  httpOnly: true
});

console.log("Cookie set. Navigating to /settings...");
await sendPage('Page.navigate', { url: 'http://localhost:3100/settings' });
await new Promise(r => setTimeout(r, 3000));

// Take screenshot of settings
const shot1 = await sendPage('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync('/data/Workspace/bot jira/public/images/real-web-settings.png', Buffer.from(shot1.data, 'base64'));
console.log("Saved /settings screenshot: public/images/real-web-settings.png");

// Scroll down to Sentry section if possible and capture focused shot
await sendPage('Runtime.evaluate', {
  expression: `
    const el = Array.from(document.querySelectorAll('label, h3, h4, div')).find(e => e.textContent.includes('Sentry'));
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  `
});
await new Promise(r => setTimeout(r, 1000));
const shotSentry = await sendPage('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync('/data/Workspace/bot jira/public/images/real-web-settings-sentry.png', Buffer.from(shotSentry.data, 'base64'));
console.log("Saved /settings Sentry section screenshot: public/images/real-web-settings-sentry.png");

// Navigate to /sentry
console.log("Navigating to /sentry...");
await sendPage('Page.navigate', { url: 'http://localhost:3100/sentry' });
await new Promise(r => setTimeout(r, 3000));
const shot2 = await sendPage('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync('/data/Workspace/bot jira/public/images/real-web-sentry.png', Buffer.from(shot2.data, 'base64'));
console.log("Saved /sentry screenshot: public/images/real-web-sentry.png");

chrome.kill();
process.exit(0);
