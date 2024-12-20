const http = require('http');
const httpProxy = require('http-proxy');
const zlib = require('zlib');

const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'https://elpais.com';
const proxyBaseUrl = `https://pais.samengal.xyz`;
const PORT = process.env.PORT;

if (!PORT) {
  throw new Error('PORT environment variable is required');
}

const proxy = httpProxy.createProxyServer({
  secure: false,
  selfHandleResponse: true,
});

proxy.on('proxyRes', (proxyRes, req, res) => {
  let bodyChunks = [];

  proxyRes.on('data', (chunk) => {
    bodyChunks.push(chunk);
  });

  proxyRes.on('end', () => {
    const buffer = Buffer.concat(bodyChunks);

    if (proxyRes.headers['content-encoding'] === 'gzip') {
      zlib.gunzip(buffer, (err, decoded) => {
        if (err) {
          console.error('Error decompressing gzipped response:', err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error processing the response.');
          return;
        }

        handleResponse(decoded.toString(), proxyRes, req, res);
      });
    } else {
      handleResponse(buffer.toString(), proxyRes, req, res);
    }
  });
});

function handleResponse(body, proxyRes, req, res) {
  if (
    proxyRes.headers['content-type'] &&
    proxyRes.headers['content-type'].includes('text/html')
  ) {

    body = body
      .replace(/https:\/\/elpais\.com/g, proxyBaseUrl)
      .replace(
        /<script[^>]*src="https:\/\/static\.elpais\.com\/dist\/resources\/js\/[^"]*\/ENP-article\.js"[^>]*><\/script>/g,
        ''
      )

    const acceptEncoding = req.headers['accept-encoding'] || '';
    if (acceptEncoding.includes('gzip')) {
      zlib.gzip(body, (err, compressed) => {
        if (err) {
          console.error('Error compressing response:', err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error processing the response.');
          return;
        }

        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'content-encoding': 'gzip',
          'content-length': compressed.length,
        });
        res.end(compressed);
      });
    } else {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'content-encoding': undefined,
        'content-length': Buffer.byteLength(body),
      });
      res.end(body);
    }
  } else {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    res.end(body);
  }
}


proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  res.writeHead(500, { 'Content-Type': 'text/plain' });
  res.end('Proxy encountered an error.');
});

http.createServer((req, res) => {
  try {
    const targetUrl = new URL(req.url, TARGET_DOMAIN);

    console.log(`Proxying request to: ${targetUrl.href}`);

    req.headers['host'] = new URL(TARGET_DOMAIN).host;
    req.headers['referer'] = TARGET_DOMAIN;
    req.headers['accept-encoding'] = 'gzip';

    proxy.web(req, res, { target: targetUrl.href }, (err) => {
      console.error('Proxy forwarding error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('An error occurred.');
    });
  } catch (err) {
    console.error('Error constructing target URL:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('An error occurred while constructing the target URL.');
  }
}).listen(PORT, () => {
  console.log('Proxy server running on http://localhost:' + PORT);
});
