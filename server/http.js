export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index) === name) {
      return decodeURIComponent(part.slice(index + 1));
    }
  }
  return null;
}
