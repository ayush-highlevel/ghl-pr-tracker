// Simple test function
exports.handler = async function(event, context) {
  console.log('Test function invoked');
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Netlify Functions are working correctly',
      timestamp: new Date().toISOString(),
      env: {
        nodeEnv: process.env.NODE_ENV,
        hasGithubToken: !!process.env.GITHUB_TOKEN
      }
    })
  };
}; 