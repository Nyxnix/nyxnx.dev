import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const outputDirName = process.env.BUILD_OUT_DIR ?? 'dist';
const outDir = path.join(rootDir, outputDirName);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(rootDir, 'src/main.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  minify: true,
  target: ['es2018'],
  outfile: path.join(outDir, 'app.js'),
  loader: {
    '.svg': 'dataurl'
  }
});

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://api.github.com https://avatars.githubusercontent.com https://raw.githubusercontent.com https://*.githubusercontent.com ws: wss:;"
    />
    <title>nyx's home</title>
    <link rel="stylesheet" href="./app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script defer src="./app.js"></script>
  </body>
</html>
`;

await writeFile(path.join(outDir, 'index.html'), html, 'utf8');
console.log(`Panel build complete: ${outputDirName}/index.html + ${outputDirName}/app.js`);
