import fs from 'fs';
import { spawn } from 'child_process';

const cookieLine = fs.readFileSync('/tmp/cookies.txt', 'utf8')
  .split('\n')
  .find(line => line.includes('next-auth.session-token'));

const sessionToken = cookieLine.split('\t')[6].trim();

const chrome = spawn('google-chrome', [
  '--headless',
  '--remote-debugging-port=9225',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1440,960',
  'about:blank'
]);

await new Promise(r => setTimeout(r, 1500));

const res = await fetch('http://localhost:9225/json/version');
const versionInfo = await res.json();
const ws = new WebSocket(versionInfo.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

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

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const pageWs = new WebSocket(`ws://localhost:9225/devtools/page/${targetId}`);
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

await sendPage('Network.setCookie', {
  name: 'next-auth.session-token',
  value: sessionToken,
  domain: 'localhost',
  path: '/',
  httpOnly: true
});

console.log("Navigating to /settings in Light Mode...");
await sendPage('Page.navigate', { url: 'http://localhost:3100/settings' });
await new Promise(r => setTimeout(r, 3000));

// Ensure light mode (remove dark class)
await sendPage('Runtime.evaluate', {
  expression: `
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
    localStorage.setItem('theme', 'light');

    const inputs = Array.from(document.querySelectorAll('input'));
    const orgInput = inputs.find(i => i.placeholder && i.placeholder.includes('my-org'));
    const mapInput = inputs.find(i => i.placeholder && i.placeholder.includes('mobile-app'));
    const tokenInput = inputs.find(i => i.type === 'password' && i.placeholder && i.placeholder.includes('Sentry'));

    if (orgInput) {
      orgInput.value = 'sentry';
      orgInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (mapInput) {
      mapInput.value = 'easy-hrm:MHRM';
      mapInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (tokenInput) {
      tokenInput.value = 'sntrys_sample_token_••••••••••••';
      tokenInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (orgInput) {
      orgInput.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  `
});

await new Promise(r => setTimeout(r, 1200));

const shotSentryLight = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/data/Workspace/bot jira/public/images/real-web-settings-sentry-light.png', Buffer.from(shotSentryLight.data, 'base64'));
console.log("Captured real Sentry settings card in Light Mode!");

// Navigate to /sentry in Light Mode
console.log("Navigating to /sentry in Light Mode...");
await sendPage('Page.navigate', { url: 'http://localhost:3100/sentry' });
await new Promise(r => setTimeout(r, 3000));

await sendPage('Runtime.evaluate', {
  expression: `
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
    localStorage.setItem('theme', 'light');
  `
});
await new Promise(r => setTimeout(r, 1000));

const shotSentryQueueLight = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/data/Workspace/bot jira/public/images/real-web-sentry-light.png', Buffer.from(shotSentryQueueLight.data, 'base64'));
console.log("Captured real /sentry dashboard in Light Mode!");

chrome.kill();
process.exit(0);
