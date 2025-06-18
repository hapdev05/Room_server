const logger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`[${timestamp}] ${method} ${url} - IP: ${ip}`);
  
  // Log request body for POST/PUT requests (excluding sensitive data)
  if (method === 'POST' || method === 'PUT') {
    const logBody = { ...req.body };
    // Remove sensitive information from logs
    if (logBody.password) delete logBody.password;
    if (logBody.token) delete logBody.token;
    console.log(`Request Body:`, logBody);
  }
  
  next();
};

module.exports = logger; 