export function createMockReq({ body = {}, params = {}, appLocals = {} } = {}) {
  return {
    body,
    params,
    app: {
      locals: appLocals,
    },
  };
}

export function createMockRes() {
  return {
    statusCode: 200,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
  };
}
