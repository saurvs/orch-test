const express = require('express')
const request = require('request')
const { execSync } = require('child_process')
const app = express()

const orch_port = 80

let start_port = 8000
let current_rr_port = start_port
let highest_port = start_port - 1
let reqs_count = 0
let container_count = 0
let container_name = 'acts'

container_ids = {}

app.get('/', function(req, res) {
  res.send('')
})

function getNextHost() {
  let host = `http://localhost:${current_rr_port}`
  current_rr_port += 1
  if (current_rr_port > highest_port) {
    current_rr_port = start_port
  }
  return host
}

let autoscale_started = false

app.get('/api/v1/categories', function(req, res) {
  reqs_count += 1
  if (!autoscale_started) {
    autoscale_started = true
    setInterval(autoscale, 1000 * 60 * 2);
  }
  request
    .get(getNextHost() + '/api/v1/categories')
    .on('response', (_) => {
      res.send('cool')
    })
})

function checkHealth() {
  for (let p = start_port; p <= highest_port; p++) {
    let health_check_route = 'http://localhost:' + p + '/api/v1/_health'
    request(health_check_route, function (_, response, _) {
      if (!response || response.statusCode != 200) {
        if (response !== undefined) {
          execSync(`sudo docker kill ${container_ids[p]}`)
        }
        container_ids[p] =
          execSync(`sudo docker run -d -p ${p}:8888 ${container_name}`)
          .toString().trim()
        execSync(`sleep 1`) // wait for container to start
      }
    });
  }
}

function autoscale() {
  let containers_needed = Math.floor(reqs_count / 20 /*5*/) + 1
  if (containers_needed > container_count) {
    for (let i = container_count; i < containers_needed; i++) {
      highest_port += 1
      container_ids[highest_port] =
        execSync(`sudo docker run -d -p ${highest_port}:8888 ${container_name}`)
        .toString().trim()
      execSync(`sleep 1`) // wait for container to start
      container_count += 1
    }
  } else if (containers_needed < container_count) {
    for (let i = container_count; i > containers_needed; i--) {
      execSync(`sudo docker kill ${container_ids[highest_port]}`)
      execSync(`sleep 1`) // wait for container to stop
      highest_port -= 1
      container_count -= 1
    }
  }
  reqs_count = 0
}

process.on('SIGINT', () => {
  for (let i = start_port; i <= highest_port; i++) {
    execSync(`sudo docker kill ${container_ids[highest_port]}`)
  }
  process.exit(0)
});

autoscale();

setInterval(checkHealth, 1000); // in milliseconds

app.listen(orch_port)