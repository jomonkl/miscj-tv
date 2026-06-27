/* AeroTV - Node.js Server & CORS Proxy */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 3000;
const PUBLIC_DIR = __dirname;

// Content type map for static serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Recursive CORS proxy request handler (follows up to 5 redirects)
function handleProxy(targetUrlStr, req, res, redirectCount = 0) {
  if (redirectCount > 5) {
    res.writeHead(502, { 
      'Content-Type': 'text/plain', 
      'Access-Control-Allow-Origin': '*' 
    });
    return res.end('Bad Gateway: Too many redirects');
  }

  try {
    const targetUrl = new URL(targetUrlStr);
    const clientModule = targetUrl.protocol === 'https:' ? https : http;

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    if (req.headers['range']) {
      requestHeaders['range'] = req.headers['range'];
    }

    const proxyReq = clientModule.request(targetUrl, {
      method: 'GET',
      headers: requestHeaders
    }, (proxyRes) => {
      // Check for redirect responses
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
        let redirectUrl = proxyRes.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, targetUrl.href).href;
        }
        console.log(`[Proxy Redirect ${redirectCount + 1}] to: ${redirectUrl}`);
        return handleProxy(redirectUrl, req, res, redirectCount + 1);
      }

      // Check if this response is an HLS playlist manifest (.m3u8)
      const isM3U8 = targetUrl.pathname.endsWith('.m3u8') || 
                     (proxyRes.headers['content-type'] && 
                      (proxyRes.headers['content-type'].includes('mpegurl') || 
                       proxyRes.headers['content-type'].includes('mpegURL')));

      if (isM3U8) {
        let body = '';
        proxyRes.on('data', (chunk) => {
          body += chunk.toString('utf8');
        });

        proxyRes.on('end', () => {
          const lines = body.split(/\r?\n/);
          const rewrittenLines = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed.length === 0) return line;

            // Comment lines
            if (trimmed.startsWith('#')) {
              // Parse URI elements inside keys or stream media info and proxy them
              if (trimmed.includes('URI=')) {
                return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
                  let absoluteKeyUrl = p1;
                  if (!absoluteKeyUrl.startsWith('http')) {
                    absoluteKeyUrl = new URL(absoluteKeyUrl, targetUrl.href).href;
                  }
                  const proxiedKeyUrl = `http://${req.headers.host}/proxy?url=${encodeURIComponent(absoluteKeyUrl)}`;
                  return `URI="${proxiedKeyUrl}"`;
                });
              }
              return line;
            }

            // URL lines (playlists or segments)
            let absoluteUrl = trimmed;
            if (!absoluteUrl.startsWith('http')) {
              absoluteUrl = new URL(absoluteUrl, targetUrl.href).href;
            }
            return `http://${req.headers.host}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
          });

          const rewrittenBody = rewrittenLines.join('\n');

          // Copy headers (excluding headers that conflict with CORS or length adjustments)
          const resHeaders = {};
          Object.keys(proxyRes.headers).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (!['content-security-policy', 'x-frame-options', 'access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'content-length'].includes(lowerKey)) {
              resHeaders[key] = proxyRes.headers[key];
            }
          });

          resHeaders['Access-Control-Allow-Origin'] = '*';
          resHeaders['Access-Control-Allow-Headers'] = '*';
          resHeaders['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
          resHeaders['Content-Type'] = 'application/vnd.apple.mpegurl';

          res.writeHead(proxyRes.statusCode, resHeaders);
          res.end(rewrittenBody);
        });
      } else {
        // Copy headers to client response, bypassing security blocks and injecting CORS
        const resHeaders = {};
        Object.keys(proxyRes.headers).forEach(key => {
          const lowerKey = key.toLowerCase();
          if (!['content-security-policy', 'x-frame-options', 'access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods'].includes(lowerKey)) {
            resHeaders[key] = proxyRes.headers[key];
          }
        });

        resHeaders['Access-Control-Allow-Origin'] = '*';
        resHeaders['Access-Control-Allow-Headers'] = '*';
        resHeaders['Access-Control-Allow-Methods'] = 'GET, OPTIONS';

        res.writeHead(proxyRes.statusCode, resHeaders);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error(`[Proxy Error] for ${targetUrlStr}:`, err.message);
      if (res.headersSent) {
        if (!res.writableEnded) {
          res.destroy();
        }
        return;
      }
      res.writeHead(500, { 
        'Content-Type': 'text/plain', 
        'Access-Control-Allow-Origin': '*' 
      });
      res.end(`Proxy error: ${err.message}`);
    });

    proxyReq.end();

  } catch (err) {
    console.error(`[URL Parse Error] for ${targetUrlStr}:`, err.message);
    res.writeHead(400, { 
      'Content-Type': 'text/plain', 
      'Access-Control-Allow-Origin': '*' 
    });
    res.end(`Invalid proxy URL: ${err.message}`);
  }
}

// Quick verification server utility to check stream state
function verifyUrl(targetUrlStr, res) {
  let hasResponded = false;

  function sendResponse(jsonObj) {
    if (hasResponded) return;
    hasResponded = true;
    res.writeHead(200, { 
      'Content-Type': 'application/json', 
      'Access-Control-Allow-Origin': '*' 
    });
    res.end(JSON.stringify(jsonObj));
  }

  try {
    const targetUrl = new URL(targetUrlStr);
    const clientModule = targetUrl.protocol === 'https:' ? https : http;

    const reqOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      },
      timeout: 2500
    };

    const verifyReq = clientModule.request(targetUrl, reqOptions, (verifyRes) => {
      const isOnline = verifyRes.statusCode >= 200 && verifyRes.statusCode < 400;
      sendResponse({ online: isOnline, status: verifyRes.statusCode });
      verifyReq.destroy(); // Cancel stream download to save local/server bandwidth
    });

    verifyReq.on('error', (err) => {
      sendResponse({ online: false, error: err.message });
    });

    verifyReq.on('timeout', () => {
      sendResponse({ online: false, reason: 'timeout' });
      verifyReq.destroy();
    });

    verifyReq.end();
  } catch (err) {
    sendResponse({ online: false, error: err.message });
  }
}

// Main HTTP Server
const server = http.createServer((req, res) => {
  // Logger
  console.log(`${new Date().toISOString().substring(11, 19)} [AeroTV] ${req.method} ${req.url}`);

  // CORS Preflight headers
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  
  // 1. Verify Stream Endpoint Route
  if (parsedUrl.pathname === '/verify') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: 'Missing required "url" parameter.' }));
    }
    return verifyUrl(targetUrl, res);
  }

  // 2. CORS Proxy Endpoint Route
  if (parsedUrl.pathname === '/proxy') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      return res.end('Missing required "url" query parameter.');
    }
    return handleProxy(targetUrl, req, res);
  }

  // 2. Static File Serving Route
  let filePath = path.join(PUBLIC_DIR, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
  
  // Security check - prevent walking outside target folder
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden: Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // File not found, serve 404
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>404 Not Found | AeroTV</title>
          <style>
            body { background: #0a0f1d; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            h1 { color: #3b82f6; margin-bottom: 8px; }
            p { color: #94a3b8; margin-bottom: 24px; }
            a { color: #fff; background: #3b82f6; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; }
            a:hover { background: #60a5fa; }
          </style>
        </head>
        <body>
          <h1>404 File Not Found</h1>
          <p>The requested file could not be found on AeroTV.</p>
          <a href="/">Back to AeroTV Home</a>
        </body>
        </html>
      `);
    }

    // Serve static asset with appropriate Content-Type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('\n======================================================');
  console.log(`  AeroTV Server is running at: http://localhost:${PORT}`);
  console.log('======================================================');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('  To load streams bypass CORS restrictions, streams are');
  console.log('  served through http://localhost:3000/proxy?url=<url>');
  console.log('======================================================\n');
});
