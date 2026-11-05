import fs from 'node:fs';
import path from 'node:path';

const API_KEY = process.env.STITCH_API_KEY || '';
const PROJECT_ID = '17660093246709247592';
const SCREEN_IDS = [
  'a36a97cb0da0461abf3eab4fd18c6401',
  'a6fcb9e275704a248b8147f9c196ce1e',
  '538d6cfca68c4649b26cc902392cffec',
  'c106c291b47c485ab8250a52c18d5f28',
];

const outDir = path.resolve('stitch');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

async function run() {
  const summary = [];
  for (const screenId of SCREEN_IDS) {
    console.log(`Fetching metadata for screen ${screenId}...`);
    const screenRes = await fetch(
      `https://stitch.googleapis.com/v1/projects/${PROJECT_ID}/screens/${screenId}`,
      {
        headers: {
          'X-Goog-Api-Key': API_KEY,
        },
      }
    );
    if (!screenRes.ok) {
      console.error(`Error fetching screen ${screenId}:`, screenRes.status, await screenRes.text());
      continue;
    }
    const data = await screenRes.json();
    fs.writeFileSync(
      path.join(outDir, `${screenId}.json`),
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    console.log(`Title: ${data.title}`);
    console.log(`HTML URL: ${data.htmlCode?.downloadUrl}`);
    console.log(`Screenshot URL: ${data.screenshot?.downloadUrl}`);

    if (data.htmlCode?.downloadUrl) {
      console.log(`Downloading HTML for ${screenId}...`);
      await downloadFile(data.htmlCode.downloadUrl, path.join(outDir, `${screenId}.html`));
    }
    if (data.screenshot?.downloadUrl) {
      console.log(`Downloading Screenshot for ${screenId}...`);
      await downloadFile(data.screenshot.downloadUrl, path.join(outDir, `${screenId}.png`));
    }

    summary.push({
      id: screenId,
      title: data.title,
      width: data.width,
      height: data.height,
      prompt: data.prompt,
    });
  }

  fs.writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf-8'
  );
  console.log('All screens downloaded successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

