# GitHub PR Tracker

A web application for tracking and managing GitHub pull requests for your team. This application allows you to see all open PRs for your organization/team, filter them by various criteria, and check their review status.

## Features

- GitHub OAuth integration using Firebase Authentication
- Track open pull requests across multiple repositories
- Filter PRs by author, reviewer, and repository
- View PR review status, mergeable state, and other details
- Manage team members and repository selection

## Setup

### Prerequisites

- Node.js (v14 or later)
- NPM or Yarn
- GitHub account with access to the repositories you want to track
- Firebase account

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the wizard to create a new project
3. Once the project is created, click "Web" (</>) to add a web app
4. Register the app with a nickname and click "Register app"
5. Copy the Firebase configuration object for the next steps

### 2. Enable GitHub Authentication in Firebase

1. In Firebase Console, go to "Authentication" → "Sign-in method"
2. Click on "GitHub" provider and enable it
3. You'll need to set up a GitHub OAuth App:
   - Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
   - For the Authorization callback URL, use the one provided by Firebase 
     (should look like `https://your-project.firebaseapp.com/__/auth/handler`)
   - Copy the Client ID and Client Secret to Firebase
   - Save both in GitHub and Firebase

### 3. Local Development Setup

1. Clone the repository:
   ```
   git clone https://github.com/your-username/github-pr-tracker.git
   cd github-pr-tracker
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with your Firebase configuration:
   ```
   HL_GITHUB_APP_FIREBASE_API_KEY=your_api_key
   HL_GITHUB_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   HL_GITHUB_APP_FIREBASE_PROJECT_ID=your_project_id
   HL_GITHUB_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   HL_GITHUB_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   HL_GITHUB_APP_FIREBASE_APP_ID=your_app_id
   ```

4. Start the application:
   ```
   npm start
   ```

## Deployment to GitHub Pages

### Using GitHub Actions

1. In your GitHub repository, go to "Settings" > "Environments" > "New environment"
2. Name it `github-pages`
3. Add the following secrets (same as your Firebase configuration):
   - `HL_GITHUB_APP_FIREBASE_API_KEY`
   - `HL_GITHUB_APP_FIREBASE_AUTH_DOMAIN`
   - `HL_GITHUB_APP_FIREBASE_PROJECT_ID`
   - `HL_GITHUB_APP_FIREBASE_STORAGE_BUCKET`
   - `HL_GITHUB_APP_FIREBASE_MESSAGING_SENDER_ID`
   - `HL_GITHUB_APP_FIREBASE_APP_ID`

4. Push your code to GitHub. The GitHub Actions workflow will automatically deploy your app to GitHub Pages with the correct environment variables.

### Manual Deployment

1. Set environment variables in your shell:
   ```
   export HL_GITHUB_APP_FIREBASE_API_KEY=your_api_key
   export HL_GITHUB_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   # ... set all other Firebase variables
   ```

2. Run the deploy script:
   ```
   npm run deploy
   ```

## Usage

1. Navigate to the deployed application
2. Click "Login with GitHub"
3. Authorize the application to access your GitHub account
4. Configure your team members (GitHub usernames)
5. Select repositories to track
6. View and filter pull requests

## License

MIT

## Contact

For issues or feature requests, please contact the development team.
