const fs = require('fs')
const os = require('os')
const path = require('path')
const ts = require('typescript')

const engineRoot = path.resolve(__dirname, '..')
const configPath = path.join(engineRoot, 'tsconfig.json')
const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
if (configFile.error) {
  console.error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  process.exit(1)
}

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeons-end-stage7-'))
const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  engineRoot,
  { outDir: outputDir, declaration: false, sourceMap: false },
  configPath,
)
const program = ts.createProgram(parsed.fileNames, parsed.options)
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length > 0) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => engineRoot,
    getNewLine: () => '\n',
  }))
  process.exit(1)
}

const emitResult = program.emit()
if (emitResult.emitSkipped) {
  console.error('Stage 7 test compilation was skipped.')
  process.exit(1)
}
require(path.join(outputDir, 'tests', 'stage1.test.js'))
require(path.join(outputDir, 'tests', 'stage2.test.js'))
require(path.join(outputDir, 'tests', 'stage3.test.js'))
require(path.join(outputDir, 'tests', 'stage4.test.js'))
require(path.join(outputDir, 'tests', 'stage7.test.js'))
require(path.join(outputDir, 'tests', 'stage8.test.js'))
require(path.join(outputDir, 'tests', 'card-movement.test.js'))
require(path.join(outputDir, 'tests', 'wave9-nook.test.js'))
require(path.join(outputDir, 'tests', 'wave9-indira.test.js'))
require(path.join(outputDir, 'tests', 'wave9-inco.test.js'))
require(path.join(outputDir, 'tests', 'wave9-dezmodia.test.js'))
require(path.join(outputDir, 'tests', 'wave9-qu.test.js'))
require(path.join(outputDir, 'tests', 'wave9-tressa.test.js'))
require(path.join(outputDir, 'tests', 'wave9-yanmagda.test.js'))
require(path.join(outputDir, 'tests', 'wave9-pulse-recall.test.js'))
require(path.join(outputDir, 'tests', 'wave9-develop.test.js'))
require(path.join(outputDir, 'tests', 'wave9-trinkets.test.js'))
require(path.join(outputDir, 'tests', 'wave9-gems.test.js'))
require(path.join(outputDir, 'tests', 'wave9-spells.test.js'))
require(path.join(outputDir, 'tests', 'wave9-relics.test.js'))
require(path.join(outputDir, 'tests', 'wave9-crooked-mask.test.js'))
require(path.join(outputDir, 'tests', 'wave9-oracle-of-filth.test.js'))
