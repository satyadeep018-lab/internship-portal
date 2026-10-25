(function (root) {
  'use strict';

  // These rules mirror src/validation.js on the server. A test checks that both agree.
  // The client check is for quick feedback only; the server always validates again.
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var CONTROL_RE = /[\u0000-\u001f\u007f]/;

  function textProblem(value, label, min, max) {
    var v = String(value).trim();
    if (v.length < min || v.length > max) return label + ' must be between ' + min + ' and ' + max + ' characters.';
    if (CONTROL_RE.test(v)) return label + ' contains invalid characters.';
    return '';
  }

  function webUrlProblem(value) {
    var bad = 'Enter a link that starts with http:// or https://.';
    var v = String(value);
    if (v.length > 2048) return bad;
    var u;
    try { u = new URL(v.trim()); } catch (e) { return bad; }
    if (['http:', 'https:'].indexOf(u.protocol) === -1 || u.username || u.password) return bad;
    return '';
  }

  // Returns an object of field -> message. Empty object means the form is valid.
  function validateApplicationForm(values) {
    var errors = {};
    var nameProblem = textProblem(values.name, 'Name', 2, 100);
    if (nameProblem) errors.name = String(values.name).trim() === '' ? 'Enter your full name.' : nameProblem;

    var email = String(values.email).trim();
    if (email === '') errors.email = 'Enter your email address.';
    else {
      var emailProblem = textProblem(email, 'Email', 3, 254);
      if (emailProblem) errors.email = emailProblem;
      else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address, like name@example.com.';
    }

    var url = String(values.url);
    if (url.trim() !== '') {
      var urlProblem = webUrlProblem(url);
      if (urlProblem) errors.url = urlProblem;
    }
    return errors;
  }

  var api = { validateApplicationForm: validateApplicationForm };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof window !== 'undefined' ? window : globalThis);
