export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
