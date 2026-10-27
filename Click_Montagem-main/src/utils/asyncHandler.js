function asyncHandler(fn) {
    return function AsyncRouteWrapper(req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = asyncHandler;
