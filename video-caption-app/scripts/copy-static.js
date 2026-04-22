const fs = require("fs");
const path = require("path");

const outDir = path.resolve(__dirname, "..", "dist");
const staticFiles = ["app-logo.svg", "index.html", "styles.css"];

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const fileName of staticFiles) {
  const sourcePath = path.resolve(__dirname, "..", "src", fileName);
  const outputPath = path.resolve(outDir, fileName);
  fs.copyFileSync(sourcePath, outputPath);
  console.log(`Copied ${sourcePath} -> ${outputPath}`);
}
