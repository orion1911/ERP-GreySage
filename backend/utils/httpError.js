// An error carrying an HTTP status that middleware/error.js returns verbatim to the client.
// Use for expected business-rule failures (validation, conflicts). Anything thrown as a
// plain Error still falls through to the generic 500 handler.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.isHttpError = true;
  }
}

module.exports = { HttpError };
