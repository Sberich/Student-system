const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const sourcePath = path.join(__dirname, 'Code.js');
const outputPath = path.join(__dirname, '..', 'backend-clean', 'Code.js');

console.log('Reading source Code.js from:', sourcePath);
const code = fs.readFileSync(sourcePath, 'utf8');

console.log('Obfuscating Code.js...');
const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.6,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 10,
  renameGlobals: false,
  reservedNames: [
    '^doGet$',
    '^doPost$',
    '^onOpen$',
    '^initSheets$',
    '^initGradebookSheet$',
    '^setSecurityPinPrompt$',
    '^resetScoresMenuAction$',
    '^seedSampleData$',
    '^createMasterLicenseSheetMenuAction$',
    '^prepareCleanTemplateMenuAction$'
  ]
});

const obfuscatedCode = obfuscationResult.getObfuscatedCode();

console.log('Writing obfuscated Code.js to:', outputPath);
fs.writeFileSync(outputPath, obfuscatedCode, 'utf8');
console.log('Success! Obfuscated size:', (obfuscatedCode.length / 1024).toFixed(2), 'KB');
