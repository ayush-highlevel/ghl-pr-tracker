// GitHub API client that uses the serverless function
// instead of exposing the token in the frontend

/**
 * Makes a secure API call to GitHub via our serverless function
 * @param {string} endpoint - The Octokit endpoint (e.g., 'pulls.list')
 * @param {object} params - The parameters for the endpoint
 * @returns {Promise<object>} - The GitHub API response
 */
export const callGitHubApi = async (endpoint, params = {}) => {
  try {
    // When running locally with netlify dev, we need to use the local URL
    // When deployed to Netlify, we can use the relative path
    const baseUrl = process.env.NODE_ENV === 'development' 
      ? 'http://localhost:8888/.netlify/functions/github-api'
      : '/.netlify/functions/github-api';
    
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint,
        ...params
      })
    });

    // First check for non-OK response
    if (!response.ok) {
      try {
        const errorText = await response.text();
        try {
          // Try to parse as JSON if possible
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || `HTTP error ${response.status}`);
        } catch (jsonError) {
          // If not JSON, use the text directly
          throw new Error(`Server error (${response.status}): ${errorText.substring(0, 100)}...`);
        }
      } catch (textError) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
    }

    // Try to parse the response as JSON
    try {
      const responseText = await response.text();
      
      try {
        const data = JSON.parse(responseText);
        return data;
      } catch (jsonError) {
        throw new Error(`Invalid JSON response from server: ${jsonError.message}`);
      }
    } catch (error) {
      throw error;
    }
  } catch (error) {
    // Rethrow with a user-friendly message
    throw new Error(`GitHub API call failed: ${error.message}`);
  }
};

/**
 * Creates an object with the same interface as Octokit, but using our secure proxy
 * @returns {object} - A proxy Octokit-like object
 */
export const createSecureOctokit = () => {
  // Create a proxy object that mimics Octokit's structure
  return new Proxy({}, {
    get(target, namespace) {
      return new Proxy({}, {
        get(target, method) {
          return (params) => {
            // Return a proper Promise that can be chained
            return new Promise((resolve, reject) => {
              callGitHubApi(`${namespace}.${method}`, params)
                .then(response => {
                  // Unwrap the data from the Netlify function response
                  if (response && response.data) {
                    resolve({ 
                      data: response.data, 
                      headers: response.headers || {} 
                    });
                  } else {
                    // Handle unexpected response format
                    resolve({ 
                      data: [], 
                      headers: {} 
                    });
                  }
                })
                .catch(err => {
                  reject(err);
                });
            });
          };
        }
      });
    }
  });
}; 