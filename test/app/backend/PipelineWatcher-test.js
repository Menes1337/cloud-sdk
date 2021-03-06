const assert = require('assert')
const path = require('path')
const fsEx = require('fs-extra')
const PipelineWatcher = require('../../../lib/app/backend/PipelineWatcher')
const utils = require('../../../lib/utils/utils')
const AppSettings = require('../../../lib/app/AppSettings')

const appPath = path.join('build', 'appsettings')

describe('PipelineWatcher', () => {
  let pipelineWatcher
  let extensionsPipelineFolder

  beforeEach(() => {
    process.env.APP_PATH = appPath
    extensionsPipelineFolder = path.join(utils.getApplicationFolder(), AppSettings.EXTENSIONS_FOLDER, 'testExtension', 'pipelines')
    pipelineWatcher = new PipelineWatcher({getApplicationFolder: utils.getApplicationFolder})
    return fsEx.emptyDir(extensionsPipelineFolder)
  })

  afterEach(() => delete process.env.APP_PATH)

  it('should emit changed pipeline', (done) => {
    const pipelinePath = path.join(extensionsPipelineFolder, 'somePipeline.json')

    pipelineWatcher.start().then(() => {
      pipelineWatcher.on('all', (event, file) => {
        assert.equal(event, 'add')
        assert.equal(file, pipelinePath)
        pipelineWatcher.close().then(() => done())
      })

      fsEx.writeJson(pipelinePath, {someAttribtue: '2'}, (err) => { assert.ifError(err) })
    })
  })

  it('should stop watching', () => {
    return pipelineWatcher.start().then(() => {
      pipelineWatcher.close().then(() => assert.ok(pipelineWatcher.watcher.closed))
    })
  })
})
