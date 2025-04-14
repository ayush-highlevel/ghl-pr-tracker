// GitHub API Proxy
const { Octokit } = require('@octokit/rest');

// Simple in-memory rate limiting (for production consider using Redis or a dedicated service)
const rateLimiter = {
  requests: {},
  maxRequests: 60, // Maximum requests per minute
  timeWindow: 60 * 1000, // 1 minute in milliseconds
  
  isRateLimited(ip) {
    const now = Date.now();
    
    // Clean up old entries
    for (const clientIp in this.requests) {
      if (this.requests[clientIp].timestamp < now - this.timeWindow) {
        delete this.requests[clientIp];
      }
    }
    
    if (!this.requests[ip]) {
      this.requests[ip] = {
        count: 1,
        timestamp: now
      };
      return false;
    }
    
    // If the client has made too many requests within the time window, rate limit them
    if (this.requests[ip].count >= this.maxRequests) {
      return true;
    }
    
    // Increment the request count
    this.requests[ip].count++;
    return false;
  }
};

exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }

  // Get client IP for rate limiting
  const clientIp = event.headers['client-ip'] || 
                   event.headers['x-forwarded-for'] || 
                   'unknown-ip';

  // Check rate limiting
  if (rateLimiter.isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ 
        error: 'Too many requests. Please try again later.',
        status: 429
      })
    };
  }

  try {
    // Get request body or query parameters
    let data;
    try {
      data = event.httpMethod === 'POST' 
        ? JSON.parse(event.body) 
        : event.queryStringParameters;
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid request data',
          details: parseError.message
        })
      };
    }

    // Validate required parameters
    if (!data || !data.endpoint) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }

    // Validate GitHub token
    if (!process.env.GITHUB_TOKEN) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error: GitHub token not available' })
      };
    }

    // Create Octokit instance with the server-side token
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      request: {
        timeout: 10000 // 10 second timeout
      }
    });

    // Extract endpoint parts (e.g., "pulls.list")
    const [namespace, method] = data.endpoint.split('.');
    
    // Validate namespace and method exist in Octokit
    if (!octokit[namespace] || !octokit[namespace][method]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Invalid endpoint: ${namespace}.${method}` })
      };
    }
    
    // Remove endpoint from params
    const { endpoint, ...params } = data;

    try {
      // Make the GitHub API call
      const response = await octokit[namespace][method](params);
      
      // Ensure the data structure matches Octokit's expected structure
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          data: response.data || [],
          headers: response.headers || {}
        })
      };
    } catch (githubError) {
      // Log error in production environment
      if (process.env.NODE_ENV === 'production') {
        console.error(`GitHub API error: ${githubError.message}`);
      }
      
      // Return a properly formatted error response
      return {
        statusCode: githubError.status || 500,
        headers,
        body: JSON.stringify({
          error: githubError.message,
          status: githubError.status || 500,
          details: githubError.response?.data
        })
      };
    }
  } catch (error) {
    // Log error in production environment
    if (process.env.NODE_ENV === 'production') {
      console.error(`General error: ${error.message}`);
    }
    
    // Format the error response
    const errorResponse = {
      error: error.message || 'Unknown error',
      status: error.status || 500
    };
    
    return {
      statusCode: error.status || 500,
      headers,
      body: JSON.stringify(errorResponse)
    };
  }
}; 