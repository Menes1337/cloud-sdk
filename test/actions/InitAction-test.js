const InitAction = require('../../lib/actions/InitAction')
const assert = require('assert')
const UserSettings = require('../../lib/user/UserSettings')
const AppSettings = require('../../lib/app/AppSettings')
const path = require('path')
const userSettingsFolder = path.join('test', 'usersettings')
const appPath = path.join('test', 'appsettings')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const sinon = require('sinon')

describe('InitAction', () => {
  it('should register', () => {
    const commander = {}
    commander.command = sinon.stub().returns(commander)
    commander.description = sinon.stub().returns(commander)
    commander.option = sinon.stub().returns(commander)
    commander.action = sinon.stub().returns(commander)

    new InitAction().register(commander)

    assert(commander.command.calledWith('init'))
    assert(commander.option.calledWith('--appId <appId>'))
    assert(commander.description.calledOnce)
    assert(commander.action.calledOnce)
  })

  beforeEach(() => {
    process.env.USER_PATH = userSettingsFolder
  })

  afterEach((done) => {
    UserSettings.setInstance()
    delete process.env.USER_PATH
    rimraf(userSettingsFolder, done)
  })

  it('should throw if user not logged in', (done) => {
    UserSettings.getInstance().getSession().token = null
    const init = new InitAction()
    try {
      init.run()
    } catch (err) {
      assert.equal(err.message, 'not logged in')
      done()
    }
  })

  it('should throw if application already initialized', (done) => {
    UserSettings.getInstance().getSession().token = {}
    const appId = 'foobarTest'

    process.env.APP_PATH = appPath
    const appSettings = new AppSettings()
    mkdirp.sync(path.join(appPath, AppSettings.SETTINGS_FOLDER))
    appSettings.setId(appId).save().init()
    AppSettings.setInstance(appSettings)

    const init = new InitAction()

    let wasCatched = false
    try {
      init.run()
    } catch (err) {
      wasCatched = true
      assert.equal(err.message, `The current folder is already initialized for application ${appId}`)
    }

    assert.ok(wasCatched)
    delete process.env.APP_PATH
    AppSettings.setInstance()
    rimraf(appPath, done)
  })

  it('should create folders, settings file and save appId', (done) => {
    AppSettings.setInstance()
    process.env.APP_PATH = appPath
    UserSettings.getInstance().getSession().token = {}

    const init = new InitAction()

    init.run({appId: 'test'}, () => {
      delete process.env.APP_PATH
      AppSettings.setInstance()
      rimraf(appPath, done)
    })
  })

  describe('getAppId', () => {
    it('should return appId if already set in options', (done) => {
      const init = new InitAction()
      const appId = 'test'
      init.options = {appId}
      init.getAppId(null, (err, id) => {
        assert.ifError(err)
        assert.equal(id, appId)
        done()
      })
    })

    it('should use prompt for appId if not set in options', (done) => {
      const init = new InitAction()
      const appId = 'test'
      init.options = {}

      function prompt (questions) {
        assert.equal(questions.length, 1)
        assert.deepEqual(questions[0], {type: 'input', name: 'appId', message: 'Enter your Application ID:'})
        return Promise.resolve({appId})
      }

      init.getAppId(prompt, (err, id) => {
        assert.ifError(err)
        assert.equal(id, appId)
        done()
      })
    })
  })
})
