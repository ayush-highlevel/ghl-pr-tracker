# GitHub PR Tracker

A React application for tracking pull requests in GitHub repositories with secure handling of GitHub tokens.

## Local Development

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables by creating a `.env` file (see `.env.sample` for required variables)

3. Run the development server with Netlify Functions:
   ```
   npm run dev
   ```

## Deploying to Netlify

### Option 1: Deploy via Netlify Dashboard

1. Push your code to a GitHub repository

2. Log in to [Netlify](https://app.netlify.com/)

3. Click "Add new site" → "Import an existing project"

4. Connect to your GitHub repository

5. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `build`

6. Configure environment variables:
   - Go to Site settings → Environment variables
   - Add all variables from your `.env` file, including `GITHUB_TOKEN`

7. Deploy your site

### Option 2: Deploy via Netlify CLI

1. Install Netlify CLI globally if not already installed:
   ```
   npm install -g netlify-cli
   ```

2. Login to Netlify:
   ```
   netlify login
   ```

3. Initialize your site:
   ```
   netlify init
   ```
   - Select "Create & configure a new site"
   - Follow the prompts to connect to your team and create a site

4. Deploy your site:
   ```
   netlify deploy --prod
   ```

5. Set up environment variables:
   ```
   netlify env:import .env
   ```
   Or set them manually:
   ```
   netlify env:set GITHUB_TOKEN your_github_token
   ```

## Features

- Secure GitHub token handling using Netlify Functions
- Pull request tracking for teams
- Slack integration for PR discussions
- Firebase authentication with GitHub
- Organization membership validation

## License

MIT

## Contact

For issues or feature requests, please contact the development team.
