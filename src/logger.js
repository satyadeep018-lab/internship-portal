'use strict';

// One JSON object per line on stdout. Easy to read in a terminal and easy for hosting platforms to search.
// Callers pass only safe, named fields (ids, status codes, timings). Never pass request bodies, headers or applicant data.
function log(level, msg, fields = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
}

module.exports = {
  log,
  info: (msg, fields) => log('info', msg, fields),
  warn: (msg, fields) => log('warn', msg, fields),
  error: (msg, fields) => log('error', msg, fields)
};
