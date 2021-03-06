const request = require('request')
const restify = require('restify')
const appStartCommand = require('./static/appStartCommand.json')
const pipelineCommand = require('./static/pipelineCommand.json')
const defaultHeader = require('./static/rapidDefaultHeader.json')

const RAPID_URL = process.env.SGCLOUD_RAPID_ADDRESS || 'https://sgxs-rapid2-dev.shopgate.services'
const PROXY_PORT = parseInt(process.env.PROXY_PORT) || 8090

class CliProxy {
  constructor (appSettings, logger) {
    this.appSettings = appSettings
    this.logger = logger
  }

  async start () {
    const splittedApplicationId = this.appSettings.getId().split('_')
    const ids = await this._getIdsFromRapid(RAPID_URL, splittedApplicationId[1])
    await this._startPipelineServer(PROXY_PORT, RAPID_URL, ids.sessionId, ids.deviceId, splittedApplicationId[1])
  }

  /**
   * Fetches session and deviceId from Rapid
   * @param rapidUrl
   * @param shopNumber
   * @private
   */
  _getIdsFromRapid (rapidUrl, shopNumber) {
    return new Promise((resolve, reject) => {
      appStartCommand.p.appIdentifier = `shop:${shopNumber}`

      const headers = {
        'sg-application-id': `shop_${shopNumber}`
      }
      Object.assign(headers, defaultHeader)
      const params = {
        url: rapidUrl,
        method: 'POST',
        headers,
        body: {
          cmds: [appStartCommand],
          ver: '1.2'
        },
        json: true,
        resolveWithFullResponse: true
      }
      request(params, (err, res, body) => {
        if (err) reject(err)
        if (!CliProxy._objectPathExists(res, 'body', 'cmds', 0, 'p', 'value') ||
            !CliProxy._objectPathExists(res, 'headers', 'sg-device-id')) {
          return reject(new Error('No response commands or no deviceId in header from rapid'))
        }
        resolve({
          sessionId: res.body.cmds[0].p.value,
          deviceId: res.headers['sg-device-id']
        })
      })
    })
  }

  /**
   * Starts a new pipelineserver
   * @param port
   * @param rapidUrl
   * @param sessionId
   * @param deviceId
   * @param shopNumber
   * @return {Promise}
   */
  _startPipelineServer (port, rapidUrl, sessionId, deviceId, shopNumber) {
    return new Promise((resolve, reject) => {
      if (this.server) return reject(new Error('server already running'))
      this.server = restify.createServer()

      this.server.use(restify.plugins.bodyParser({mapParams: false}))

      this.server.get('/status', (req, res) => res.send({status: 'is running'}))
      this.server.post('/pipelines/.*', this._getPipelineHandlerFunction(rapidUrl, sessionId, deviceId, shopNumber, false))
      this.server.post('/trustedPipelines/.*', this._getPipelineHandlerFunction(rapidUrl, sessionId, deviceId, shopNumber, true))

      this.server.listen(port, () => {
        this.logger.info(`Pipeline proxy is listening on ${port}`)
        resolve(this.server)
      })
    })
  }

  close () {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve()
      this.server.close(() => {
        this.server = null
        resolve()
      })
    })
  }

  _getPipelineHandlerFunction (rapidUrl, sessionId, deviceId, shopNumber, trusted) {
    /**
     * Forwards the request to the new rapid
     * @param {Object} req The request object.
     * @param {Object} res The response object.
     */
    return (req, res, next) => {
      const cmd = Object.assign({}, pipelineCommand)
      if (trusted) {
        cmd.p.type = 'trusted'
        cmd.p.name = req.url.replace('/trustedPipelines/', '')
      } else {
        cmd.p.type = 'normal'
        cmd.p.name = req.url.replace('/pipelines/', '')
      }
      cmd.p.input = req.body

      const body = {
        ver: '9.0',
        vars: { sid: sessionId },
        cmds: [cmd]
      }

      const headers = {
        'sg-application-id': `shop_${shopNumber}`,
        'sg-device-id': deviceId
      }
      Object.assign(headers, defaultHeader)

      const params = {
        url: rapidUrl,
        method: 'POST',
        headers,
        body,
        json: true,
        resolveWithFullResponse: true
      }
      return this._doRequest(params, res, next)
    }
  }

  /**
   * Check that the supplied arguments form a valid path in the object
   * @param {Object} obj
   * @param {...*} path
   * @returns {boolean}
   */
  static _objectPathExists (obj, ...path) {
    for (let i = 0; i < path.length; i++) {
      if (!obj || !obj.hasOwnProperty(path[i])) {
        return false
      }
      obj = obj[path[i]]
    }
    return true
  }

  /**
   * Does actual proxy request to the rapid server
   * @param {object} params
   * @param {object} res
   * @param next
   */
  _doRequest (params, res, next) {
    request(params, (err, response) => {
      if (err) {
        res.json(500, 'Could not connect to rapid')
        return next()
      }
      if (response.statusCode !== 200) {
        const errMsg = response.body ? (response.body.errors || response.body.message) : 'Error while proxing request'
        res.json(response.statusCode, errMsg)
        return next()
      }
      if (response.body.cmds[0].p.error) {
        res.json(500, {error: response.body.cmds[0].p.error})
        return next()
      }
      return res.json(response.body.cmds[0].p.output)
    })
  }
}

module.exports = CliProxy
